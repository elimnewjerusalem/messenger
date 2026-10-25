// ENJC Messenger v2: one Cloudflare Worker that serves the app, the API, the Meta webhook and the minute timer.
import { json, HttpError, now, ist, normPhone, titleCase, splitList, parseBday } from './util.js';
import { hashPassword, makeToken, currentUser, sessionCookie } from './auth.js';
import { isDemo, sendText, submitTemplate, templateStatus, phoneInfo } from './meta.js';
import {
  getSettings, audienceWhere, audienceCount, costRange, createCampaign, campaignStats,
  processQueue, tick, verifySignature, handleWebhook
} from './engine.js';

const ROLES = { admin: 3, sender: 2, inbox: 1 };

function need(user, role) {
  if (!user) throw new HttpError(401, 'Please log in');
  if ((ROLES[user.role] || 0) < ROLES[role]) throw new HttpError(403, 'You do not have access to this');
}

const body = async (request) => {
  try { return await request.json(); } catch (e) { throw new HttpError(400, 'Bad request body'); }
};

const intOr = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

/* ============================ API ============================ */

async function api(request, env, ctx, url) {
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = request.method;
  const db = env.DB;
  let m;

  // ---- session ----
  if (path === '/session' && method === 'GET') {
    const user = await currentUser(env, request).catch(() => null);
    const count = (await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
    return json({ user, needsSetup: count === 0, demo: isDemo(env) });
  }
  if (path === '/setup' && method === 'POST') {
    const count = (await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
    if (count) throw new HttpError(403, 'Already set up');
    const b = await body(request);
    if (!b.name || !b.login || !b.password || b.password.length < 8) throw new HttpError(400, 'Name, login and a password of 8+ characters are needed');
    const h = await hashPassword(b.password);
    const u = await db.prepare('INSERT INTO users (name,login,salt,hash,role,created) VALUES (?,?,?,?,?,?) RETURNING id,name,login,role')
      .bind(b.name.trim(), b.login.trim().toLowerCase(), h.salt, h.hash, 'admin', now()).first();
    return json({ user: u }, 200, { 'set-cookie': sessionCookie(request, await makeToken(env, u)) });
  }
  if (path === '/login' && method === 'POST') {
    const b = await body(request);
    const row = await db.prepare('SELECT * FROM users WHERE login=?').bind(String(b.login || '').trim().toLowerCase()).first();
    const h = row ? await hashPassword(String(b.password || ''), row.salt) : null;
    if (!row || h.hash !== row.hash) {
      await new Promise((r) => setTimeout(r, 800)); // slows down password guessing
      throw new HttpError(401, 'Wrong login or password');
    }
    const u = { id: row.id, name: row.name, login: row.login, role: row.role };
    return json({ user: u }, 200, { 'set-cookie': sessionCookie(request, await makeToken(env, u)) });
  }
  if (path === '/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', 0) });
  }

  const user = await currentUser(env, request);
  need(user, 'inbox');

  // ---- home ----
  if (path === '/home' && method === 'GET') {
    need(user, 'sender');
    const n = ist();
    const [active, unread, prayer, nextSched, bdays, week, month, contactsN] = await Promise.all([
      db.prepare("SELECT * FROM campaigns WHERE status IN ('sending','paused') ORDER BY id DESC LIMIT 1").first(),
      db.prepare("SELECT COUNT(*) AS n FROM chat WHERE direction='in' AND is_read=0").first(),
      db.prepare("SELECT COUNT(*) AS n FROM chat WHERE direction='in' AND is_read=0 AND tag='Prayer request'").first(),
      db.prepare("SELECT * FROM schedules WHERE enabled=1 AND kind!='birthday' ORDER BY id").all(),
      db.prepare("SELECT c.id,c.name,c.area,c.language, (SELECT m.status FROM messages m WHERE m.contact_id=c.id AND m.campaign_id IN (SELECT id FROM campaigns WHERE source='birthday' AND created>?) ORDER BY m.id DESC LIMIT 1) AS wish FROM contacts c WHERE c.bday=? AND c.valid=1 AND c.optin!=-1 ORDER BY c.name").bind(now() - 86400, n.md).all(),
      db.prepare('SELECT bday FROM contacts WHERE bday!=\'\' AND valid=1 AND optin!=-1').all(),
      db.prepare("SELECT COUNT(*) AS n FROM messages WHERE status IN ('sent','delivered','read') AND updated>?").bind(now() - 30 * 86400).first(),
      db.prepare('SELECT COUNT(*) AS total, SUM(valid) AS valid, SUM(bday!=\'\') AS withb FROM contacts').first()
    ]);
    let activeOut = null;
    if (active) activeOut = { ...active, stats: await campaignStats(env, active.id) };
    // birthdays in the next 7 days (not today)
    const soon = [];
    for (let i = 1; i <= 7; i++) {
      const d = ist(new Date(Date.now() + i * 86400000));
      soon.push(d.md);
    }
    const weekCount = week.results.filter((r) => soon.includes(r.bday)).length;
    const bdaySched = await db.prepare("SELECT * FROM schedules WHERE kind='birthday'").first();
    const settings = await getSettings(env);
    return json({
      active: activeOut,
      unread: unread.n, prayer: prayer.n,
      schedules: nextSched.results,
      birthdaysToday: bdays.results,
      birthdaysWeek: weekCount,
      birthdayAuto: bdaySched ? { enabled: !!bdaySched.enabled, at: bdaySched.at } : null,
      month: { messages: month.n, cost: costRange(month.n, 'MARKETING') },
      contacts: contactsN,
      demo: isDemo(env),
      church: settings.church
    });
  }

  // ---- contacts ----
  if (path === '/contacts' && method === 'GET') {
    need(user, 'sender');
    const q = url.searchParams;
    const params = [];
    const f = {
      groups: q.get('groups') ? q.get('groups').split('|') : [],
      areas: q.get('areas') ? q.get('areas').split('|') : [],
      languages: q.get('languages') ? q.get('languages').split('|') : []
    };
    let where = audienceWhere(f, params).replace('valid=1 AND optin!=-1', '1=1');
    const optin = q.get('optin');
    if (optin === 'yes') where += ' AND optin=1';
    if (optin === 'none') where += ' AND optin=0';
    if (optin === 'stopped') where += ' AND optin=-1';
    if (q.get('invalid') === '1') where += ' AND valid=0';
    if (q.get('q')) { where += ' AND (name LIKE ? OR phone LIKE ?)'; params.push('%' + q.get('q') + '%', '%' + q.get('q') + '%'); }
    const limit = Math.min(500, intOr(q.get('limit'), 100));
    const offset = intOr(q.get('offset'), 0);
    const total = (await db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE ${where}`).bind(...params).first()).n;
    const { results } = await db.prepare(`SELECT * FROM contacts WHERE ${where} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`).bind(...params, limit, offset).all();
    return json({ total, contacts: results.map((c) => ({ ...c, groups: JSON.parse(c.groups || '[]') })) });
  }
  if (path === '/contacts/facets' && method === 'GET') {
    need(user, 'sender');
    const [g, a, l, c] = await Promise.all([
      db.prepare('SELECT j.value AS v, COUNT(*) AS n FROM contacts, json_each(contacts.groups) j WHERE valid=1 AND optin!=-1 GROUP BY j.value ORDER BY n DESC').all(),
      db.prepare("SELECT area AS v, COUNT(*) AS n FROM contacts WHERE area!='' AND valid=1 AND optin!=-1 GROUP BY area ORDER BY n DESC").all(),
      db.prepare("SELECT language AS v, COUNT(*) AS n FROM contacts WHERE language!='' AND valid=1 AND optin!=-1 GROUP BY language ORDER BY n DESC").all(),
      db.prepare('SELECT COUNT(*) AS total, SUM(valid) AS valid, SUM(optin=1) AS optin, SUM(optin=-1) AS stopped FROM contacts').first()
    ]);
    return json({ groups: g.results, areas: a.results, languages: l.results, counts: c });
  }
  if (path === '/contacts/import' && method === 'POST') {
    need(user, 'sender');
    const b = await body(request);
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) throw new HttpError(400, 'No rows');
    if (rows.length > 5000) throw new HttpError(400, 'Too many rows at once (max 5000)');
    const existing = await db.prepare('SELECT phone, groups, name, area, language, bday FROM contacts').all();
    const have = new Map(existing.results.map((r) => [r.phone, r]));
    const out = new Map();
    let added = 0, updated = 0, invalid = 0;
    for (const r of rows) {
      const { phone, valid } = normPhone(r.phone);
      if (!phone) continue;
      if (!valid) invalid++;
      const groups = splitList(r.groups);
      const cur = out.get(phone) || (have.get(phone) ? { ...have.get(phone), groups: JSON.parse(have.get(phone).groups || '[]'), existing: true } : null);
      const rec = cur || { phone, name: '', groups: [], area: '', language: '', bday: '', existing: false };
      rec.name = String(r.name || '').trim() || rec.name;
      rec.area = titleCase(r.area) || rec.area;
      rec.language = titleCase(r.language) || rec.language;
      rec.bday = parseBday(r.bday) || rec.bday;
      rec.groups = [...new Set([...(rec.groups || []), ...groups])];
      rec.valid = valid ? 1 : 0;
      out.set(phone, rec);
    }
    const list = [...out.values()].map((r) => ({
      name: r.name, phone: r.phone, groups: JSON.stringify(r.groups), area: r.area, language: r.language, bday: r.bday, valid: r.valid != null ? r.valid : (normPhone(r.phone).valid ? 1 : 0)
    }));
    for (const r of out.values()) { if (r.existing) updated++; else added++; }
    // chunks of 400 rows, each chunk is one statement carrying one JSON parameter
    const t = now();
    for (let i = 0; i < list.length; i += 400) {
      await db.prepare(
        `INSERT INTO contacts (name,phone,groups,area,language,bday,valid,created)
         SELECT json_extract(j.value,'$.name'), json_extract(j.value,'$.phone'), json_extract(j.value,'$.groups'),
                json_extract(j.value,'$.area'), json_extract(j.value,'$.language'), json_extract(j.value,'$.bday'),
                json_extract(j.value,'$.valid'), ?
         FROM json_each(?) j WHERE true
         ON CONFLICT(phone) DO UPDATE SET name=excluded.name, groups=excluded.groups, area=excluded.area,
              language=excluded.language, bday=excluded.bday, valid=excluded.valid`
      ).bind(t, JSON.stringify(list.slice(i, i + 400))).run();
    }
    return json({ added, updated, invalid, total: out.size });
  }
  if ((m = path.match(/^\/contacts\/(\d+)$/))) {
    need(user, 'sender');
    const id = +m[1];
    if (method === 'DELETE') { await db.prepare('DELETE FROM contacts WHERE id=?').bind(id).run(); return json({ ok: true }); }
    if (method === 'PATCH') {
      const b = await body(request);
      const c = await db.prepare('SELECT * FROM contacts WHERE id=?').bind(id).first();
      if (!c) throw new HttpError(404, 'Not found');
      const phone = b.phone != null ? normPhone(b.phone) : { phone: c.phone, valid: !!c.valid };
      await db.prepare('UPDATE contacts SET name=?,phone=?,groups=?,area=?,language=?,bday=?,optin=?,valid=? WHERE id=?').bind(
        b.name != null ? String(b.name).trim() : c.name, phone.phone,
        b.groups != null ? JSON.stringify(splitList(Array.isArray(b.groups) ? b.groups.join(',') : b.groups)) : c.groups,
        b.area != null ? titleCase(b.area) : c.area, b.language != null ? titleCase(b.language) : c.language,
        b.bday != null ? parseBday(b.bday) : c.bday, b.optin != null ? intOr(b.optin) : c.optin, phone.valid ? 1 : 0, id).run();
      return json({ ok: true });
    }
  }
  if (path === '/contacts' && method === 'POST') {
    need(user, 'sender');
    const b = await body(request);
    const p = normPhone(b.phone);
    if (!p.phone) throw new HttpError(400, 'Phone number is needed');
    await db.prepare('INSERT INTO contacts (name,phone,groups,area,language,bday,optin,valid,created) VALUES (?,?,?,?,?,?,?,?,?)').bind(
      String(b.name || '').trim(), p.phone, JSON.stringify(splitList(b.groups)), titleCase(b.area), titleCase(b.language), parseBday(b.bday), intOr(b.optin), p.valid ? 1 : 0, now()).run();
    return json({ ok: true });
  }
  if (path === '/contacts/bulk-optin' && method === 'POST') {
    need(user, 'admin');
    const b = await body(request);
    const params = [];
    const where = audienceWhere(b.filter || {}, params).replace('optin!=-1', "optin!=-1 AND optin=0");
    const r = await db.prepare(`UPDATE contacts SET optin=1 WHERE ${where}`).bind(...params).run();
    return json({ changed: r.meta.changes });
  }
  if (path === '/audience/count' && method === 'POST') {
    need(user, 'sender');
    const b = await body(request);
    const n = await audienceCount(env, b.filter || {});
    let category = 'MARKETING';
    if (b.template_id) {
      const t = await db.prepare('SELECT category FROM templates WHERE id=?').bind(b.template_id).first();
      if (t) category = t.category;
    }
    return json({ count: n, cost: costRange(n, category) });
  }

  // ---- templates ----
  if (path === '/templates' && method === 'GET') {
    need(user, 'sender');
    const { results } = await db.prepare('SELECT * FROM templates ORDER BY id DESC').all();
    return json({ templates: results.map((t) => ({ ...t, params: JSON.parse(t.params), buttons: JSON.parse(t.buttons) })) });
  }
  if (path === '/templates' && method === 'POST') {
    need(user, 'sender');
    const b = await body(request);
    const t = templateFromBody(b);
    const row = await db.prepare('INSERT INTO templates (title,meta_name,language,category,body,params,buttons,status,created) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id')
      .bind(t.title, t.meta_name, t.language, t.category, t.body, t.params, t.buttons, isDemo(env) ? 'APPROVED' : 'DRAFT', now()).first();
    return json({ id: row.id });
  }
  if ((m = path.match(/^\/templates\/(\d+)$/))) {
    need(user, 'sender');
    const id = +m[1];
    if (method === 'DELETE') { await db.prepare('DELETE FROM templates WHERE id=?').bind(id).run(); return json({ ok: true }); }
    if (method === 'PUT') {
      const b = await body(request);
      const t = templateFromBody(b);
      await db.prepare('UPDATE templates SET title=?,meta_name=?,language=?,category=?,body=?,params=?,buttons=?,status=? WHERE id=?')
        .bind(t.title, t.meta_name, t.language, t.category, t.body, t.params, t.buttons, isDemo(env) ? 'APPROVED' : 'DRAFT', id).run();
      return json({ ok: true });
    }
  }
  if ((m = path.match(/^\/templates\/(\d+)\/submit$/)) && method === 'POST') {
    need(user, 'sender');
    const tpl = await db.prepare('SELECT * FROM templates WHERE id=?').bind(+m[1]).first();
    if (!tpl) throw new HttpError(404, 'Not found');
    const settings = await getSettings(env);
    const samples = JSON.parse(tpl.params).map((k) => ({ name: 'Abraham', group: 'Sunday', area: 'Tondiarpet', website: settings.website, youtube: settings.youtube || 'youtube.com' }[k] || 'Sample'));
    const r = await submitTemplate(env, tpl, samples);
    if (!r.ok) throw new HttpError(400, 'Meta said: ' + r.error);
    await db.prepare('UPDATE templates SET status=? WHERE id=?').bind(r.status, tpl.id).run();
    return json({ status: r.status });
  }
  if (path === '/templates/sync' && method === 'POST') {
    need(user, 'sender');
    const { results } = await db.prepare("SELECT * FROM templates WHERE status IN ('PENDING','DRAFT')").all();
    let changed = 0;
    for (const tpl of results) {
      if (tpl.status === 'DRAFT') continue;
      const r = await templateStatus(env, tpl);
      if (r.ok && r.status && r.status !== tpl.status && r.status !== 'NOT_FOUND') {
        await db.prepare('UPDATE templates SET status=? WHERE id=?').bind(r.status, tpl.id).run();
        changed++;
      }
    }
    return json({ changed });
  }

  // ---- campaigns ----
  if (path === '/campaigns' && method === 'POST') {
    need(user, 'sender');
    const b = await body(request);
    const tpl = await db.prepare('SELECT * FROM templates WHERE id=?').bind(b.template_id).first();
    if (!tpl) throw new HttpError(400, 'Choose a template');
    if (!isDemo(env) && tpl.status !== 'APPROVED') throw new HttpError(400, 'This template is not approved by Meta yet');
    const filter = b.filter || {};
    if (b.send_at) {
      // schedule for later: a one-time schedule
      const when = String(b.send_at); // "YYYY-MM-DDTHH:MM" in IST
      const [d, tm] = when.split('T');
      const row = await db.prepare("INSERT INTO schedules (title,template_id,filter,kind,at,on_date,enabled) VALUES (?,?,?,'once',?,?,1) RETURNING id")
        .bind(b.title || tpl.title, tpl.id, JSON.stringify(filter), tm || '08:00', d).first();
      return json({ scheduled: true, id: row.id });
    }
    const c = await createCampaign(env, { title: b.title || tpl.title, template_id: tpl.id, filter });
    ctx.waitUntil(processQueue(env, 20)); // start right now, the timer carries on
    return json({ id: c.id, total: c.total });
  }
  if (path === '/campaigns' && method === 'GET') {
    need(user, 'sender');
    const { results } = await db.prepare('SELECT * FROM campaigns ORDER BY id DESC LIMIT 30').all();
    const out = [];
    for (const c of results) out.push({ ...c, stats: await campaignStats(env, c.id) });
    return json({ campaigns: out });
  }
  if ((m = path.match(/^\/campaigns\/(\d+)$/)) && method === 'GET') {
    need(user, 'sender');
    const id = +m[1];
    const c = await db.prepare('SELECT c.*, t.title AS template_title, t.body AS template_body FROM campaigns c LEFT JOIN templates t ON t.id=c.template_id WHERE c.id=?').bind(id).first();
    if (!c) throw new HttpError(404, 'Not found');
    const f = url.searchParams.get('filter') || 'all';
    let cond = '';
    if (f === 'read') cond = " AND status='read'";
    else if (f === 'failed') cond = " AND status='failed'";
    else if (f === 'notdelivered') cond = " AND status IN ('queued','sending','sent')";
    const { results } = await db.prepare(`SELECT id,name,phone,status,error,updated FROM messages WHERE campaign_id=?${cond} ORDER BY id LIMIT 200`).bind(id).all();
    const rate = parseInt((await getSettings(env)).per_minute || '20', 10);
    const stats = await campaignStats(env, id);
    return json({ campaign: c, stats, messages: results, perMinute: rate, minutesLeft: Math.ceil(stats.queued / rate) });
  }
  if ((m = path.match(/^\/campaigns\/(\d+)\/(pause|resume|retry|cancel)$/)) && method === 'POST') {
    need(user, 'sender');
    const id = +m[1];
    if (m[2] === 'pause') await db.prepare("UPDATE campaigns SET status='paused' WHERE id=? AND status='sending'").bind(id).run();
    if (m[2] === 'resume') await db.prepare("UPDATE campaigns SET status='sending' WHERE id=? AND status='paused'").bind(id).run();
    if (m[2] === 'retry') {
      await db.batch([
        db.prepare("UPDATE messages SET status='queued', error='', updated=? WHERE campaign_id=? AND status='failed'").bind(now(), id),
        db.prepare("UPDATE campaigns SET status='sending' WHERE id=?").bind(id)
      ]);
    }
    if (m[2] === 'cancel') {
      await db.batch([
        db.prepare("UPDATE messages SET status='failed', error='Cancelled', updated=? WHERE campaign_id=? AND status='queued'").bind(now(), id),
        db.prepare("UPDATE campaigns SET status='done' WHERE id=?").bind(id)
      ]);
    }
    return json({ ok: true });
  }

  // ---- schedules ----
  if (path === '/schedules' && method === 'GET') {
    need(user, 'sender');
    const { results } = await db.prepare('SELECT s.*, t.title AS template_title FROM schedules s LEFT JOIN templates t ON t.id=s.template_id ORDER BY s.kind="birthday" DESC, s.id').all();
    const out = [];
    for (const s of results) out.push({ ...s, filter: JSON.parse(s.filter || '{}'), audience: s.kind === 'birthday' ? null : await audienceCount(env, JSON.parse(s.filter || '{}')) });
    return json({ schedules: out });
  }
  if (path === '/schedules' && method === 'POST') {
    need(user, 'sender');
    const b = await body(request);
    const row = await db.prepare('INSERT INTO schedules (title,template_id,filter,kind,dow,at,on_date,tpl_ta,tpl_en,enabled) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id')
      .bind(String(b.title || 'Schedule'), intOr(b.template_id), JSON.stringify(b.filter || {}), b.kind || 'weekly', intOr(b.dow), b.at || '08:00', b.on_date || '', intOr(b.tpl_ta), intOr(b.tpl_en), b.enabled === false ? 0 : 1).first();
    return json({ id: row.id });
  }
  if ((m = path.match(/^\/schedules\/(\d+)$/))) {
    need(user, 'sender');
    const id = +m[1];
    if (method === 'DELETE') { await db.prepare('DELETE FROM schedules WHERE id=?').bind(id).run(); return json({ ok: true }); }
    if (method === 'PATCH') {
      const b = await body(request);
      const s = await db.prepare('SELECT * FROM schedules WHERE id=?').bind(id).first();
      if (!s) throw new HttpError(404, 'Not found');
      await db.prepare('UPDATE schedules SET title=?,template_id=?,filter=?,dow=?,at=?,on_date=?,tpl_ta=?,tpl_en=?,enabled=? WHERE id=?').bind(
        b.title != null ? b.title : s.title, b.template_id != null ? intOr(b.template_id) : s.template_id,
        b.filter != null ? JSON.stringify(b.filter) : s.filter, b.dow != null ? intOr(b.dow) : s.dow,
        b.at != null ? b.at : s.at, b.on_date != null ? b.on_date : s.on_date,
        b.tpl_ta != null ? intOr(b.tpl_ta) : s.tpl_ta, b.tpl_en != null ? intOr(b.tpl_en) : s.tpl_en,
        b.enabled != null ? (b.enabled ? 1 : 0) : s.enabled, id).run();
      return json({ ok: true });
    }
  }

  // ---- inbox ----
  if (path === '/inbox' && method === 'GET') {
    const f = url.searchParams.get('filter') || 'all';
    const { results } = await db.prepare(
      `SELECT x.phone, c.name, c.id AS contact_id,
              (SELECT body FROM chat WHERE phone=x.phone ORDER BY ts DESC, id DESC LIMIT 1) AS last_body,
              (SELECT direction FROM chat WHERE phone=x.phone ORDER BY ts DESC, id DESC LIMIT 1) AS last_dir,
              (SELECT auto FROM chat WHERE phone=x.phone ORDER BY ts DESC, id DESC LIMIT 1) AS last_auto,
              x.last_ts, x.unread, x.last_in,
              (SELECT tag FROM chat WHERE phone=x.phone AND tag!='' ORDER BY ts DESC LIMIT 1) AS tag,
              (SELECT value FROM settings WHERE key='pname_'||x.phone) AS pname
       FROM (SELECT phone, MAX(ts) AS last_ts, SUM(direction='in' AND is_read=0) AS unread,
                    MAX(CASE WHEN direction='in' THEN ts END) AS last_in
             FROM chat GROUP BY phone) x
       LEFT JOIN contacts c ON c.phone=x.phone
       ORDER BY x.last_ts DESC LIMIT 200`).all();
    let list = results.map((r) => ({ ...r, name: r.name || r.pname || '+' + r.phone, hours_left: r.last_in ? Math.max(0, Math.round((24 * 3600 - (now() - r.last_in)) / 3600)) : 0 }));
    if (f === 'unread') list = list.filter((r) => r.unread > 0);
    if (f === 'prayer') list = list.filter((r) => r.tag === 'Prayer request');
    if (f === 'stop') list = list.filter((r) => r.tag === 'Stopped');
    const unread = (await db.prepare("SELECT COUNT(*) AS n FROM chat WHERE direction='in' AND is_read=0").first()).n;
    return json({ threads: list, unread });
  }
  if ((m = path.match(/^\/inbox\/(\d+)$/))) {
    const phone = m[1];
    if (method === 'GET') {
      const { results } = await db.prepare('SELECT * FROM chat WHERE phone=? ORDER BY ts, id LIMIT 200').bind(phone).all();
      await db.prepare("UPDATE chat SET is_read=1 WHERE phone=? AND direction='in'").bind(phone).run();
      const c = await db.prepare('SELECT id,name FROM contacts WHERE phone=?').bind(phone).first();
      const lastIn = results.filter((r) => r.direction === 'in').pop();
      const open = lastIn && now() - lastIn.ts < 24 * 3600;
      return json({ messages: results, contact: c, windowOpen: !!open, hoursLeft: open ? Math.round((24 * 3600 - (now() - lastIn.ts)) / 3600) : 0 });
    }
  }
  if ((m = path.match(/^\/inbox\/(\d+)\/reply$/)) && method === 'POST') {
    const phone = m[1];
    const b = await body(request);
    const text = String(b.text || '').trim();
    if (!text) throw new HttpError(400, 'Write a message');
    const lastIn = await db.prepare("SELECT ts FROM chat WHERE phone=? AND direction='in' ORDER BY ts DESC LIMIT 1").bind(phone).first();
    if (!lastIn || now() - lastIn.ts > 24 * 3600) throw new HttpError(400, 'The 24 hour reply window is closed. Send an approved template instead.');
    const r = await sendText(env, phone, text);
    if (!r.ok) throw new HttpError(400, 'Meta said: ' + r.error);
    await db.prepare('INSERT INTO chat (phone,contact_id,direction,body,auto,is_read,wamid,ts) VALUES (?,?,?,?,0,1,?,?)').bind(phone, 0, 'out', text, r.wamid || '', now()).run();
    return json({ ok: true });
  }

  // ---- auto replies ----
  if (path === '/rules' && method === 'GET') {
    need(user, 'sender');
    const { results } = await db.prepare('SELECT * FROM rules ORDER BY id').all();
    return json({ rules: results });
  }
  if (path === '/rules' && method === 'POST') {
    need(user, 'sender');
    const b = await body(request);
    if (!b.keywords || !b.reply) throw new HttpError(400, 'Keyword and reply are needed');
    await db.prepare('INSERT INTO rules (keywords,reply,tag,notify,action,match,enabled) VALUES (?,?,?,?,?,?,1)').bind(String(b.keywords), String(b.reply), String(b.tag || ''), b.notify ? 1 : 0, '', b.match === 'contains' ? 'contains' : 'exact').run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/rules\/(\d+)$/))) {
    need(user, 'sender');
    const id = +m[1];
    if (method === 'DELETE') { await db.prepare('DELETE FROM rules WHERE id=? AND locked=0').bind(id).run(); return json({ ok: true }); }
    if (method === 'PATCH') {
      const b = await body(request);
      const r = await db.prepare('SELECT * FROM rules WHERE id=?').bind(id).first();
      if (!r) throw new HttpError(404, 'Not found');
      await db.prepare('UPDATE rules SET keywords=?,reply=?,tag=?,notify=?,match=?,enabled=? WHERE id=?').bind(
        b.keywords != null ? b.keywords : r.keywords, b.reply != null ? b.reply : r.reply, b.tag != null ? b.tag : r.tag,
        b.notify != null ? (b.notify ? 1 : 0) : r.notify, b.match != null ? (b.match === 'contains' ? 'contains' : 'exact') : r.match, r.locked ? 1 : (b.enabled != null ? (b.enabled ? 1 : 0) : r.enabled), id).run();
      return json({ ok: true });
    }
  }

  // ---- settings and team ----
  if (path === '/settings' && method === 'GET') {
    need(user, 'sender');
    const s = await getSettings(env);
    const out = { website: s.website, youtube: s.youtube, per_minute: s.per_minute, church: s.church };
    return json({ settings: out, demo: isDemo(env), webhook: url.origin + '/webhook', hasVerify: !!env.VERIFY_TOKEN });
  }
  if (path === '/settings' && method === 'PUT') {
    need(user, 'admin');
    const b = await body(request);
    for (const k of ['website', 'youtube', 'church']) {
      if (b[k] != null) await db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, String(b[k]).trim()).run();
    }
    if (b.per_minute != null) {
      const n = Math.max(1, Math.min(40, intOr(b.per_minute, 20)));
      await db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('per_minute', String(n)).run();
    }
    return json({ ok: true });
  }
  if (path === '/meta/status' && method === 'GET') {
    need(user, 'sender');
    return json(await phoneInfo(env));
  }
  if (path === '/users' && method === 'GET') {
    need(user, 'admin');
    const { results } = await db.prepare('SELECT id,name,login,role FROM users ORDER BY id').all();
    return json({ users: results });
  }
  if (path === '/users' && method === 'POST') {
    need(user, 'admin');
    const b = await body(request);
    if (!b.name || !b.login || !b.password || String(b.password).length < 8) throw new HttpError(400, 'Name, login and a password of 8+ characters are needed');
    if (!ROLES[b.role]) throw new HttpError(400, 'Role must be admin, sender or inbox');
    const h = await hashPassword(String(b.password));
    try {
      await db.prepare('INSERT INTO users (name,login,salt,hash,role,created) VALUES (?,?,?,?,?,?)').bind(String(b.name).trim(), String(b.login).trim().toLowerCase(), h.salt, h.hash, b.role, now()).run();
    } catch (e) { throw new HttpError(400, 'That login already exists'); }
    return json({ ok: true });
  }
  if ((m = path.match(/^\/users\/(\d+)$/)) && method === 'DELETE') {
    need(user, 'admin');
    if (+m[1] === user.id) throw new HttpError(400, 'You cannot remove yourself');
    await db.prepare('DELETE FROM users WHERE id=?').bind(+m[1]).run();
    return json({ ok: true });
  }

  throw new HttpError(404, 'Not found');
}

function templateFromBody(b) {
  const title = String(b.title || '').trim();
  const text = String(b.body || '').trim();
  if (!title || !text) throw new HttpError(400, 'Title and message are needed');
  const metaName = String(b.meta_name || title).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'message';
  const buttons = (Array.isArray(b.buttons) ? b.buttons : []).slice(0, 3).map((x) => x.type === 'URL'
    ? { type: 'URL', text: String(x.text || '').slice(0, 25), url: String(x.url || '').trim() }
    : { type: 'QUICK_REPLY', text: String(x.text || '').slice(0, 25) }).filter((x) => x.text);
  const used = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((x) => +x[1]);
  const params = Array.isArray(b.params) ? b.params.slice(0, Math.max(used.length, 0) || 0) : [];
  if (used.length && params.length < Math.max(...used)) throw new HttpError(400, 'Each {{1}}, {{2}} needs a value (name, area ...)');
  return {
    title, meta_name: metaName, language: String(b.language || 'ta'),
    category: ['MARKETING', 'UTILITY'].includes(b.category) ? b.category : 'MARKETING',
    body: text, params: JSON.stringify(params), buttons: JSON.stringify(buttons)
  };
}

/* ============================ entry ============================ */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/webhook') {
        if (request.method === 'GET') {
          const ok = url.searchParams.get('hub.mode') === 'subscribe' && env.VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === env.VERIFY_TOKEN;
          return ok ? new Response(url.searchParams.get('hub.challenge')) : new Response('Forbidden', { status: 403 });
        }
        if (request.method === 'POST') {
          const raw = await request.text();
          if (!(await verifySignature(env, request, raw))) return new Response('Bad signature', { status: 401 });
          ctx.waitUntil(handleWebhook(env, JSON.parse(raw || '{}')).catch((e) => console.log('webhook error', e.message)));
          return new Response('ok');
        }
      }
      if (url.pathname.startsWith('/api/')) return await api(request, env, ctx, url);
      return env.ASSETS.fetch(request);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.log('error', e && e.stack || e);
      return json({ error: 'Server error: ' + (e && e.message) }, 500);
    }
  },

  // Runs every minute (see wrangler.toml): schedules, birthdays and the sending queue.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env));
  }
};
