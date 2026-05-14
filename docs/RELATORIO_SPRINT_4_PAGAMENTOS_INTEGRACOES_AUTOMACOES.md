# FitPro Elite — Sprint 4 Pagamentos, Integrações e Automações

## Objetivo
Continuar a lista de espera sem refazer o projeto, sem expor `.env`, sem criar README e sem modo demo público.

## Implementado
- Endpoint `POST /api/integrations/action` para testar integrações pelo painel dev/super admin.
- Integração Supabase com health check server-side.
- Integração Mercado Pago com criação de preference para a cobrança mais recente.
- Integração WhatsApp com envio de mensagem de teste server-side.
- Integração Resend/e-mail com envio de teste server-side.
- Integração OpenAI com teste seguro server-side.
- Integração Google com validação de credenciais básicas.
- Endpoint `POST /api/automations/run` para rodar automações manuais.
- Automações criam notificações para pagamentos pendentes e alunos inativos.
- Endpoint `POST /api/leads/:id/convert` para converter lead em solicitação de aluno.
- Endpoints de lembrete de pagamento por WhatsApp e e-mail.
- Webhook Mercado Pago passou a tentar mapear status de pagamento e registrar histórico.
- Painel de integrações ganhou botões reais de teste e checkout.
- Motor de automações ganhou botão real para executar automações.
- CRM ganhou botão de conversão de lead.
- Pagamentos ganharam ações de Mercado Pago, WhatsApp e e-mail.

## Implementado parcialmente
- Mercado Pago: preference e webhook básico; falta validação completa de assinatura, conciliação e recorrência.
- WhatsApp Business: envio server-side; falta templates aprovados e automações por gatilho.
- Resend: envio de teste e lembrete; faltam templates finais por evento.
- OpenAI: teste/assistente seguro; falta RAG/base de conhecimento própria.
- Google Calendar/Meet: validação de credenciais; falta OAuth completo e criação de eventos.

## Em espera
- Migração total de leituras/escritas para Supabase-first.
- RLS final e policies completas.
- Assinatura recorrente Mercado Pago.
- Push notifications.
- Antifraude avançado de pontos e desafios.
- Calendário semanal/mensal avançado.

## Validação executada
- `node --check server/index.mjs`
- `node --check server/db.mjs`
- `node --check server/integrations.mjs`
- `node --check server/supabase.mjs`
- `npm run type-check`

## Observação de build
O `npm run build` depende do `vite` instalado em `node_modules`. No ambiente atual, o `vite` não estava disponível e o `npm install` público não pôde ser concluído no sandbox. No PC local, rodar:

```bash
npm install --registry https://registry.npmjs.org/
npm run build
npm run type-check
```

## Segurança
- `.env` real não foi incluído.
- Secrets continuam apenas via backend/Railway.
- Nenhuma variável secreta foi colocada com prefixo `VITE_`.
- README não foi criado.
