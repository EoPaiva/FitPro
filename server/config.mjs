import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) process.env[key] = rest.join('=').trim();
  }
}

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function splitOrigins(value = '') {
  return value.split(',').map(origin => origin.trim()).filter(Boolean);
}

const appUrl = env('APP_URL', env('APP_ORIGIN', 'http://localhost:5173'));
const corsOrigin = env('CORS_ORIGIN', appUrl);
const corsOrigins = env('CORS_ORIGINS', '');
const allowedOrigins = Array.from(new Set([
  ...splitOrigins(corsOrigins),
  ...splitOrigins(corsOrigin),
  ...splitOrigins(appUrl),
  'http://localhost:5173',
  'http://localhost:3000',
  'https://fit-pro-xp7c.vercel.app',
  'https://fit-pro-xp7c-jn8uju0eq-eopaivas-projects.vercel.app'
].filter(Boolean)));

export const config = {
  root,
  port: Number(env('PORT', '3333')),
  appUrl,
  corsOrigin,
  corsOrigins,
  allowedOrigins,
  apiUrl: env('API_URL', env('RAILWAY_API_URL', 'http://localhost:3333')),
  dbPath: path.resolve(root, env('DATABASE_PATH', './data/fitpro.sqlite')),
  uploadsDir: path.resolve(root, env('UPLOAD_DIR', env('UPLOADS_DIR', './storage/uploads'))),
  authSecret: env('AUTH_SECRET', env('JWT_SECRET', 'fitpro_dev_secret_change_me')),
  cookieName: env('AUTH_COOKIE_NAME', 'fitpro_session'),
  tokenTtlSeconds: Number(env('AUTH_TOKEN_EXPIRES_IN', String(12 * 3600))),
  tokenTtlHours: Math.max(1, Math.ceil(Number(env('AUTH_TOKEN_EXPIRES_IN', String(12 * 3600))) / 3600)),
  nodeEnv: env('NODE_ENV', 'development'),
  demoMode: env('DEMO_MODE', 'false') === 'true',
  pushEnabled: env('PUSH_ENABLED', 'true') !== 'false',
  vapidPublicKey: env('VAPID_PUBLIC_KEY', ''),
  vapidPrivateKey: env('VAPID_PRIVATE_KEY', ''),
  vapidSubject: env('VAPID_SUBJECT', 'mailto:suporte@fitpro.local')
};

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(path.join(config.uploadsDir, 'proofs'), { recursive: true });
fs.mkdirSync(path.join(config.uploadsDir, 'avatars'), { recursive: true });
fs.mkdirSync(path.join(config.uploadsDir, 'progress'), { recursive: true });
fs.mkdirSync(path.join(config.uploadsDir, 'contents'), { recursive: true });
