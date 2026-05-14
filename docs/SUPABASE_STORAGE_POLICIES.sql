-- ==================================================
-- FITPRO ELITE — SUPABASE STORAGE BUCKETS E POLICIES
-- Execute depois de criar o projeto Supabase.
-- Ajuste as policies conforme o modelo final de Auth/RLS escolhido.
-- ==================================================

insert into storage.buckets (id, name, public)
values
  ('payment-proofs', 'payment-proofs', false),
  ('avatars', 'avatars', false),
  ('progress-photos', 'progress-photos', false),
  ('content-files', 'content-files', false)
on conflict (id) do nothing;

-- Observação: o backend Railway usa service_role para acessar arquivos privados.
-- Enquanto o backend centraliza os downloads, não exponha buckets como public.
-- Para acesso direto pelo frontend no futuro, crie URLs assinadas pelo backend.

-- Exemplo de policy futura para leitura autenticada por auth.uid(), caso seja adotado Supabase Auth direto:
-- create policy "authenticated can read own signed paths"
-- on storage.objects for select
-- to authenticated
-- using (bucket_id in ('avatars','progress-photos','payment-proofs'));

-- Exemplo de policy administrativa opcional:
-- create policy "service role full access"
-- on storage.objects for all
-- to service_role
-- using (true)
-- with check (true);


-- ==================================================
-- BUCKETS PRIVADOS RECOMENDADOS
-- Execute no SQL Editor ou crie pelo painel Storage.
-- ==================================================
insert into storage.buckets (id, name, public)
values
  ('payment-proofs', 'payment-proofs', false),
  ('avatars', 'avatars', false),
  ('progress-photos', 'progress-photos', false),
  ('content-files', 'content-files', false)
on conflict (id) do update set public = excluded.public;

-- A API usa SERVICE_ROLE no backend Railway para gerar URLs assinadas.
-- Portanto as policies abaixo mantêm acesso direto do cliente bloqueado por padrão.
-- Não exponha SUPABASE_SERVICE_ROLE_KEY no frontend.
