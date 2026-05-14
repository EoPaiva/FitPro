-- ==================================================
-- FITPRO ELITE — SPRINT 14
-- Supabase schema incremental para WhatsApp webhook + sync ampliado
-- Rode no Supabase SQL Editor se as tabelas ainda não existirem.
-- Não coloque secrets neste arquivo.
-- ==================================================

create table if not exists public.whatsapp_webhook_events (
  id text primary key,
  workspace_id text not null,
  event_key text not null unique,
  webhook_type text not null default 'message',
  message_id text,
  from_phone text,
  to_phone text,
  contact_name text,
  status text,
  text text,
  payload_json jsonb not null default '{}'::jsonb,
  matched_student_id text,
  matched_user_id text,
  processed_status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_whatsapp_events_phone on public.whatsapp_webhook_events(from_phone, received_at);
create index if not exists idx_whatsapp_events_status on public.whatsapp_webhook_events(processed_status, received_at);

alter table public.whatsapp_webhook_events enable row level security;

alter table public.mercado_pago_webhook_events enable row level security;

-- Campos usados pelo webhook Mercado Pago e por sync ampliado, caso seu Supabase ainda esteja com schema antigo.
alter table public.payments add column if not exists mercado_pago_id text;
alter table public.payments add column if not exists mercado_pago_status text;
alter table public.payments add column if not exists mercado_pago_status_detail text;
alter table public.payments add column if not exists mercado_pago_preapproval_id text;
alter table public.payments add column if not exists mercado_pago_preference_id text;
alter table public.payments add column if not exists mercado_pago_last_event_id text;
alter table public.payments add column if not exists mercado_pago_last_event_type text;
alter table public.payments add column if not exists mercado_pago_last_payload_json jsonb default '{}'::jsonb;
alter table public.payments add column if not exists payment_provider text;
alter table public.payments add column if not exists checkout_created_at timestamptz;
alter table public.payments add column if not exists last_webhook_at timestamptz;
alter table public.payments add column if not exists paid_at timestamptz;

create index if not exists idx_payments_mercado_pago on public.payments(mercado_pago_id, mercado_pago_preapproval_id);

-- Observação: o backend usa service_role no Railway para operar server-side.
-- Policies finais por usuário/tenant devem ser criadas quando o Supabase-first substituir o SQLite completamente.
