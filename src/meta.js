// Talks to Meta's WhatsApp Cloud API. If no token is set the app runs in DEMO mode
// (nothing leaves the server, messages are only simulated).

const DEFAULT_BASE = 'https://graph.facebook.com/v21.0';

export const isDemo = (env) => !env.META_TOKEN || !env.PHONE_NUMBER_ID;
const base = (env) => (env.META_API_BASE || DEFAULT_BASE).replace(/\/$/, '');

async function graph(env, method, path, body) {
  const res = await fetch(base(env) + path, {
    method,
    headers: { authorization: 'Bearer ' + env.META_TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok || (data && data.error)) {
    const err = (data && data.error) || {};
    return { ok: false, code: err.code || res.status, error: err.error_user_msg || err.message || ('HTTP ' + res.status), data };
  }
  return { ok: true, data };
}

// WhatsApp does not allow new lines, tabs or 4+ spaces inside a template variable.
export function cleanParam(v) {
  return String(v == null ? '' : v).replace(/[\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim() || '-';
}

export async function sendTemplate(env, to, tpl, values) {
  if (isDemo(env)) return { ok: true, wamid: 'demo.' + crypto.randomUUID().slice(0, 12) };
  const params = JSON.parse(tpl.params || '[]');
  const template = { name: tpl.meta_name, language: { code: tpl.language } };
  if (params.length) {
    template.components = [{
      type: 'body',
      parameters: params.map((k) => ({ type: 'text', text: cleanParam(values[k]) }))
    }];
  }
  const r = await graph(env, 'POST', `/${env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp', to, type: 'template', template
  });
  if (!r.ok) return r;
  const id = r.data && r.data.messages && r.data.messages[0] && r.data.messages[0].id;
  return { ok: true, wamid: id || '' };
}

// Free text only works inside the 24 hour window after the member wrote to us.
export async function sendText(env, to, text) {
  if (isDemo(env)) return { ok: true, wamid: 'demo.' + crypto.randomUUID().slice(0, 12) };
  const r = await graph(env, 'POST', `/${env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: true }
  });
  if (!r.ok) return r;
  const id = r.data && r.data.messages && r.data.messages[0] && r.data.messages[0].id;
  return { ok: true, wamid: id || '' };
}

export async function submitTemplate(env, tpl, samples) {
  if (isDemo(env)) return { ok: true, status: 'APPROVED', demo: true };
  if (!env.WABA_ID) return { ok: false, error: 'WABA_ID secret is not set' };
  const components = [{
    type: 'BODY',
    text: tpl.body,
    ...(samples.length ? { example: { body_text: [samples] } } : {})
  }];
  const buttons = JSON.parse(tpl.buttons || '[]').map((b) =>
    b.type === 'URL' ? { type: 'URL', text: b.text, url: b.url } : { type: 'QUICK_REPLY', text: b.text });
  if (buttons.length) components.push({ type: 'BUTTONS', buttons });
  const r = await graph(env, 'POST', `/${env.WABA_ID}/message_templates`, {
    name: tpl.meta_name, language: tpl.language, category: tpl.category, components
  });
  if (!r.ok) return r;
  return { ok: true, status: (r.data && r.data.status) || 'PENDING' };
}

export async function templateStatus(env, tpl) {
  if (isDemo(env)) return { ok: true, status: 'APPROVED', demo: true };
  if (!env.WABA_ID) return { ok: false, error: 'WABA_ID secret is not set' };
  const r = await graph(env, 'GET', `/${env.WABA_ID}/message_templates?name=${encodeURIComponent(tpl.meta_name)}&fields=name,status,language`);
  if (!r.ok) return r;
  const hit = ((r.data && r.data.data) || []).find((t) => t.language === tpl.language) || (r.data.data || [])[0];
  return { ok: true, status: hit ? hit.status : 'NOT_FOUND' };
}

export async function phoneInfo(env) {
  if (isDemo(env)) return { ok: true, demo: true };
  const r = await graph(env, 'GET', `/${env.PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`);
  return r.ok ? { ok: true, info: r.data } : r;
}
