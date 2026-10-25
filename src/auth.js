// Login for you and your team. Passwords are stored as PBKDF2 hashes, the session is a signed cookie.
import { b64url, unb64url, bytesToHex, hexToBytes, HttpError, now } from './util.js';

const enc = new TextEncoder();
const ITER = 100000; // Cloudflare Workers caps PBKDF2 at 100000

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, key, 256);
  return { salt: bytesToHex(salt), hash: bytesToHex(bits) };
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function secretOf(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) {
    throw new HttpError(500, 'SESSION_SECRET is not set. Run: npx wrangler secret put SESSION_SECRET');
  }
  return env.SESSION_SECRET;
}

export async function makeToken(env, user) {
  const payload = b64url(enc.encode(JSON.stringify({ id: user.id, exp: now() + 30 * 86400 })));
  const key = await hmacKey(secretOf(env));
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
  return payload + '.' + sig;
}

export async function readToken(env, token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [payload, sig] = token.split('.');
  const key = await hmacKey(secretOf(env));
  const ok = await crypto.subtle.verify('HMAC', key, unb64url(sig), enc.encode(payload));
  if (!ok) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(unb64url(payload)));
    return data.exp > now() ? data : null;
  } catch (e) { return null; }
}

export function getCookie(request, name) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : '';
}

export function sessionCookie(request, token, maxAge = 30 * 86400) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `enjc=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

export async function currentUser(env, request) {
  const data = await readToken(env, getCookie(request, 'enjc'));
  if (!data) return null;
  const u = await env.DB.prepare('SELECT id,name,login,role FROM users WHERE id=?').bind(data.id).first();
  return u || null;
}
