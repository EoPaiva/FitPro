import crypto from 'node:crypto';
import { config } from './config.mjs';

export function id(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function nowISO() {
  return new Date().toISOString();
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const next = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(next));
}

function b64url(input) {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

function sign(data) {
  return crypto.createHmac('sha256', config.jwtSecret).update(data).digest('base64url');
}

export function createToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + config.tokenTtlHours * 60 * 60;
  const body = { ...payload, exp, iat: Math.floor(Date.now() / 1000) };
  const data = `${b64url(header)}.${b64url(body)}`;
  return `${data}.${sign(data)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = sign(data);
  if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function safeFileName(original = 'arquivo') {
  const clean = original.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `${Date.now()}_${crypto.randomBytes(5).toString('hex')}_${clean || 'arquivo'}`;
}

export function sanitizeText(value, max = 2000) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
}
