
## Sprint 17 — Planos da plataforma + códigos de ativação

- Adicionados planos FitPro Start (R$ 49,99/mês) e FitPro Plus (R$ 149,99/mês).
- Adicionado módulo de códigos de ativação para personal.
- Adicionados endpoints de validação e resgate de código no backend.
- Adicionado painel Dev para criar, copiar, cancelar e auditar códigos.
- Adicionado aviso/fluxo de ativação no painel do personal.
- Adicionado SQL incremental Supabase da Sprint 17.


## Sprint 15 — WhatsApp IA automática + templates aprovados

- Adicionado histórico de respostas automáticas por IA no WhatsApp.
- Adicionado catálogo seguro de templates aprovados na Meta via variáveis de ambiente.
- Adicionados endpoints administrativos para listar/enviar templates e auditar respostas IA.
- Central de Integrações agora mostra WhatsApp + IA e templates aprovados.
- Nenhuma secret foi adicionada ao código, zip ou frontend.

# Changelog

## v1.0.0-fullstack-fase1

- Criada base fullstack real do FitPro Elite.
- Adicionado backend Node.js sem dependências externas de runtime.
- Adicionado banco SQLite via `node:sqlite`.
- Adicionado seed demo seguro.
- Implementada autenticação com hash PBKDF2 e token assinado.
- Implementadas permissões por aluno, admin, super admin e dev.
- Implementado fluxo completo de comprovantes privados.
- Implementado histórico de pagamento e audit logs.
- Implementadas notificações internas.
- Criados painéis aluno/admin/dev em frontend Vite + TypeScript.

## v1.5.0 — Sprint 5: Inovação, IA e Produto Premium

- Criado FitPro Pulse para aluno com missão do dia, energia, treino e pontos possíveis.
- Criado FitPro Pulse para personal com alunos em risco, elogios e check-ins pendentes.
- Adicionado Modo Coach Invisível com detecção de aluno sumido, pagamento pendente, avaliação antiga e proximidade do pódio.
- Criada Jornada do Aluno, temporadas fitness, badges, loja de recompensas e sorteios com chances extras por engajamento.
- Criada Central de Ajuda com IA segura e assistente flutuante no app.
- Build validado após implementação.

## v1.0.2 — Produção CORS/Railway Fix

- Corrigido preflight `OPTIONS` antes de qualquer rota do backend.
- Adicionados headers CORS globais com `Access-Control-Allow-Origin` dinâmico para Vercel e localhost.
- Mantidas rotas públicas `/health` e `/api/health` sem autenticação.
- Adicionado fallback de `VITE_API_URL` em produção para Railway.
- Adicionado `railway.json` com start command, build command e healthcheck.
- Adicionado `.npmrc` com registry público `https://registry.npmjs.org/`.
- Ajustado `engines.node` para `22.x` para evitar upgrade automático de major Node.
- Atualizado `DEPLOY.md` com checklist de Vercel + Railway + CORS.

## v1.0.3 — Produção finalizada para Vercel/Railway

- Adicionado suporte a `CORS_ORIGINS` com múltiplas origens.
- Adicionado `scripts/smoke-production.mjs` para validar `/health`, preflight CORS e login em produção.
- Adicionado `server/supabase.mjs` como adaptador opcional para futura migração Supabase.
- Adicionado `docs/SUPABASE_SETUP.sql` para base inicial PostgreSQL/Supabase.
- Adicionados exemplos de variáveis para Railway e Vercel.
- Adicionado endpoint `/api/integrations/status` sem expor secrets.
- Adicionado webhook base `/api/mercado-pago/webhook` para registro seguro de eventos futuros.

## v1.14.0 — Sprint 14: WhatsApp Business Webhook Real + Supabase Sync Ampliado

- Implementado processamento real de `GET/POST /api/whatsapp/webhook`.
- Adicionada tabela `whatsapp_webhook_events` com idempotência e auditoria.
- Mensagens recebidas via WhatsApp são associadas ao aluno por telefone quando possível.
- Personal recebe notificação interna quando aluno identificado envia mensagem pelo WhatsApp.
- Central de integrações lista eventos recentes de WhatsApp e Mercado Pago.
- Ampliado sync/mirror para Supabase com mais tabelas do produto.
- Criado SQL incremental `docs/SUPABASE_SPRINT_14_SCHEMA.sql`.
- Mantido `.env` real fora do projeto e sem README automático.
