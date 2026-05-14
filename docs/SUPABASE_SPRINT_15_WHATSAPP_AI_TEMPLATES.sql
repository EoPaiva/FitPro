-- ==================================================
-- FITPRO ELITE — SPRINT 15
-- WhatsApp + IA automática e templates aprovados
-- Rode no Supabase SQL Editor se quiser espelhar estes dados.
-- Não contém secrets.
-- ==================================================

create table if not exists public.whatsapp_ai_replies (
  id text primary key,
  workspace_id text not null,
  student_id text,
  inbound_message_id text unique,
  inbound_text text,
  ai_answer text,
  provider text,
  whatsapp_message_id text,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz default now()
);

create table if not exists public.whatsapp_template_sends (
  id text primary key,
  workspace_id text not null,
  template_key text not null,
  template_name text not null,
  language text not null default 'pt_BR',
  to_phone text not null,
  student_id text,
  status text not null default 'sent',
  provider_message_id text,
  payload_json jsonb not null default '{}'::jsonb,
  error_message text,
  sent_by text,
  created_at timestamptz default now()
);

create index if not exists idx_whatsapp_ai_replies_student
on public.whatsapp_ai_replies(student_id, created_at);

create index if not exists idx_whatsapp_ai_replies_workspace
on public.whatsapp_ai_replies(workspace_id, created_at);

create index if not exists idx_whatsapp_template_sends_student
on public.whatsapp_template_sends(student_id, created_at);

create index if not exists idx_whatsapp_template_sends_workspace
on public.whatsapp_template_sends(workspace_id, created_at);

alter table public.whatsapp_ai_replies enable row level security;
alter table public.whatsapp_template_sends enable row level security;

-- Policies finais por usuário/tenant devem ser fechadas quando o Supabase-first for ativado 100%.
-- O backend atual usa service role apenas no Railway.
