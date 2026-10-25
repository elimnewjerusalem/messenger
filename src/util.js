// Small helpers shared by the worker files.

export const now = () => Math.floor(Date.now() / 1000);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// India time (IST = UTC+5:30), no daylight saving.
export function ist(date = new Date()) {
  const d = new Date(date.getTime() + 5.5 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return {
    ymd: `${y}-${m}-${day}`,
    md: `${m}-${day}`,
    month: m,
    dow: d.getUTCDay(),
    dom: d.getUTCDate(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes()
  };
}

export function hmToMinutes(hm) {
  const [h, m] = String(hm || '08:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// 10 digit Indian mobile -> 91XXXXXXXXXX. Returns {phone, valid}.
export function normPhone(raw) {
  let s = String(raw == null ? '' : raw).replace(/[^\d]/g, '');
  if (s.length === 11 && s[0] === '0') s = s.slice(1);
  if (s.length === 10 && /^[6-9]/.test(s)) s = '91' + s;
  const valid = /^91[6-9]\d{9}$/.test(s);
  return { phone: s, valid };
}

export function titleCase(s) {
  return String(s || '').trim().toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
}

export function splitList(v) {
  return String(v || '').split(/[,;|\/\n]+/).map(titleCase).filter(Boolean);
}

// "15-03" (day-month) or "03-15" ambiguity: the app asks for day-month, same as the earlier app.
export function parseBday(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    return String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.]\d{2,4})?$/);
  if (m) {
    const d = +m[1], mo = +m[2];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  return '';
}

export function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
export function b64url(bytes) {
  let s = '';
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Pricing guess used only for the cost estimate shown in the app (INR per delivered message).
export const COST = {
  MARKETING: [0.86, 1.09],
  UTILITY: [0.115, 0.145],
  AUTHENTICATION: [0.115, 0.145]
};
