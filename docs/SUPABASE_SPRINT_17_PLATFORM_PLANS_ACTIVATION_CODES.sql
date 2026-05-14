-- ==================================================
-- FITPRO ELITE — SPRINT 17
-- Planos da plataforma + códigos de ativação para personal
-- Rodar no Supabase SQL Editor quando quiser espelhar essas tabelas.
-- Não inclui secrets.
-- ==================================================

create table if not exists public.platform_plans (
  id text primary key,
  workspace_id text not null,
  code text unique not null,
  name text not null,
  price numeric not null default 0,
  billing_cycle text not null default 'mensal',
  objective text,
  resources_json jsonb not null default '[]'::jsonb,
  limitations_json jsonb not null default '[]'::jsonb,
  student_limit integer default 0,
  status text not null default 'ativo',
  sort_order integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.platform_activation_codes (
  id text primary key,
  workspace_id text not null,
  code text unique not null,
  name text,
  type text not null default 'cortesia',
  platform_plan_id text not null,
  duration_days integer not null default 30,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  status text not null default 'ativo',
  expires_at timestamptz,
  assigned_trainer_id text,
  created_by text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.activation_code_redemptions (
  id text primary key,
  workspace_id text not null,
  activation_code_id text not null,
  trainer_id text not null,
  user_id text not null,
  redeemed_at timestamptz default now(),
  subscription_id text,
  metadata jsonb default '{}'::jsonb
);

alter table public.platform_subscriptions add column if not exists platform_plan_id text;
alter table public.platform_subscriptions add column if not exists source text default 'mercado_pago';
alter table public.platform_subscriptions add column if not exists activation_code_id text;
alter table public.platform_subscriptions add column if not exists starts_at timestamptz;
alter table public.platform_subscriptions add column if not exists expires_at timestamptz;
alter table public.platform_subscriptions add column if not exists payment_method text;
alter table public.platform_subscriptions add column if not exists metadata jsonb default '{}'::jsonb;

insert into public.platform_plans (id, workspace_id, code, name, price, billing_cycle, objective, resources_json, limitations_json, student_limit, status, sort_order)
values
(
  'platform_plan_start',
  'ws_fitpro_elite',
  'fitpro_start',
  'FitPro Start',
  49.99,
  'mensal',
  'Para personal que está começando, quer organizar seus alunos e usar o FitPro como painel básico de acompanhamento.',
  '["até 10 alunos ativos","cadastro de alunos","criação de treinos","treino provisório","avaliação física básica","pagamentos manuais via Pix próprio","envio e análise de comprovantes","chat básico com alunos","perfil público simples","dashboard básico","conteúdos limitados","comunidade básica","suporte padrão","configurações básicas de pagamento"]'::jsonb,
  '["sem IA avançada","sem relatórios avançados","sem sorteios próprios avançados"]'::jsonb,
  10,
  'ativo',
  1
),
(
  'platform_plan_plus',
  'ws_fitpro_elite',
  'fitpro_plus',
  'FitPro Plus',
  149.99,
  'mensal',
  'Para personal que quer usar o FitPro como uma central profissional completa para vender, acompanhar, motivar e reter alunos.',
  '["até 100 alunos ativos","treinos personalizados","treino provisório","biblioteca de exercícios","avaliações físicas completas","fotos de evolução","relatórios de evolução","pagamentos manuais com Pix próprio","comprovantes e histórico financeiro","chat completo","comunidade","desafios","pódio","FitPoints","recompensas","conteúdos/aulas","FitPro Academy","hábitos e rotina","suplementos","configurações completas de planos para alunos","página pública do personal mais completa","WhatsApp Link","IA assistiva limitada","relatórios para retenção","painel financeiro de alunos","suporte prioritário","status e logs básicos"]'::jsonb,
  '[]'::jsonb,
  100,
  'ativo',
  2
)
on conflict (code) do update set
  name = excluded.name,
  price = excluded.price,
  billing_cycle = excluded.billing_cycle,
  objective = excluded.objective,
  resources_json = excluded.resources_json,
  limitations_json = excluded.limitations_json,
  student_limit = excluded.student_limit,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = now();

create index if not exists idx_platform_plans_workspace on public.platform_plans(workspace_id, status, sort_order);
create index if not exists idx_platform_activation_codes_code on public.platform_activation_codes(code, status);
create index if not exists idx_activation_code_redemptions_trainer on public.activation_code_redemptions(trainer_id, redeemed_at);
create index if not exists idx_platform_subscriptions_plan on public.platform_subscriptions(platform_plan_id, source, status);

alter table public.platform_plans enable row level security;
alter table public.platform_activation_codes enable row level security;
alter table public.activation_code_redemptions enable row level security;
