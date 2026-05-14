import { DatabaseSync } from 'node:sqlite';
import { config } from './config.mjs';

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(col => col.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

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
    CREATE TABLE IF NOT EXISTS workout_plans (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, trainer_id TEXT NOT NULL, student_id TEXT, title TEXT NOT NULL,
      objective TEXT, type TEXT, level TEXT, modality TEXT, location TEXT, frequency_per_week TEXT, estimated_duration TEXT,
      start_date TEXT, review_date TEXT, status TEXT NOT NULL DEFAULT 'rascunho', notes TEXT, safety_notes TEXT,
      progression_rule TEXT, review_frequency TEXT, load_adjustment TEXT, weekly_goal TEXT, warmup TEXT, cardio TEXT,
      cooldown TEXT, equipment_needed TEXT, motivational_message TEXT, version INTEGER DEFAULT 1, source_template TEXT,
      published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS workout_days (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, workout_plan_id TEXT NOT NULL, name TEXT NOT NULL, focus TEXT,
      muscle_group TEXT, weekday TEXT, day_type TEXT DEFAULT 'treino', day_order INTEGER DEFAULT 1, intensity TEXT, estimated_duration TEXT, optional INTEGER DEFAULT 0, notes TEXT,
      created_at TEXT NOT NULL, FOREIGN KEY(workout_plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS workout_exercises (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, workout_day_id TEXT NOT NULL, exercise_id TEXT, name TEXT NOT NULL,
      muscle_group TEXT, category TEXT, equipment TEXT, sets TEXT, reps TEXT, load TEXT, load_unit TEXT, rest_seconds TEXT,
      tempo TEXT, rpe TEXT, rir TEXT, method TEXT, notes TEXT, video_url TEXT, image_url TEXT, substitutions TEXT, cautions TEXT,
      exercise_order INTEGER DEFAULT 1, created_at TEXT NOT NULL,
      FOREIGN KEY(workout_day_id) REFERENCES workout_days(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS exercise_library (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, trainer_id TEXT, name TEXT NOT NULL, description TEXT, muscle_group TEXT,
      category TEXT, equipment TEXT, level TEXT, video_url TEXT, image_url TEXT, execution_notes TEXT, common_mistakes TEXT,
      substitutions TEXT, cautions TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workout_plan_versions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, workout_plan_id TEXT NOT NULL, version INTEGER NOT NULL, snapshot_json TEXT NOT NULL,
      changed_by TEXT, reason TEXT, created_at TEXT NOT NULL, FOREIGN KEY(workout_plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS workout_plan_drafts (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, trainer_id TEXT NOT NULL, student_id TEXT, workout_plan_id TEXT,
      title TEXT, status TEXT DEFAULT 'rascunho', draft_json TEXT NOT NULL, source TEXT, last_step INTEGER DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(workspace_id, trainer_id, student_id, workout_plan_id)
    );
    CREATE TABLE IF NOT EXISTS personal_workout_templates (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, trainer_id TEXT NOT NULL, title TEXT NOT NULL, objective TEXT,
      source_plan_id TEXT, template_json TEXT NOT NULL, favorite INTEGER DEFAULT 0, usage_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workout_logs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, workout_plan_id TEXT NOT NULL, workout_day_id TEXT, student_id TEXT NOT NULL,
      completed_at TEXT, notes TEXT, difficulty TEXT, pain_reported TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workout_exercise_logs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, workout_log_id TEXT NOT NULL, workout_exercise_id TEXT, completed INTEGER DEFAULT 0,
      load_used TEXT, reps_done TEXT, difficulty TEXT, notes TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(workout_log_id) REFERENCES workout_logs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS workout_exercise_completions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT NOT NULL, trainer_id TEXT, workout_plan_id TEXT NOT NULL,
      workout_day_id TEXT NOT NULL, workout_exercise_id TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 1,
      completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(student_id, workout_day_id, workout_exercise_id)
    );
    CREATE TABLE IF NOT EXISTS workout_day_progress (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT NOT NULL, trainer_id TEXT, workout_plan_id TEXT NOT NULL,
      workout_day_id TEXT NOT NULL, total_exercises INTEGER DEFAULT 0, completed_exercises INTEGER DEFAULT 0,
      progress_percent INTEGER DEFAULT 0, is_completed INTEGER DEFAULT 0, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(student_id, workout_day_id)
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
    CREATE TABLE IF NOT EXISTS google_connections (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, trainer_id TEXT,
      google_email TEXT, access_token_encrypted TEXT, refresh_token_encrypted TEXT, token_type TEXT,
      scope TEXT, expires_at TEXT, calendar_id TEXT DEFAULT 'primary', status TEXT NOT NULL DEFAULT 'connected',
      last_sync_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, schedule_id TEXT, trainer_id TEXT, student_id TEXT,
      provider TEXT NOT NULL DEFAULT 'google', provider_event_id TEXT, title TEXT NOT NULL, starts_at TEXT,
      ends_at TEXT, meet_link TEXT, html_link TEXT, status TEXT NOT NULL DEFAULT 'created', metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS automation_rules (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, trigger_name TEXT NOT NULL, channel TEXT NOT NULL,
      message TEXT NOT NULL, active INTEGER DEFAULT 1, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reward_items (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, points INTEGER NOT NULL,
      type TEXT NOT NULL, active INTEGER DEFAULT 1, stock INTEGER DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reward_redemptions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT NOT NULL, reward_id TEXT NOT NULL, points INTEGER NOT NULL,
      status TEXT NOT NULL, note TEXT, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS challenge_checkins (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, challenge_id TEXT NOT NULL, student_id TEXT NOT NULL, user_id TEXT NOT NULL,
      status TEXT NOT NULL, note TEXT, photo_name TEXT, points INTEGER DEFAULT 0, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS giveaways (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL, prize TEXT NOT NULL, description TEXT, scope TEXT NOT NULL,
      status TEXT NOT NULL, starts_at TEXT, ends_at TEXT, winners_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, giveaway_id TEXT NOT NULL, student_id TEXT NOT NULL, chances INTEGER NOT NULL,
      reason TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS integration_logs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, integration TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL,
      related_id TEXT, message TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mercado_pago_webhook_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      request_id TEXT,
      event_type TEXT,
      resource_id TEXT,
      external_reference TEXT,
      payment_id TEXT,
      mercado_pago_status TEXT,
      signature_valid INTEGER DEFAULT 0,
      processed_status TEXT NOT NULL DEFAULT 'received',
      payload_json TEXT NOT NULL DEFAULT '{}',
      error_message TEXT,
      received_at TEXT NOT NULL,
      processed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      webhook_type TEXT NOT NULL DEFAULT 'message',
      message_id TEXT,
      from_phone TEXT,
      to_phone TEXT,
      contact_name TEXT,
      status TEXT,
      text TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      matched_student_id TEXT,
      matched_user_id TEXT,
      processed_status TEXT NOT NULL DEFAULT 'received',
      error_message TEXT,
      received_at TEXT NOT NULL,
      processed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS whatsapp_ai_replies (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      student_id TEXT,
      inbound_message_id TEXT UNIQUE,
      inbound_text TEXT,
      ai_answer TEXT,
      provider TEXT,
      whatsapp_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS whatsapp_template_sends (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      template_key TEXT NOT NULL,
      template_name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'pt_BR',
      to_phone TEXT NOT NULL,
      student_id TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      provider_message_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      error_message TEXT,
      sent_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_help_logs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, provider TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    );
    CREATE TABLE IF NOT EXISTS system_status (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      checked_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS storage_fallback_files (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      owner_id TEXT,
      bucket TEXT,
      object_path TEXT,
      local_path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    );
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      push_enabled INTEGER DEFAULT 0,
      email_enabled INTEGER DEFAULT 1,
      whatsapp_enabled INTEGER DEFAULT 1,
      quiet_hours_start TEXT,
      quiet_hours_end TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id)
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      subscription_json TEXT NOT NULL,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_sent_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS point_ledger (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      source TEXT NOT NULL,
      reason TEXT NOT NULL,
      points INTEGER NOT NULL,
      rule_key TEXT NOT NULL,
      reference_id TEXT,
      status TEXT NOT NULL DEFAULT 'aprovado',
      risk_score INTEGER DEFAULT 0,
      risk_flags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      UNIQUE(student_id, rule_key)
    );
    CREATE TABLE IF NOT EXISTS antifraud_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      student_id TEXT,
      actor_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenant_branding (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE,
      public_slug TEXT UNIQUE,
      logo_path TEXT,
      cover_path TEXT,
      headline TEXT,
      public_description TEXT,
      primary_color TEXT,
      accent_color TEXT,
      custom_domain TEXT,
      whatsapp_cta TEXT,
      active INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS referral_codes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      trainer_id TEXT,
      student_id TEXT,
      code TEXT NOT NULL UNIQUE,
      reward_points INTEGER DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      max_uses INTEGER DEFAULT 0,
      uses INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      discount_type TEXT NOT NULL DEFAULT 'percent',
      discount_value REAL NOT NULL DEFAULT 0,
      min_amount REAL DEFAULT 0,
      max_uses INTEGER DEFAULT 0,
      uses INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS device_connections (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected',
      last_sync_at TEXT,
      metrics_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS health_metrics (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      source TEXT NOT NULL,
      metric_date TEXT NOT NULL,
      steps INTEGER DEFAULT 0,
      calories INTEGER DEFAULT 0,
      active_minutes INTEGER DEFAULT 0,
      sleep_hours REAL DEFAULT 0,
      heart_rate_avg INTEGER DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL, icon TEXT,
      description TEXT, criteria TEXT, rarity TEXT DEFAULT 'comum', unlocked_at TEXT, status TEXT DEFAULT 'bloqueada', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS community_reactions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, post_id TEXT NOT NULL, user_id TEXT NOT NULL, user_name TEXT NOT NULL,
      user_avatar TEXT, emoji TEXT NOT NULL, reaction_type TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(post_id, user_id, reaction_type)
    );
    CREATE TABLE IF NOT EXISTS trainer_payment_settings (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, trainer_id TEXT NOT NULL, pix_key_type TEXT, pix_key TEXT, receiver_name TEXT,
      bank_name TEXT, document_optional TEXT, instructions TEXT, qr_code_url TEXT, accepts_manual_payment INTEGER DEFAULT 1,
      accepts_receipt INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trainer_plans (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, trainer_id TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL,
      billing_cycle TEXT DEFAULT 'mensal', description TEXT, benefits_json TEXT DEFAULT '[]', classes_limit TEXT, contents_included TEXT,
      support_included TEXT, status TEXT DEFAULT 'ativo', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS student_payments (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, student_id TEXT NOT NULL, trainer_id TEXT NOT NULL, trainer_plan_id TEXT,
      amount REAL NOT NULL, due_date TEXT, status TEXT NOT NULL DEFAULT 'aguardando_comprovante', receipt_url TEXT, receipt_file_name TEXT,
      payment_method TEXT DEFAULT 'pix_manual', reviewed_by TEXT, reviewed_at TEXT, rejection_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_plans (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, price REAL NOT NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'mensal', objective TEXT, resources_json TEXT NOT NULL DEFAULT '[]',
      limitations_json TEXT NOT NULL DEFAULT '[]', student_limit INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'ativo',
      sort_order INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_subscriptions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, trainer_id TEXT NOT NULL, plan_name TEXT NOT NULL, amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'trial', due_date TEXT, paid_at TEXT, mercado_pago_payment_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_activation_codes (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, code TEXT UNIQUE NOT NULL, name TEXT, type TEXT NOT NULL DEFAULT 'cortesia',
      platform_plan_id TEXT NOT NULL, duration_days INTEGER NOT NULL DEFAULT 30, max_uses INTEGER NOT NULL DEFAULT 1, used_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ativo', expires_at TEXT, assigned_trainer_id TEXT, created_by TEXT, notes TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activation_code_redemptions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, activation_code_id TEXT NOT NULL, trainer_id TEXT NOT NULL, user_id TEXT NOT NULL,
      redeemed_at TEXT NOT NULL, subscription_id TEXT, metadata TEXT DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS payment_logs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, payment_id TEXT NOT NULL, type TEXT NOT NULL, action TEXT NOT NULL, user_id TEXT, metadata TEXT, created_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_storage_fallback_status ON storage_fallback_files(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_point_ledger_student ON point_ledger(student_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_antifraud_events_workspace ON antifraud_events(workspace_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_referral_codes_workspace ON referral_codes(workspace_id, active);
    CREATE INDEX IF NOT EXISTS idx_coupons_workspace ON coupons(workspace_id, active);
    CREATE INDEX IF NOT EXISTS idx_device_connections_student ON device_connections(student_id, provider);
    CREATE INDEX IF NOT EXISTS idx_health_metrics_student_date ON health_metrics(student_id, metric_date);
    CREATE INDEX IF NOT EXISTS idx_badges_student ON badges(student_id, status);
    CREATE INDEX IF NOT EXISTS idx_community_reactions_post ON community_reactions(post_id, emoji);
    CREATE INDEX IF NOT EXISTS idx_trainer_plans_trainer ON trainer_plans(trainer_id, status);
    CREATE INDEX IF NOT EXISTS idx_student_payments_trainer ON student_payments(trainer_id, status);
    CREATE INDEX IF NOT EXISTS idx_platform_plans_workspace ON platform_plans(workspace_id, status, sort_order);
    CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_trainer ON platform_subscriptions(trainer_id, status);
    CREATE INDEX IF NOT EXISTS idx_platform_activation_codes_code ON platform_activation_codes(code, status);
    CREATE INDEX IF NOT EXISTS idx_activation_code_redemptions_trainer ON activation_code_redemptions(trainer_id, redeemed_at);
    CREATE INDEX IF NOT EXISTS idx_workout_plans_workspace_status ON workout_plans(workspace_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_workout_plans_student ON workout_plans(student_id, status);
    CREATE INDEX IF NOT EXISTS idx_workout_drafts_trainer ON workout_plan_drafts(workspace_id, trainer_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_personal_templates_trainer ON personal_workout_templates(workspace_id, trainer_id, favorite, updated_at);
    CREATE INDEX IF NOT EXISTS idx_workout_days_plan ON workout_days(workout_plan_id, day_order);
    CREATE INDEX IF NOT EXISTS idx_workout_exercises_day ON workout_exercises(workout_day_id, exercise_order);
    CREATE INDEX IF NOT EXISTS idx_exercise_library_workspace ON exercise_library(workspace_id, muscle_group, equipment);
    CREATE INDEX IF NOT EXISTS idx_workout_logs_student ON workout_logs(student_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_workout_completions_student_day ON workout_exercise_completions(student_id, workout_day_id, completed);
    CREATE INDEX IF NOT EXISTS idx_workout_progress_student ON workout_day_progress(student_id, workout_day_id, is_completed);
    CREATE INDEX IF NOT EXISTS idx_students_trainer_status ON students(trainer_id, status);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, due_date);
    CREATE INDEX IF NOT EXISTS idx_mercado_pago_events_payment ON mercado_pago_webhook_events(payment_id, received_at);
    CREATE INDEX IF NOT EXISTS idx_mercado_pago_events_status ON mercado_pago_webhook_events(processed_status, received_at);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_events_phone ON whatsapp_webhook_events(from_phone, received_at);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_events_status ON whatsapp_webhook_events(processed_status, received_at);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_replies_student ON whatsapp_ai_replies(student_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_template_sends_student ON whatsapp_template_sends(student_id, created_at);
  `);

  ensureColumn('students', 'state', 'TEXT');
  ensureColumn('students', 'neighborhood', 'TEXT');
  ensureColumn('students', 'modality', 'TEXT');
  ensureColumn('students', 'training_place', 'TEXT');
  ensureColumn('students', 'availability', 'TEXT');
  ensureColumn('students', 'preferred_payment_day', 'TEXT');
  ensureColumn('students', 'payment_method', 'TEXT');
  ensureColumn('students', 'request_message', 'TEXT');
  ensureColumn('students', 'request_status', "TEXT DEFAULT 'sem_personal'");
  ensureColumn('trainers', 'city', 'TEXT');
  ensureColumn('trainers', 'state', 'TEXT');
  ensureColumn('trainers', 'modalities', 'TEXT');
  ensureColumn('trainers', 'active', 'INTEGER DEFAULT 1');
  ensureColumn('trainers', 'premium', 'INTEGER DEFAULT 0');
  ensureColumn('trainers', 'ai_enabled', 'INTEGER DEFAULT 0');
  ensureColumn('trainers', 'requires_password_change', 'INTEGER DEFAULT 0');
  ensureColumn('users', 'avatar_storage_path', 'TEXT');
  ensureColumn('users', 'avatar_mime_type', 'TEXT');
  ensureColumn('users', 'avatar_size', 'INTEGER DEFAULT 0');
  ensureColumn('users', 'avatar_data_url', 'TEXT');
  ensureColumn('users', 'avatar_updated_at', 'TEXT');
  ensureColumn('users', 'avatar_storage_provider', 'TEXT');
  ensureColumn('users', 'avatar_public_url', 'TEXT');

  ensureColumn('students', 'fit_points', 'INTEGER DEFAULT 0');
  ensureColumn('students', 'onboarding_stage', "TEXT DEFAULT 'aguardando_aprovacao'");
  ensureColumn('students', 'approved_at', 'TEXT');
  ensureColumn('students', 'approved_by', 'TEXT');
  ensureColumn('students', 'blocked_reason', 'TEXT');
  ensureColumn('trainers', 'brand_name', 'TEXT');
  ensureColumn('trainers', 'whatsapp', 'TEXT');
  ensureColumn('trainers', 'instagram', 'TEXT');
  ensureColumn('trainers', 'service_area', 'TEXT');
  ensureColumn('trainers', 'max_students', 'INTEGER DEFAULT 30');
  ensureColumn('contents', 'thumbnail_url', 'TEXT');
  ensureColumn('contents', 'premium', 'INTEGER DEFAULT 0');
  ensureColumn('contents', 'locked', 'INTEGER DEFAULT 0');
  ensureColumn('contents', 'points_awarded_json', "TEXT DEFAULT '[]'");
  ensureColumn('contents', 'media_path', 'TEXT');
  ensureColumn('contents', 'media_mime_type', 'TEXT');
  ensureColumn('contents', 'media_size', 'INTEGER DEFAULT 0');
  ensureColumn('community_posts', 'reactions_json', "TEXT DEFAULT '{}'");
  ensureColumn('community_posts', 'attachments_json', "TEXT DEFAULT '[]'");
  ensureColumn('habits', 'protein_g', 'REAL DEFAULT 0');
  ensureColumn('habits', 'carbs_g', 'REAL DEFAULT 0');
  ensureColumn('habits', 'fat_g', 'REAL DEFAULT 0');
  ensureColumn('habits', 'calories', 'INTEGER DEFAULT 0');
  ensureColumn('habits', 'fiber_g', 'REAL DEFAULT 0');
  ensureColumn('habits', 'supplements_taken_json', "TEXT DEFAULT '[]'");
  ensureColumn('habits', 'quick_checkin_json', "TEXT DEFAULT '{}'");
  ensureColumn('habits', 'quick_score', 'INTEGER DEFAULT 0');
  ensureColumn('habits', 'quick_feedback', 'TEXT');
  ensureColumn('habits', 'advanced_mode', 'INTEGER DEFAULT 0');
  ensureColumn('students', 'requested_trainer_id', 'TEXT');
  ensureColumn('students', 'requested_trainer_plan_id', 'TEXT');
  ensureColumn('students', 'onboarding_completed_at', 'TEXT');
  ensureColumn('students', 'avatar_url', 'TEXT');
  ensureColumn('trainers', 'avatar_url', 'TEXT');
  ensureColumn('students', 'payment_flow', "TEXT DEFAULT 'student_to_trainer_pix'");
  ensureColumn('trainers', 'platform_subscription_status', "TEXT DEFAULT 'trial'");
  ensureColumn('trainers', 'platform_plan_name', "TEXT DEFAULT 'FitPro Start'");
  ensureColumn('trainers', 'platform_plan_amount', 'REAL DEFAULT 49.99');
  ensureColumn('trainers', 'payment_blocked_at', 'TEXT');
  ensureColumn('platform_subscriptions', 'platform_plan_id', 'TEXT');
  ensureColumn('platform_subscriptions', 'source', "TEXT DEFAULT 'mercado_pago'");
  ensureColumn('platform_subscriptions', 'activation_code_id', 'TEXT');
  ensureColumn('platform_subscriptions', 'starts_at', 'TEXT');
  ensureColumn('platform_subscriptions', 'expires_at', 'TEXT');
  ensureColumn('platform_subscriptions', 'payment_method', 'TEXT');
  ensureColumn('platform_subscriptions', 'metadata', "TEXT DEFAULT '{}'");
  ensureColumn('assessments', 'bmi', 'REAL DEFAULT 0');
  ensureColumn('assessments', 'bmi_classification', 'TEXT');
  ensureColumn('assessments', 'ai_summary', 'TEXT');
  ensureColumn('assessments', 'timeline_json', "TEXT DEFAULT '[]'");
  ensureColumn('assessments', 'photo_path', 'TEXT');
  ensureColumn('assessments', 'photo_mime_type', 'TEXT');
  ensureColumn('assessments', 'photo_size', 'INTEGER DEFAULT 0');

  ensureColumn('payments', 'mercado_pago_id', 'TEXT');
  ensureColumn('payments', 'mercado_pago_status', 'TEXT');
  ensureColumn('payments', 'mercado_pago_status_detail', 'TEXT');
  ensureColumn('payments', 'mercado_pago_preapproval_id', 'TEXT');
  ensureColumn('payments', 'mercado_pago_preference_id', 'TEXT');
  ensureColumn('payments', 'mercado_pago_last_event_id', 'TEXT');
  ensureColumn('payments', 'mercado_pago_last_event_type', 'TEXT');
  ensureColumn('payments', 'mercado_pago_last_payload_json', "TEXT DEFAULT '{}'");
  ensureColumn('payments', 'payment_provider', 'TEXT');
  ensureColumn('payments', 'checkout_created_at', 'TEXT');
  ensureColumn('payments', 'last_webhook_at', 'TEXT');
  ensureColumn('payments', 'paid_at', 'TEXT');

  db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_mercado_pago ON payments(mercado_pago_id, mercado_pago_preapproval_id);`);
  ensureColumn('messages', 'attachment_path', 'TEXT');
  ensureColumn('messages', 'attachment_name', 'TEXT');
  ensureColumn('messages', 'attachment_mime_type', 'TEXT');
  ensureColumn('messages', 'read_at', 'TEXT');
  ensureColumn('notifications', 'type', "TEXT DEFAULT 'internal'");
  ensureColumn('notifications', 'action_url', 'TEXT');
  ensureColumn('notifications', 'metadata_json', "TEXT DEFAULT '{}'");

  ensureColumn('workspaces', 'public_slug', 'TEXT');
  ensureColumn('workspaces', 'custom_domain', 'TEXT');
  ensureColumn('workspaces', 'marketplace_enabled', 'INTEGER DEFAULT 1');
  ensureColumn('students', 'referral_code', 'TEXT');
  ensureColumn('students', 'coupon_code', 'TEXT');
  ensureColumn('students', 'public_consent', 'INTEGER DEFAULT 0');
  ensureColumn('trainers', 'public_profile_enabled', 'INTEGER DEFAULT 1');
  ensureColumn('trainers', 'profile_slug', 'TEXT');
  ensureColumn('schedules', 'duration_minutes', 'INTEGER DEFAULT 60');
  ensureColumn('schedules', 'google_event_id', 'TEXT');
  ensureColumn('schedules', 'google_meet_link', 'TEXT');
  ensureColumn('schedules', 'google_html_link', 'TEXT');
  ensureColumn('schedules', 'sync_status', "TEXT DEFAULT 'local'");
  ensureColumn('integration_settings', 'provider_status_json', "TEXT DEFAULT '{}'");
  ensureColumn('workout_days', 'weekday', 'TEXT');
  ensureColumn('workout_days', 'day_type', "TEXT DEFAULT 'treino'");
  ensureColumn('workout_days', 'training_date', 'TEXT');
  ensureColumn('workout_days', 'day_number', 'INTEGER');
  ensureColumn('workout_days', 'completed_at', 'TEXT');
  ensureColumn('workout_exercises', 'tutorial_url', 'TEXT');
  ensureColumn('workout_exercises', 'youtube_url', 'TEXT');
  ensureColumn('workout_exercises', 'progression_note', 'TEXT');
  ensureColumn('workout_exercise_logs', 'pain_reported', 'TEXT');
  ensureColumn('workout_exercise_logs', 'workout_day_id', 'TEXT');
  ensureColumn('workout_logs', 'points_awarded', 'INTEGER DEFAULT 0');
  ensureColumn('workout_logs', 'duration_minutes', 'INTEGER DEFAULT 0');
  ensureColumn('whatsapp_webhook_events', 'webhook_type', "TEXT DEFAULT 'message'");
  ensureColumn('whatsapp_webhook_events', 'message_id', 'TEXT');
  ensureColumn('whatsapp_webhook_events', 'from_phone', 'TEXT');
  ensureColumn('whatsapp_webhook_events', 'to_phone', 'TEXT');
  ensureColumn('whatsapp_webhook_events', 'contact_name', 'TEXT');
  ensureColumn('whatsapp_webhook_events', 'status', 'TEXT');
  ensureColumn('whatsapp_webhook_events', 'text', 'TEXT');
  ensureColumn('whatsapp_webhook_events', 'payload_json', "TEXT DEFAULT '{}'");
  ensureColumn('whatsapp_webhook_events', 'matched_student_id', 'TEXT');
  ensureColumn('whatsapp_webhook_events', 'matched_user_id', 'TEXT');
  ensureColumn('whatsapp_webhook_events', 'processed_status', "TEXT DEFAULT 'received'");
  ensureColumn('whatsapp_webhook_events', 'error_message', 'TEXT');
  ensureColumn('whatsapp_webhook_events', 'received_at', 'TEXT');
  ensureColumn('whatsapp_webhook_events', 'processed_at', 'TEXT');

  ensureColumn('whatsapp_ai_replies', 'workspace_id', 'TEXT');
  ensureColumn('whatsapp_ai_replies', 'student_id', 'TEXT');
  ensureColumn('whatsapp_ai_replies', 'inbound_message_id', 'TEXT');
  ensureColumn('whatsapp_ai_replies', 'inbound_text', 'TEXT');
  ensureColumn('whatsapp_ai_replies', 'ai_answer', 'TEXT');
  ensureColumn('whatsapp_ai_replies', 'provider', 'TEXT');
  ensureColumn('whatsapp_ai_replies', 'whatsapp_message_id', 'TEXT');
  ensureColumn('whatsapp_ai_replies', 'status', "TEXT DEFAULT 'pending'");
  ensureColumn('whatsapp_ai_replies', 'error_message', 'TEXT');
  ensureColumn('whatsapp_ai_replies', 'created_at', 'TEXT');

  ensureColumn('whatsapp_template_sends', 'workspace_id', 'TEXT');
  ensureColumn('whatsapp_template_sends', 'template_key', 'TEXT');
  ensureColumn('whatsapp_template_sends', 'template_name', 'TEXT');
  ensureColumn('whatsapp_template_sends', 'language', "TEXT DEFAULT 'pt_BR'");
  ensureColumn('whatsapp_template_sends', 'to_phone', 'TEXT');
  ensureColumn('whatsapp_template_sends', 'student_id', 'TEXT');
  ensureColumn('whatsapp_template_sends', 'status', "TEXT DEFAULT 'sent'");
  ensureColumn('whatsapp_template_sends', 'provider_message_id', 'TEXT');
  ensureColumn('whatsapp_template_sends', 'payload_json', "TEXT DEFAULT '{}'");
  ensureColumn('whatsapp_template_sends', 'error_message', 'TEXT');
  ensureColumn('whatsapp_template_sends', 'sent_by', 'TEXT');
  ensureColumn('whatsapp_template_sends', 'created_at', 'TEXT');

  const now = new Date().toISOString();
  const defaultWorkspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get()?.id || 'ws_fitpro_elite';
  const startResources = [
    'até 10 alunos ativos','cadastro de alunos','criação de treinos','treino provisório','avaliação física básica',
    'pagamentos manuais via Pix próprio','envio e análise de comprovantes','chat básico com alunos','perfil público simples',
    'dashboard básico','conteúdos limitados','comunidade básica','suporte padrão','configurações básicas de pagamento'
  ];
  const startLimitations = ['sem IA avançada','sem relatórios avançados','sem sorteios próprios avançados'];
  const plusResources = [
    'até 100 alunos ativos','treinos personalizados','treino provisório','biblioteca de exercícios','avaliações físicas completas',
    'fotos de evolução','relatórios de evolução','pagamentos manuais com Pix próprio','comprovantes e histórico financeiro',
    'chat completo','comunidade','desafios','pódio','FitPoints','recompensas','conteúdos/aulas','FitPro Academy',
    'hábitos e rotina','suplementos','configurações completas de planos para alunos','página pública do personal mais completa',
    'WhatsApp Link','IA assistiva limitada','relatórios para retenção','painel financeiro de alunos','suporte prioritário','status e logs básicos'
  ];
  const upsertPlan = db.prepare(`
    INSERT INTO platform_plans (id,workspace_id,code,name,price,billing_cycle,objective,resources_json,limitations_json,student_limit,status,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET name=excluded.name,price=excluded.price,billing_cycle=excluded.billing_cycle,objective=excluded.objective,resources_json=excluded.resources_json,limitations_json=excluded.limitations_json,student_limit=excluded.student_limit,status=excluded.status,sort_order=excluded.sort_order,updated_at=excluded.updated_at
  `);
  upsertPlan.run('platform_plan_start', defaultWorkspace, 'fitpro_start', 'FitPro Start', 49.99, 'mensal', 'Para personal que está começando e quer organizar alunos com painel básico de acompanhamento.', JSON.stringify(startResources), JSON.stringify(startLimitations), 10, 'ativo', 1, now, now);
  upsertPlan.run('platform_plan_plus', defaultWorkspace, 'fitpro_plus', 'FitPro Plus', 149.99, 'mensal', 'Para personal que quer uma central profissional completa para vender, acompanhar, motivar e reter alunos.', JSON.stringify(plusResources), JSON.stringify([]), 100, 'ativo', 2, now, now);
}




export function get(sql, params = []) { return db.prepare(sql).get(...params); }
export function all(sql, params = []) { return db.prepare(sql).all(...params); }
export function run(sql, params = []) { return db.prepare(sql).run(...params); }
export function json(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
export function toJSON(value) { return JSON.stringify(value ?? null); }

migrate();
