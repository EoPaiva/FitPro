# RELATÓRIO — Sprint 13 — Mercado Pago Webhook Real

## Regra principal

Esta atualização foi feita sem refazer o projeto do zero e sem colocar secrets no código, zip, README ou frontend. As chaves reais devem continuar somente no `.env` privado local e nas variáveis do Railway.

## Arquivos criados

🟢 `docs/RELATORIO_SPRINT_13_MERCADO_PAGO_WEBHOOK_REAL.md`

## Arquivos alterados

🟢 `server/index.mjs`
🟢 `server/db.mjs`
🟢 `src/main.ts`
🟢 `src/api.ts`
🟢 `.env.example`

## Arquivos removidos

🟢 Nenhum arquivo funcional removido.

## Funcionalidades implementadas

🟢 Webhook Mercado Pago real em `POST /api/mercado-pago/webhook`
🟢 Status público seguro do webhook em `GET /api/mercado-pago/webhook`
🟢 Validação de assinatura `x-signature` com HMAC SHA256 usando `MERCADO_PAGO_WEBHOOK_SECRET`
🟢 Leitura de `x-request-id`
🟢 Manifesto de assinatura no padrão Mercado Pago: `id:data.id;request-id:x-request-id;ts:timestamp;`
🟢 Janela de validade configurável por `MERCADO_PAGO_WEBHOOK_MAX_AGE_SECONDS`
🟢 Proteção contra webhook sem assinatura em produção quando secret existe
🟢 Tabela `mercado_pago_webhook_events` para auditoria e idempotência
🟢 Registro de eventos recebidos, processados, duplicados, rejeitados, sem match e com erro
🟢 Evita processar evento duplicado já concluído
🟢 Consulta detalhe do pagamento no Mercado Pago via backend
🟢 Consulta detalhe de assinatura/preapproval no Mercado Pago via backend
🟢 Atualiza cobrança FitPro pelo `external_reference`
🟢 Atualiza cobrança FitPro por `mercado_pago_id`
🟢 Atualiza cobrança FitPro por `mercado_pago_preapproval_id`
🟢 Atualiza status FitPro conforme status Mercado Pago
🟢 Salva `mercado_pago_status`
🟢 Salva `mercado_pago_status_detail`
🟢 Salva `mercado_pago_last_event_id`
🟢 Salva `mercado_pago_last_event_type`
🟢 Salva resumo seguro do payload em `mercado_pago_last_payload_json`
🟢 Salva `last_webhook_at`
🟢 Salva `paid_at` quando aprovado
🟢 Registra histórico em `payment_history`
🟢 Registra logs em `integration_logs`
🟢 Registra auditoria em `audit_logs`
🟢 Notifica aluno internamente quando status muda
🟢 Criação de checkout agora salva `mercado_pago_preference_id`
🟢 Criação de checkout agora marca `payment_provider=mercado_pago`
🟢 Criação de checkout agora salva `checkout_created_at`
🟢 Criação de assinatura agora salva `mercado_pago_preapproval_id`
🟢 Painel de pagamentos mostra status Mercado Pago
🟢 Painel de pagamentos mostra último webhook
🟢 Painel de pagamentos mostra ID de preference/payment quando existir
🟢 Dev/Super Admin vê eventos recentes de webhook Mercado Pago
🟢 Páginas visuais de retorno `/pagamento/sucesso`, `/pagamento/erro` e `/pagamento/pendente`
🟢 `.env.example` atualizado com `MERCADO_PAGO_PUBLIC_KEY` e `MERCADO_PAGO_WEBHOOK_MAX_AGE_SECONDS`

## Funcionalidades parcialmente implementadas

🟡 Liberação automática avançada por assinatura recorrente: a base existe, mas ainda precisa regras completas de ciclo, renovação, cancelamento e inadimplência.
🟡 Reembolso/chargeback: o status é salvo, mas ainda falta fluxo visual completo de disputa e auditoria financeira avançada.
🟡 Webhook de Orders/Merchant Orders: a rota recebe e audita, mas o foco funcional desta sprint ficou em payment/preapproval.

## Funcionalidades em espera

🟡 Teste real no painel do Mercado Pago Developers com simulador oficial.
🟡 Configuração final da URL pública no painel Mercado Pago.
🟡 Teste com pagamento real/sandbox controlado.
🟡 Ativação final em produção no Railway com as variáveis reais.

## Funcionalidades não implementadas

🔴 Supabase-first 100% não foi feito nesta sprint.
🔴 WhatsApp Business webhook real não foi feito nesta sprint.
🔴 Antifraude financeiro avançado não foi feito nesta sprint.
🔴 Conciliação financeira completa não foi feita nesta sprint.

## Motivo do que não foi implementado

🔴 Supabase-first é alteração pesada de banco e deve ficar para sprint própria.
🔴 WhatsApp Business webhook é outra integração e deve ficar para a próxima etapa.
🔴 Antifraude financeiro e conciliação dependem de regras de negócio, testes reais e auditoria mais detalhada.

## O que precisa configurar manualmente

🟡 Railway precisa conter as variáveis reais do Mercado Pago.
🟡 Mercado Pago Developers precisa apontar o webhook para:

```txt
https://fitpro-production-847a.up.railway.app/api/mercado-pago/webhook
```

🟡 Eventos recomendados no Mercado Pago:

```txt
payment
subscription_preapproval
subscription_authorized_payment
chargebacks
refunds/claims, se disponível no painel
```

## Variáveis de ambiente necessárias

```env
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_WEBHOOK_MAX_AGE_SECONDS=900
MERCADO_PAGO_SUCCESS_URL=https://fit-pro-xp7c.vercel.app/pagamento/sucesso
MERCADO_PAGO_FAILURE_URL=https://fit-pro-xp7c.vercel.app/pagamento/erro
MERCADO_PAGO_PENDING_URL=https://fit-pro-xp7c.vercel.app/pagamento/pendente
API_URL=https://fitpro-production-847a.up.railway.app
APP_URL=https://fit-pro-xp7c.vercel.app
```

## Comandos para rodar localmente

```powershell
npm install --registry https://registry.npmjs.org/
npm run type-check
npm run build
npm run server
npm run dev
```

## Validações feitas

🟢 `node --check server/index.mjs` passou
🟢 `node --check server/db.mjs` passou
🟢 `tsc --noEmit` passou usando TypeScript global do ambiente
🟢 API local iniciou
🟢 `/health` respondeu 200
🟢 `GET /api/mercado-pago/webhook` respondeu 200
🟢 `POST /api/mercado-pago/webhook` sem assinatura foi rejeitado em produção quando secret existe
🟢 `POST /api/mercado-pago/webhook` com assinatura HMAC válida respondeu 200

## Pontos de atenção

🟡 `npm install` completo não foi finalizado neste ambiente por timeout de rede, então rode no seu PC antes de subir.
🟡 O webhook real deve ser testado no painel do Mercado Pago, porque pagamentos de teste podem ter regras específicas de notificação.
🟡 Não colocar `MERCADO_PAGO_ACCESS_TOKEN` nem `MERCADO_PAGO_WEBHOOK_SECRET` na Vercel.

## Próximos passos recomendados

🟡 Testar webhook no Mercado Pago Developers.
🟡 Fazer deploy Railway.
🟡 Conferir `/api/mercado-pago/webhook` online.
🟡 Criar checkout pelo painel do aluno.
🟡 Validar se o status muda após notificação.
🟡 Próxima sprint recomendada: WhatsApp Business webhook real.
