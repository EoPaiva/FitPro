# RELATÓRIO — SPRINT 15 — WhatsApp IA automática + templates aprovados

## Resumo
Atualização feita sobre a Sprint 14, sem refazer o projeto do zero e sem remover fluxos existentes. A sprint adiciona resposta automática segura por IA para alunos identificados no webhook do WhatsApp e estrutura real para envio de templates aprovados na Meta, usando apenas variáveis de ambiente do backend/Railway.

## Arquivos criados
🟢 `docs/RELATORIO_SPRINT_15_WHATSAPP_IA_TEMPLATES.md`
🟢 `docs/SUPABASE_SPRINT_15_WHATSAPP_AI_TEMPLATES.sql`

## Arquivos alterados
🟢 `server/index.mjs`
🟢 `server/db.mjs`
🟢 `server/integrations.mjs`
🟢 `server/sync.mjs`
🟢 `src/main.ts`
🟢 `src/api.ts`
🟢 `.env.example`
🟢 `docs/RAILWAY_RAW_EDITOR.example.env`

## Arquivos removidos
🟢 Nenhum arquivo removido.

## Implementado
🟢 Tabela `whatsapp_ai_replies` para histórico de respostas automáticas por IA.
🟢 Tabela `whatsapp_template_sends` para histórico de templates enviados.
🟢 Webhook do WhatsApp agora pode responder automaticamente alunos identificados por telefone.
🟢 A resposta automática usa `OPENAI_API_KEY` apenas no backend.
🟢 Resposta possui trava de segurança: não faz diagnóstico, dieta, prescrição, suplemento ou promessa de resultado.
🟢 Resposta automática fica registrada no chat interno.
🟢 Resposta automática fica registrada em logs de integração.
🟢 Controle de duplicidade por `inbound_message_id`.
🟢 Limite por aluno/hora via `WHATSAPP_AI_MAX_REPLIES_PER_STUDENT_HOUR`.
🟢 Em produção, a IA automática exige `WHATSAPP_AI_AUTO_REPLY_ENABLED=true`.
🟢 Catálogo de templates aprovados via variáveis de ambiente.
🟢 Endpoint `GET /api/admin/whatsapp/templates`.
🟢 Endpoint `POST /api/admin/whatsapp/templates/send`.
🟢 Endpoint `GET /api/admin/whatsapp/ai-replies`.
🟢 Central de Integrações mostra WhatsApp + IA automática.
🟢 Central de Integrações mostra templates aprovados/configurados.
🟢 Central de Integrações mostra respostas IA recentes.
🟢 Central de Integrações mostra env vars apenas como configuradas/ausentes.
🟢 SQL incremental Supabase criado para espelhar as novas tabelas.

## Implementado parcialmente
🟡 Templates aprovados dependem dos nomes exatos aprovados no painel da Meta.
🟡 Os componentes/variáveis do template podem ser enviados via `bodyParams` ou `components`, mas precisam bater com o modelo aprovado na Meta.
🟡 Supabase recebe schema/sync preparado, mas o app continua sem forçar Supabase-first total.

## Em espera
🟡 Criar/aprovar os templates no WhatsApp Manager/Meta.
🟡 Colocar os nomes reais dos templates aprovados no Railway.
🟡 Ativar `WHATSAPP_AI_AUTO_REPLY_ENABLED=true` no Railway quando quiser produção respondendo automaticamente.
🟡 Rodar `docs/SUPABASE_SPRINT_15_WHATSAPP_AI_TEMPLATES.sql` no Supabase se quiser espelhamento das novas tabelas.

## Não implementado por segurança/dependência
🔴 Não criei templates dentro da Meta automaticamente, pois isso depende do painel/API Meta, aprovação e conteúdo permitido.
🔴 Não coloquei tokens, secrets, access keys ou nomes privados reais no código.
🔴 Não ativei resposta automática forçada em produção sem variável explícita.

## Variáveis novas
```env
WHATSAPP_AI_AUTO_REPLY_ENABLED=true
WHATSAPP_AI_MAX_REPLIES_PER_STUDENT_HOUR=6
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_TEMPLATE_STUDENT_APPROVED=
WHATSAPP_TEMPLATE_PAYMENT_PENDING=
WHATSAPP_TEMPLATE_PAYMENT_APPROVED=
WHATSAPP_TEMPLATE_PAYMENT_REJECTED=
WHATSAPP_TEMPLATE_WORKOUT_READY=
WHATSAPP_TEMPLATE_WORKOUT_REMINDER=
WHATSAPP_TEMPLATE_ASSESSMENT_DUE=
WHATSAPP_TEMPLATE_INACTIVE_STUDENT=
```

## Como testar
🟢 Abrir `/health`.
🟢 Entrar como dev/super admin.
🟢 Abrir Integrações.
🟢 Testar `WhatsApp + IA automática`.
🟢 Testar `Templates WhatsApp aprovados`.
🟢 Enviar mensagem pelo WhatsApp a partir de um número que esteja cadastrado como telefone de aluno.
🟢 Conferir se a mensagem aparece no chat interno.
🟢 Conferir se a resposta IA foi enviada quando `WHATSAPP_AI_AUTO_REPLY_ENABLED=true`.

## Validações executadas
🟢 `node --check server/index.mjs` passou.
🟢 `node --check server/db.mjs` passou.
🟢 `node --check server/integrations.mjs` passou.
🟢 `node --check server/sync.mjs` passou.
🟢 `tsc --noEmit` passou com TypeScript global do ambiente.
🟢 API local iniciou e `/health` respondeu 200.
🟢 Login dev local funcionou.
🟢 `GET /api/admin/whatsapp/templates` respondeu.
🟢 `GET /api/admin/whatsapp/ai-replies` respondeu.

## Ponto de atenção
🟡 `npm run build` precisa ser rodado no seu PC após `npm install`, porque neste ambiente o `vite` não estava instalado em `node_modules`.

## Próximo passo recomendado
🟡 Configurar/aprovar templates reais na Meta e preencher as variáveis `WHATSAPP_TEMPLATE_*` no Railway.
🟡 Depois seguir para Supabase-first por blocos.
