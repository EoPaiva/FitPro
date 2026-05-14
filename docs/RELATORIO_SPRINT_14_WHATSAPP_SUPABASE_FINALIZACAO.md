# FitPro Elite — Sprint 14 — WhatsApp Business Webhook Real + Supabase Sync Ampliado

## Regra seguida
Não refazer do zero, não quebrar login/painéis, não incluir README, não incluir `.env` real, não expor secrets e manter tokens apenas por `process.env` no backend/Railway.

## Arquivos criados
- `.env.example`
- `docs/SUPABASE_SPRINT_14_SCHEMA.sql`
- `docs/RELATORIO_SPRINT_14_WHATSAPP_SUPABASE_FINALIZACAO.md`

## Arquivos alterados
- `server/db.mjs`
- `server/index.mjs`
- `server/sync.mjs`
- `src/api.ts`
- `src/main.ts`

## Implementado
- Webhook WhatsApp Business real em `GET /api/whatsapp/webhook` e `POST /api/whatsapp/webhook`.
- Validação de `hub.mode`, `hub.verify_token` e resposta do `hub.challenge` no GET.
- Processamento de mensagens recebidas e status de entrega/leitura no POST.
- Tabela `whatsapp_webhook_events` com idempotência por `event_key`.
- Logs de integração e auditoria para webhooks WhatsApp.
- Matching básico de aluno por telefone/WhatsApp.
- Mensagem recebida no WhatsApp vira mensagem interna quando o telefone bate com aluno cadastrado.
- Personal recebe notificação interna quando aluno envia mensagem pelo WhatsApp.
- Endpoint Dev `GET /api/admin/whatsapp/webhooks`.
- Central de integrações passa a listar webhooks WhatsApp recentes.
- Sync Supabase ampliado para mais tabelas, incluindo treinos, webhooks, status, storage, Google, marketplace, wearables e antifraude.
- SQL incremental para preparar Supabase para Sprint 14.
- `.env.example` raiz com placeholders completos.

## Implementado parcialmente
- Supabase-first foi avançado para sync/mirror ampliado com fallback SQLite, mas ainda não substitui 100% todas as leituras do app.
- WhatsApp Business recebe e salva eventos, mas respostas automáticas conversacionais avançadas ficam para fase futura.

## Em espera
- Policies RLS finais por tenant/usuário no Supabase.
- Migração total de leitura para Supabase-first sem SQLite como principal.
- WhatsApp templates oficiais aprovados para fluxos específicos.
- Validação `X-Hub-Signature-256` do WhatsApp se `WHATSAPP_APP_SECRET` for configurado futuramente.

## Não implementado por segurança/dependência
- Nenhum token real foi colocado no zip.
- Nenhum disparo real automático de WhatsApp foi ativado no webhook, para evitar spam/envio indevido.
- Nenhuma policy ampla foi criada automaticamente no Supabase, para evitar abrir dados sensíveis.

## Variáveis necessárias no Railway
- `WHATSAPP_BUSINESS_TOKEN`
- `WHATSAPP_BUSINESS_PHONE_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_PHONE`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_PATH`
- `UPLOAD_DIR`

## Variáveis públicas na Vercel
- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_MERCADO_PAGO_PUBLIC_KEY`

## URL do webhook WhatsApp na Meta
`https://fitpro-production-847a.up.railway.app/api/whatsapp/webhook`

## Como testar
1. Abrir `https://fitpro-production-847a.up.railway.app/health`.
2. Configurar o webhook na Meta com a URL acima e o mesmo `WHATSAPP_VERIFY_TOKEN` do Railway.
3. Enviar mensagem para o número WhatsApp Business.
4. Entrar como Dev/Super Admin e abrir Integrações.
5. Conferir a lista de webhooks WhatsApp recentes.
6. Conferir logs em Auditoria/Integrações.

## Build e checks executados nesta geração
- `node --check server/index.mjs`
- `node --check server/db.mjs`
- `node --check server/sync.mjs`
- `node --check server/integrations.mjs`
- `npx tsc --noEmit --pretty false`

## Pontos de atenção
- Rode `docs/SUPABASE_SPRINT_14_SCHEMA.sql` no Supabase se a tabela `whatsapp_webhook_events` ainda não existir.
- O app continua com SQLite fallback para reduzir risco de quebra em produção.
- O Supabase service role deve ficar apenas no Railway.
