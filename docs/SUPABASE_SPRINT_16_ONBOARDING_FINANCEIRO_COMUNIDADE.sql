-- FitPro Elite — Sprint 16
-- Onboarding real, badges, reações, hábitos rápidos e separação financeira.
-- Rode no Supabase SQL Editor apenas quando for preparar o espelhamento Supabase.
-- O backend atual continua seguro com SQLite-first + sync/fallback.

create table if not exists public.badges (
  id text primary key,
  workspace_id text not null,
  student_id text not null,
  key text not null,
  name text not null,
  icon text,
  description text,
  criteria text,
  rarity text default 'comum',
  unlocked_at timestamptz,
  status text default 'bloqueada',
  created_at timestamptz default now()
);

create table if not exists public.community_reactions (
  id text primary key,
  workspace_id text not null,
  post_id text not null,
  user_id text not null,
  user_name text not null,
  user_avatar text,
  emoji text not null,
  reaction_type text not null,
  created_at timestamptz default now(),
  unique(post_id, user_id, reaction_type)
);

create table if not exists public.trainer_payment_settings (
  id text primary key,
  workspace_id text not null,
  trainer_id text not null,
  pix_key_type text,
  pix_key text,
  receiver_name text,
  bank_name text,
  document_optional text,
  instructions text,
  qr_code_url text,
  accepts_manual_payment integer default 1,
  accepts_receipt integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.trainer_plans (
  id text primary key,
  workspace_id text not null,
  trainer_id text not null,
  name text not null,
  price numeric not null default 0,
  billing_cycle text default 'mensal',
  description text,
  benefits_json jsonb default '[]'::jsonb,
  classes_limit text,
  contents_included text,
  support_included text,
  status text default 'ativo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.student_payments (
  id text primary key,
  workspace_id text not null,
  student_id text not null,
  trainer_id text not null,
  trainer_plan_id text,
  amount numeric not null default 0,
  due_date date,
  status text not null default 'aguardando_comprovante',
  receipt_url text,
  receipt_file_name text,
  payment_method text default 'pix_manual',
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.platform_subscriptions (
  id text primary key,
  workspace_id text not null,
  trainer_id text not null,
  plan_name text not null,
  amount numeric not null default 0,
  status text not null default 'trial',
  due_date date,
  paid_at timestamptz,
  mercado_pago_payment_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.payment_logs (
  id text primary key,
  workspace_id text not null,
  payment_id text not null,
  type text not null,
  action text not null,
  user_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.students add column if not exists requested_trainer_id text;
alter table public.students add column if not exists requested_trainer_plan_id text;
alter table public.students add column if not exists onboarding_completed_at timestamptz;
alter table public.students add column if not exists avatar_url text;
alter table public.students add column if not exists payment_flow text default 'student_to_trainer_pix';

alter table public.habits add column if not exists quick_checkin_json jsonb default '{}'::jsonb;
alter table public.habits add column if not exists quick_score integer default 0;
alter table public.habits add column if not exists quick_feedback text;
alter table public.habits add column if not exists advanced_mode integer default 0;

alter table public.trainers add column if not exists platform_subscription_status text default 'trial';
alter table public.trainers add column if not exists platform_plan_name text default 'Starter';
alter table public.trainers add column if not exists platform_plan_amount numeric default 100;
alter table public.trainers add column if not exists payment_blocked_at timestamptz;

create index if not exists idx_badges_student on public.badges(student_id, status);
create index if not exists idx_community_reactions_post on public.community_reactions(post_id, emoji);
create index if not exists idx_trainer_plans_trainer on public.trainer_plans(trainer_id, status);
create index if not exists idx_student_payments_trainer on public.student_payments(trainer_id, status);
create index if not exists idx_platform_subscriptions_trainer on public.platform_subscriptions(trainer_id, status);

alter table public.badges enable row level security;
alter table public.community_reactions enable row level security;
alter table public.trainer_payment_settings enable row level security;
alter table public.trainer_plans enable row level security;
alter table public.student_payments enable row level security;
alter table public.platform_subscriptions enable row level security;
alter table public.payment_logs enable row level security;
