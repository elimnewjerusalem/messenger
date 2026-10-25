// The sending engine: audiences, campaigns, the queue, schedules, birthdays and the Meta webhook.
import { now, ist, hmToMinutes, COST } from './util.js';
import { isDemo, sendTemplate, sendText } from './meta.js';

/* ---------- settings ---------- */

export async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key,value FROM settings').all();
  const s = {};
  for (const r of results) s[r.key] = r.value;
  return s;
}

/* ---------- audience ---------- */

// Builds the WHERE part. Every list goes in as ONE json parameter (D1 allows only 100 parameters).
export function audienceWhere(f, params) {
  f = f || {};
  const w = ['valid=1', 'optin!=-1'];
  if (f.ids && f.ids.length) { w.push('id IN (SELECT j.value FROM json_each(?) j)'); params.push(JSON.stringify(f.ids)); }
  if (f.groups && f.groups.length) {
    w.push('EXISTS (SELECT 1 FROM json_each(contacts.groups) g WHERE g.value IN (SELECT j.value FROM json_each(?) j))');
    params.push(JSON.stringify(f.groups));
  }
  if (f.areas && f.areas.length) { w.push('area IN (SELECT j.value FROM json_each(?) j)'); params.push(JSON.stringify(f.areas)); }
  if (f.languages && f.languages.length) { w.push('language IN (SELECT j.value FROM json_each(?) j)'); params.push(JSON.stringify(f.languages)); }
  if (f.optin === 'yes') w.push('optin=1');
  if (f.bdayMonth) { w.push('substr(bday,1,2)=?'); params.push(String(f.bdayMonth).padStart(2, '0')); }
  return w.join(' AND ');
}

export async function audienceCount(env, filter) {
  const params = [];
  const where = audienceWhere(filter, params);
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE ${where}`).bind(...params).first();
  return r.n;
}

export function costRange(count, category) {
  const [lo, hi] = COST[category] || COST.MARKETING;
  return [Math.round(count * lo), Math.round(count * hi)];
}

/* ---------- campaigns ---------- */

export async function createCampaign(env, { title, template_id, filter, source = 'manual' }) {
  const t = now();
  const params = [];
  const where = audienceWhere(filter, params);
  const c = await env.DB.prepare(
    'INSERT INTO campaigns (title,template_id,filter,status,total,source,created) VALUES (?,?,?,?,0,?,?) RETURNING id'
  ).bind(title, template_id, JSON.stringify(filter || {}), 'sending', source, t).first();
  await env.DB.prepare(
    `INSERT INTO messages (campaign_id,contact_id,phone,name,status,updated)
     SELECT ?, id, phone, name, 'queued', ? FROM contacts WHERE ${where}`
  ).bind(c.id, t, ...params).run();
  const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE campaign_id=?').bind(c.id).first()).n;
  await env.DB.prepare('UPDATE campaigns SET total=?, status=? WHERE id=?').bind(total, total ? 'sending' : 'done', c.id).run();
  return { id: c.id, total };
}

export async function campaignStats(env, id) {
  const { results } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM messages WHERE campaign_id=? GROUP BY status').bind(id).all();
  const s = { queued: 0, sending: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
  for (const r of results) s[r.status] = r.n;
  // "sent" counts everything that has left us, delivered and read included.
  const out = {
    queued: s.queued + s.sending,
    sent: s.sent + s.delivered + s.read,
    delivered: s.delivered + s.read,
    read: s.read,
    failed: s.failed
  };
  return out;
}

/* ---------- the queue ---------- */

const FILL = (c, links) => ({
  name: c.name || '',
  group: (() => { try { return JSON.parse(c.groups || '[]').join(', '); } catch (e) { return ''; } })(),
  area: c.area || '',
  website: links.website || '',
  youtube: links.youtube || ''
});

export async function processQueue(env, limit) {
  const settings = await getSettings(env);
  const perMinute = limit || Math.max(1, Math.min(40, parseInt(settings.per_minute || '20', 10)));
  const t = now();

  // Anything stuck half-way for 5 minutes is marked failed (we cannot know if it left).
  await env.DB.prepare("UPDATE messages SET status='failed', error='Interrupted, retry it', updated=? WHERE status='sending' AND updated<?")
    .bind(t, t - 300).run();

  // Claim a batch atomically so two runs never send the same message twice.
  const claimed = await env.DB.prepare(
    `UPDATE messages SET status='sending', updated=?
     WHERE id IN (SELECT m.id FROM messages m JOIN campaigns c ON c.id=m.campaign_id
                  WHERE m.status='queued' AND c.status='sending' ORDER BY m.id LIMIT ?)
     RETURNING id, campaign_id, contact_id, phone, name`
  ).bind(t, perMinute).all();
  const rows = claimed.results || [];
  if (!rows.length) return { sent: 0 };

  const tplCache = {};
  const campCache = {};
  const contactCache = {};
  const loadContacts = async (ids) => {
    const need = ids.filter((i) => !(i in contactCache));
    if (!need.length) return;
    const { results } = await env.DB.prepare('SELECT id,name,groups,area FROM contacts WHERE id IN (SELECT j.value FROM json_each(?) j)')
      .bind(JSON.stringify(need)).all();
    for (const r of results) contactCache[r.id] = r;
  };
  await loadContacts([...new Set(rows.map((r) => r.contact_id))]);

  const stmts = [];
  let okCount = 0;
  for (const m of rows) {
    if (!(m.campaign_id in campCache)) {
      campCache[m.campaign_id] = await env.DB.prepare('SELECT id,template_id FROM campaigns WHERE id=?').bind(m.campaign_id).first();
    }
    const camp = campCache[m.campaign_id];
    if (!(camp.template_id in tplCache)) {
      tplCache[camp.template_id] = await env.DB.prepare('SELECT * FROM templates WHERE id=?').bind(camp.template_id).first();
    }
    const tpl = tplCache[camp.template_id];
    const contact = contactCache[m.contact_id] || { name: m.name, groups: '[]', area: '' };
    let res;
    if (!tpl) res = { ok: false, error: 'Template was deleted' };
    else if (!isDemo(env) && tpl.status !== 'APPROVED') res = { ok: false, error: 'Template is not approved by Meta yet' };
    else res = await sendTemplate(env, m.phone, tpl, FILL(contact, settings));
    const ts = now();
    if (res.ok) {
      okCount++;
      stmts.push(env.DB.prepare("UPDATE messages SET status='sent', wamid=?, error='', updated=? WHERE id=?").bind(res.wamid, ts, m.id));
      stmts.push(env.DB.prepare('UPDATE contacts SET last_sent=? WHERE id=?').bind(ts, m.contact_id));
    } else {
      stmts.push(env.DB.prepare("UPDATE messages SET status='failed', error=?, updated=? WHERE id=?").bind(String(res.error || 'Failed').slice(0, 300), ts, m.id));
    }
  }
  stmts.push(env.DB.prepare(
    `UPDATE campaigns SET status='done' WHERE status='sending'
       AND NOT EXISTS (SELECT 1 FROM messages WHERE campaign_id=campaigns.id AND status IN ('queued','sending'))`));
  await env.DB.batch(stmts);
  return { sent: okCount, failed: rows.length - okCount };
}

// In demo mode there is no Meta to report back, so pretend messages arrive and some get read.
export async function demoProgress(env) {
  if (!isDemo(env)) return;
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE messages SET status='delivered', updated=? WHERE status='sent' AND wamid LIKE 'demo.%' AND updated<?").bind(t, t - 3),
    env.DB.prepare("UPDATE messages SET status='read', updated=? WHERE status='delivered' AND wamid LIKE 'demo.%' AND updated<? AND id%3=0").bind(t, t - 20)
  ]);
}

/* ---------- schedules and birthdays ---------- */

function firstDowOfMonth(dom, dow, target) {
  // true when today is the first <target> weekday of the month
  return dow === target && dom <= 7;
}

export async function runSchedules(env) {
  const n = ist();
  const { results } = await env.DB.prepare('SELECT * FROM schedules WHERE enabled=1').all();
  const created = [];
  for (const s of results) {
    if (s.last_run === n.ymd) continue;
    const at = hmToMinutes(s.at);
    if (n.minutes < at || n.minutes - at > 180) continue; // only within 3 hours after the set time
    let due = false;
    if (s.kind === 'weekly') due = n.dow === s.dow;
    else if (s.kind === 'monthly') due = firstDowOfMonth(n.dom, n.dow, s.dow);
    else if (s.kind === 'once') due = s.on_date === n.ymd;
    else if (s.kind === 'birthday') due = true;
    if (!due) continue;

    // Mark first, so a slow run can never fire twice.
    const mark = await env.DB.prepare('UPDATE schedules SET last_run=?, enabled=? WHERE id=? AND last_run!=?')
      .bind(n.ymd, s.kind === 'once' ? 0 : 1, s.id, n.ymd).run();
    if (!mark.meta.changes) continue;

    const filter = JSON.parse(s.filter || '{}');
    if (s.kind === 'birthday') {
      const params = [];
      const where = audienceWhere({}, params);
      const { results: people } = await env.DB.prepare(`SELECT id,language FROM contacts WHERE ${where} AND bday=?`).bind(...params, n.md).all();
      const ta = people.filter((p) => p.language !== 'English').map((p) => p.id);
      const en = people.filter((p) => p.language === 'English').map((p) => p.id);
      if (ta.length && (s.tpl_ta || s.tpl_en)) created.push(await createCampaign(env, { title: 'Birthday wishes (Tamil)', template_id: s.tpl_ta || s.tpl_en, filter: { ids: ta }, source: 'birthday' }));
      if (en.length && (s.tpl_en || s.tpl_ta)) created.push(await createCampaign(env, { title: 'Birthday wishes (English)', template_id: s.tpl_en || s.tpl_ta, filter: { ids: en }, source: 'birthday' }));
    } else if (s.template_id) {
      created.push(await createCampaign(env, { title: s.title, template_id: s.template_id, filter, source: 'schedule' }));
    }
  }
  return created;
}

/* ---------- the minute tick ---------- */

export async function tick(env) {
  await runSchedules(env);
  const r = await processQueue(env);
  await demoProgress(env);
  return r;
}

/* ---------- Meta webhook ---------- */

const RANK = { queued: 0, sending: 0, sent: 1, delivered: 2, read: 3, failed: 9 };

export async function verifySignature(env, request, rawBody) {
  if (!env.APP_SECRET) return true; // set APP_SECRET to enforce signature checks
  const sig = (request.headers.get('x-hub-signature-256') || '').replace('sha256=', '');
  if (!sig) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === sig;
}

function inboundText(m) {
  if (!m) return '';
  if (m.type === 'text') return (m.text && m.text.body) || '';
  if (m.type === 'button') return (m.button && (m.button.text || m.button.payload)) || '';
  if (m.type === 'interactive' && m.interactive) {
    const r = m.interactive.button_reply || m.interactive.list_reply;
    return (r && r.title) || '';
  }
  return '[' + (m.type || 'message') + ']';
}

const clean = (s) => String(s || '').toUpperCase().replace(/[.!,?'"]/g, '').trim();

export async function handleWebhook(env, payload) {
  const t = now();
  for (const entry of payload.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      for (const st of v.statuses || []) {
        const status = st.status; // sent | delivered | read | failed
        if (!RANK[status]) continue;
        const err = (st.errors && st.errors[0] && (st.errors[0].message || st.errors[0].title)) || '';
        if (status === 'failed') {
          await env.DB.prepare("UPDATE messages SET status='failed', error=?, updated=? WHERE wamid=?").bind(err || 'Failed', t, st.id).run();
        } else {
          await env.DB.prepare('UPDATE messages SET status=?, updated=? WHERE wamid=? AND status IN (SELECT j.value FROM json_each(?) j)')
            .bind(status, t, st.id, JSON.stringify(Object.keys(RANK).filter((k) => RANK[k] < RANK[status]))).run();
        }
      }
      for (const m of v.messages || []) await handleInbound(env, m, (v.contacts && v.contacts[0]) || null);
    }
  }
}

async function handleInbound(env, m, profile) {
  const t = now();
  const phone = String(m.from || '');
  if (!phone) return;
  const dup = await env.DB.prepare('SELECT id FROM chat WHERE wamid=?').bind(m.id || '~').first();
  if (dup) return;
  let contact = await env.DB.prepare('SELECT * FROM contacts WHERE phone=?').bind(phone).first();
  const body = inboundText(m);
  const word = clean(body);

  // keyword rules
  const { results: rules } = await env.DB.prepare('SELECT * FROM rules WHERE enabled=1').all();
  const rule = rules.find((r) => r.keywords.split(',').some((k) => {
    const key = clean(k);
    if (!key) return false;
    return r.match === 'contains' && !r.action ? word.includes(key) : key === word;
  }));

  await env.DB.prepare('INSERT INTO chat (phone,contact_id,direction,body,tag,auto,is_read,wamid,ts) VALUES (?,?,?,?,?,0,0,?,?)')
    .bind(phone, contact ? contact.id : 0, 'in', body, rule ? rule.tag : '', m.id || '', t).run();

  if (rule) {
    if (rule.action === 'stop' && contact) await env.DB.prepare('UPDATE contacts SET optin=-1 WHERE id=?').bind(contact.id).run();
    if (rule.action === 'start' && contact) await env.DB.prepare('UPDATE contacts SET optin=1 WHERE id=?').bind(contact.id).run();
    if (rule.action === 'stop' || rule.action === 'start' || !rule.notify) {
      // nothing needs your attention, mark it read
      await env.DB.prepare('UPDATE chat SET is_read=1 WHERE wamid=?').bind(m.id || '').run();
    }
    const res = await sendText(env, phone, rule.reply);
    await env.DB.prepare('INSERT INTO chat (phone,contact_id,direction,body,tag,auto,is_read,wamid,ts) VALUES (?,?,?,?,?,1,1,?,?)')
      .bind(phone, contact ? contact.id : 0, 'out', rule.reply + (res.ok ? '' : '  [not sent: ' + res.error + ']'), '', res.wamid || '', now()).run();
  }
  if (!contact && profile && profile.profile) {
    // unknown number: remember the WhatsApp profile name for the inbox list
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind('pname_' + phone, profile.profile.name || '').run();
  }
}
