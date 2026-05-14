# FitPro Elite — Relatório Sprint 27

## 🟢 Implementado

🟢 Avatar/foto de perfil passou a priorizar Supabase Storage no bucket `avatars`.

🟢 Backend agora usa `SUPABASE_AVATAR_BUCKET` ou `SUPABASE_STORAGE_BUCKET_AVATARS`, com fallback seguro para `avatars`.

🟢 Upload de avatar passa pelo backend/Railway, envia o arquivo para Supabase Storage e grava no banco uma URL pública/caminho válido.

🟢 `users.avatar`, `users.avatar_public_url`, `users.avatar_storage_path`, `users.avatar_mime_type`, `users.avatar_size`, `users.avatar_updated_at` e `users.avatar_storage_provider` são atualizados no upload.

🟢 Avatar é sincronizado com `students.avatar_url`, `trainers.avatar_url`, comentários e reações da comunidade.

🟢 O frontend deixa de depender de `access_token` em URL de imagem e usa URL normalizada retornada pelo backend.

🟢 Cache local do avatar foi renovado para evitar reaproveitar valores antigos quebrados.

🟢 `/api/profile/avatar/status` agora mostra checks de URL pública, storage path, bootstrap, ausência de token na URL e validação contra `user_id` puro.

🟢 `/api/profile/avatar/repair` agora tenta reconstruir a URL do avatar a partir do storage público/Supabase e ressincroniza o banco/perfis vinculados.

🟢 `/api/profile/avatar/:id` redireciona para URL pública do Supabase quando disponível; se não houver, mantém fallback de endpoint local com Content-Type de imagem.

🟢 Auditoria do workspace agora destaca quantos usuários têm avatar confirmado no Supabase e mostra o bucket de avatar.

🟢 Teste de integração Supabase agora valida também o bucket `avatars`.

🟢 `.env.example` atualizado com `SUPABASE_AVATAR_BUCKET=avatars` sem secrets reais.

## 🟡 Parcial / em espera

🟡 A Sprint 27 foca no avatar com Supabase Storage e reforço de diagnóstico. Pagamentos, códigos, Super Admin e validação das fichas permanecem como próximos blocos de Sprint 27.1/28, para reduzir risco de regressão.

🟡 Se o bucket `avatars` estiver privado, a URL pública pode não abrir. Para esta implementação, o caminho principal espera bucket público ou política de leitura compatível. O fallback `/api/profile/avatar/:id` continua disponível.

🟡 Se o Supabase falhar no upload, o sistema salva fallback local e registra a situação, mas a correção definitiva esperada usa Supabase Storage.

## 🔴 Pendente

🔴 Validar em produção se a foto permanece após F5, logout/login e troca de conta.

🔴 Testar visualmente header, sidebar, perfil, comunidade, comentários, ranking, desafios, pódio e mensagens.

🔴 Planos/Pagamentos e Super Admin operacional completo.

🔴 Validação final das fichas Sprints 24–26.

🔴 Supabase-first 100% do banco inteiro.

🔴 Marketplace/split Mercado Pago.

🔴 Comissão automática.

🔴 KYC/conta conectada do personal.

🔴 Multi-tenant completo.

🔴 Push avançado.

🔴 Antifraude avançado.

🔴 PDF de avaliação física.

🔴 Google Calendar/Meet avançado.

🔴 README novo.

## Arquivos alterados

- `server/supabase.mjs`
- `server/db.mjs`
- `server/index.mjs`
- `src/main.ts`
- `.env.example`
- `docs/RELATORIO_SPRINT_27_AVATAR_SUPABASE_PAGAMENTOS_ADMIN.md`

## Testes realizados

- `npm run type-check` ✅
- `node --check server/index.mjs` ✅
- `node --check server/db.mjs` ✅
- `node --check server/supabase.mjs` ✅
- `node --check server/integrations.mjs` ✅
- `node --check server/security.mjs` ✅
- `npm run server` ✅
- `/health` local ✅
- `/api/health` local ✅
- `npm run build` 🟡 parou em `vite: not found` porque depende de `npm install --registry https://registry.npmjs.org/` no ambiente local.

## Como testar avatar

1. Restaurar `.env` local privado.
2. Garantir que Railway tenha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_AVATAR_BUCKET=avatars`.
3. Entrar no FitPro.
4. Ir em Perfil.
5. Enviar uma imagem PNG/JPG/WebP.
6. Confirmar que o toast informa Supabase Storage.
7. Clicar em “Testar persistência do avatar”.
8. Dar F5.
9. Fazer logout/login.
10. Confirmar que a foto continua aparecendo.
11. Conferir no banco se `users.avatar` não é `user_id` puro e não contém `access_token`.
12. Conferir no Supabase Storage se o arquivo foi criado no bucket `avatars`.
