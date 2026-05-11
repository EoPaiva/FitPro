import { DatabaseSync } from 'node:sqlite';
import { config } from './config.mjs';

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, brand_name TEXT NOT NULL, owner_trainer_id TEXT,
      plan TEXT NOT NULL DEFAULT 'Elite', status TEXT NOT NULL DEFAULT 'ativo', primary_color TEXT DEFAULT '#00e676',
      secondary_color TEXT DEFAULT '#10b981', whatsapp TEXT DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT, trainer_id TEXT, name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL,
      failed_logins INTEGER NOT NULL DEFAULT 0, locked_until TEXT, avatar TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS trainers (
      id TEXT PRIMARY KEY, user_id TEXT, workspace_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
      phone TEXT, specialty TEXT, bio TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY, user_id TEXT, workspace_id TEXT NOT NULL, trainer_id TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL, phone TEXT, city TEXT, goal TEXT, birthdate TEXT, height REAL, initial_weight REAL,
      current_weight REAL, level TEXT, restrictions TEXT, plan_id TEXT, status TEXT NOT NULL DEFAULT 'ativo',
      last_activity_at TEXT, consents_json TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL, duration_days INTEGER NOT NULL,
      description TEXT, benefits_json TEXT NOT NULL, limits_text TEXT, featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL, FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, trainer_id TEXT NOT NULL, student_id TEXT, title TEXT NOT NULL,
      goal TEXT, level TEXT, method TEXT, estimated_minutes INTEGER, intensity TEXT, status TEXT, exercises_json TEXT NOT NULL,
      created_at TEXT NOT NULL, FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, trainer_id TEXT NOT NULL, student_id TEXT NOT NULL, title TEXT NOT NULL,
      date TEXT NOT NULL, time TEXT NOT NULL, type TEXT, status TEXT, location TEXT, online_link TEXT, notes TEXT,
      created_at TEXT NOT NULL, FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT NOT NULL, date TEXT NOT NULL, weight REAL,
      body_fat REAL, lean_mass REAL, waist REAL, abdomen REAL, hip REAL, chest REAL, right_arm REAL, left_arm REAL,
      right_thigh REAL, left_thigh REAL, calf REAL, photo_name TEXT, energy INTEGER, sleep INTEGER, soreness INTEGER,
      mood TEXT, notes TEXT, professional_notes TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT NOT NULL, plan_id TEXT NOT NULL, amount REAL NOT NULL,
      due_date TEXT NOT NULL, status TEXT NOT NULL, proof_name TEXT, proof_mime_type TEXT, proof_size INTEGER,
      proof_path TEXT, proof_uploaded_at TEXT, proof_student_note TEXT, proof_viewed_at TEXT, proof_viewed_by TEXT,
      external_link TEXT, note TEXT, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS payment_history (
      id TEXT PRIMARY KEY, payment_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
      read_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, entity TEXT,
      entity_id TEXT, metadata TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT, author TEXT NOT NULL, category TEXT NOT NULL,
      text TEXT NOT NULL, visibility TEXT DEFAULT 'publico', likes_json TEXT NOT NULL, comments_json TEXT NOT NULL,
      pinned INTEGER DEFAULT 0, reported INTEGER DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, category TEXT, type TEXT,
      url TEXT, access_plan_ids_json TEXT NOT NULL, student_access_ids_json TEXT NOT NULL, featured INTEGER DEFAULT 0,
      completed_by_json TEXT NOT NULL, views INTEGER DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT NOT NULL, sender_id TEXT NOT NULL, text TEXT NOT NULL,
      resolved INTEGER DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, goal TEXT, origin TEXT,
      status TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, metric TEXT, target INTEGER,
      reward TEXT, start_date TEXT, end_date TEXT, participants_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT NOT NULL, date TEXT NOT NULL, water_ml INTEGER,
      sleep_hours REAL, steps INTEGER, meals INTEGER, mood TEXT, energy INTEGER, notes TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS supplements (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT NOT NULL, name TEXT NOT NULL, objective TEXT,
      schedule_text TEXT, frequency TEXT, notes TEXT, validated_by_professional INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS integration_settings (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, key TEXT NOT NULL, status TEXT NOT NULL, public_config_json TEXT NOT NULL,
      last_test_at TEXT, created_at TEXT NOT NULL, UNIQUE(workspace_id, key)
    );
    CREATE TABLE IF NOT EXISTS automation_rules (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, trigger_name TEXT NOT NULL, channel TEXT NOT NULL,
      message TEXT NOT NULL, active INTEGER DEFAULT 1, created_at TEXT NOT NULL
    );
  `);
}

export function get(sql, params = []) { return db.prepare(sql).get(...params); }
export function all(sql, params = []) { return db.prepare(sql).all(...params); }
export function run(sql, params = []) { return db.prepare(sql).run(...params); }
export function json(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
export function toJSON(value) { return JSON.stringify(value ?? null); }

migrate();
