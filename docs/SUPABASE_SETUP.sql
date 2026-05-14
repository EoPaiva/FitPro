-- ==================================================
-- FITPRO ELITE — SUPABASE BASE INICIAL
-- Uso futuro para migrar do SQLite local para PostgreSQL/Supabase.
-- Rode no SQL Editor do Supabase quando for ativar a fase de produção real.
-- ==================================================

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  brand_name text not null,
  plan text not null default 'Elite',
  status text not null default 'ativo',
  primary_color text default '#00e676',
  secondary_color text default '#10b981',
  whatsapp text,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  student_id uuid,
  trainer_id uuid,
  name text not null,
  email text unique not null,
  role text not null check (role in ('student','admin','super_admin','dev')),
  avatar_path text,
  status text default 'ativo',
  created_at timestamptz default now()
);

create table if not exists public.trainers (
  id text primary key,
  user_id text,
  workspace_id text not null,
  name text not null,
  email text not null,
  phone text,
  specialty text,
  bio text,
  city text,
  state text,
  modalities text,
  active boolean default true,
  premium boolean default false,
  ai_enabled boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  trainer_id uuid,
  name text not null,
  email text not null,
  phone text,
  city text,
  goal text,
  height numeric,
  initial_weight numeric,
  current_weight numeric,
  level text,
  restrictions text,
  status text default 'ativo',
  consents_json jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  price numeric not null,
  duration_days integer not null default 30,
  description text,
  benefits_json jsonb default '[]'::jsonb,
  featured boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  amount numeric not null,
  due_date date not null,
  status text not null default 'aguardando_comprovante' check (status in ('aguardando_comprovante','em_analise','aprovado','recusado','vencido','cancelado','reembolsado','estornado','em_disputa')),
  proof_name text,
  proof_mime_type text,
  proof_size integer,
  proof_path text,
  proof_uploaded_at timestamptz,
  proof_student_note text,
  proof_viewed_at timestamptz,
  proof_viewed_by uuid references public.profiles(id) on delete set null,
  external_link text,
  note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.payment_history (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz default now()
);

-- Buckets recomendados no Supabase Storage:
-- payment-proofs     privado
-- avatars            privado ou público controlado
-- progress-photos    privado
-- content-files      privado

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.payments enable row level security;
alter table public.payment_history enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

-- Observação:
-- Esta base SQL é uma preparação. A migração completa exige trocar o provider de dados no backend
-- de SQLite para Supabase/PostgreSQL, mantendo as mesmas validações de role e workspace.

-- ==================================================
-- SUPABASE PRINCIPAL + FALLBACK CONTROLADO
-- ==================================================
create table if not exists public.sync_queue (
  id text primary key,
  workspace_id text not null,
  entity text not null,
  entity_id text,
  action text not null,
  payload_json jsonb not null default '{}',
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz
);

create table if not exists public.system_status (
  id text primary key,
  key text unique not null,
  status text not null,
  message text,
  metadata_json jsonb not null default '{}',
  checked_at timestamptz not null default now()
);

create table if not exists public.storage_fallback_files (
  id text primary key,
  workspace_id text not null,
  owner_id text,
  bucket text,
  object_path text,
  local_path text not null,
  mime_type text,
  size integer default 0,
  status text not null default 'pending',
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz
);

create index if not exists idx_sync_queue_status on public.sync_queue(status, created_at);
create index if not exists idx_storage_fallback_status on public.storage_fallback_files(status, created_at);


create table if not exists public.contents (
  id text primary key,
  workspace_id text not null,
  title text not null,
  description text,
  category text,
  type text,
  url text,
  thumbnail_url text,
  media_path text,
  media_mime_type text,
  media_size integer default 0,
  access_plan_ids_json jsonb default '[]'::jsonb,
  student_access_ids_json jsonb default '[]'::jsonb,
  completed_by_json jsonb default '[]'::jsonb,
  views integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.assessments (
  id text primary key,
  workspace_id text not null,
  student_id text not null,
  date date not null,
  weight numeric,
  bmi numeric,
  bmi_classification text,
  ai_summary text,
  timeline_json jsonb default '[]'::jsonb,
  photo_path text,
  photo_mime_type text,
  photo_size integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.habits (
  id text primary key,
  workspace_id text not null,
  student_id text not null,
  date date not null,
  water_ml integer default 0,
  sleep_hours numeric default 0,
  steps integer default 0,
  protein_g numeric default 0,
  carbs_g numeric default 0,
  fat_g numeric default 0,
  calories integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.community_posts (
  id text primary key,
  workspace_id text not null,
  student_id text,
  author text not null,
  category text not null,
  text text not null,
  reactions_json jsonb default '{}'::jsonb,
  comments_json jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.integration_logs (
  id text primary key,
  workspace_id text not null,
  integration text not null,
  action text not null,
  status text not null,
  related_id text,
  message text,
  created_at timestamptz default now()
);


-- Sprint Push/PWA + Antifraude de pontos
create table if not exists public.notification_preferences (id text primary key, workspace_id text not null, user_id text not null unique, push_enabled integer default 0, email_enabled integer default 1, whatsapp_enabled integer default 1, quiet_hours_start text, quiet_hours_end text, updated_at timestamptz default now());
create table if not exists public.push_subscriptions (id text primary key, workspace_id text not null, user_id text not null, endpoint text not null unique, subscription_json jsonb not null default '{}', user_agent text, status text not null default 'active', last_sent_at timestamptz, last_error text, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.point_ledger (id text primary key, workspace_id text not null, student_id text not null, actor_id text not null, source text not null, reason text not null, points integer not null, rule_key text not null, reference_id text, status text not null default 'aprovado', risk_score integer default 0, risk_flags_json jsonb not null default '[]', created_at timestamptz default now(), unique(student_id, rule_key));
create table if not exists public.antifraud_events (id text primary key, workspace_id text not null, student_id text, actor_id text not null, event_type text not null, severity text not null, message text not null, metadata_json jsonb not null default '{}', reviewed_by text, reviewed_at timestamptz, created_at timestamptz default now());


-- Sprint 7 — white label, marketplace e wearables
create table if not exists public.tenant_branding (id text primary key, workspace_id text not null, public_slug text unique, logo_path text, cover_path text, headline text, public_description text, primary_color text, accent_color text, custom_domain text, whatsapp_cta text, active integer default 1, updated_at timestamptz default now(), created_at timestamptz default now());
create table if not exists public.referral_codes (id text primary key, workspace_id text not null, trainer_id text, student_id text, code text unique not null, reward_points integer default 0, discount_percent numeric default 0, max_uses integer default 0, uses integer default 0, active integer default 1, expires_at timestamptz, created_at timestamptz default now());
create table if not exists public.coupons (id text primary key, workspace_id text not null, code text unique not null, description text, discount_type text default 'percent', discount_value numeric default 0, min_amount numeric default 0, max_uses integer default 0, uses integer default 0, active integer default 1, expires_at timestamptz, created_at timestamptz default now());
create table if not exists public.device_connections (id text primary key, workspace_id text not null, student_id text not null, provider text not null, status text default 'connected', last_sync_at timestamptz, metrics_json jsonb default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.health_metrics (id text primary key, workspace_id text not null, student_id text not null, source text not null, metric_date date not null, steps integer default 0, calories integer default 0, active_minutes integer default 0, sleep_hours numeric default 0, heart_rate_avg integer default 0, metadata_json jsonb default '{}', created_at timestamptz default now());


-- Google Calendar / Meet connections
create table if not exists public.google_connections (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  trainer_id text,
  google_email text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_type text,
  scope text,
  expires_at timestamptz,
  calendar_id text default 'primary',
  status text default 'connected',
  last_sync_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.calendar_events (
  id text primary key,
  workspace_id text not null,
  schedule_id text,
  trainer_id text,
  student_id text,
  provider text default 'google',
  provider_event_id text,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  meet_link text,
  html_link text,
  status text default 'created',
  metadata_json jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
