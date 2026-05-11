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

export const config = {
  root,
  port: Number(process.env.PORT || 3333),
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:5173',
  dbPath: path.resolve(root, process.env.DATABASE_PATH || './data/fitpro.sqlite'),
  uploadsDir: path.resolve(root, process.env.UPLOADS_DIR || './uploads/private'),
  jwtSecret: process.env.JWT_SECRET || 'fitpro_dev_secret_change_me',
  tokenTtlHours: Number(process.env.TOKEN_TTL_HOURS || 12)
};

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(path.join(config.uploadsDir, 'proofs'), { recursive: true });
