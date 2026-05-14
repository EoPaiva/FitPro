# RELATÓRIO — SPRINT 8 GOOGLE CALENDAR / MEET

## Status
Implementado parcialmente com integração real server-side, mantendo as regras do FitPro: sem `.env` real, sem README, sem secrets no frontend e sem modo demo público.

## Implementado
- OAuth Google Calendar via backend (`/api/google/auth-url`).
- Callback server-side (`/api/google/callback`).
- Armazenamento de tokens criptografados com `AUTH_SECRET`.
- Status da conexão Google (`/api/google/status`).
- Desconectar Google (`/api/google/disconnect`).
- Criação de evento no Google Calendar com solicitação de Google Meet (`/api/schedules/:id/google-meet`).
- Tabelas SQLite `google_connections` e `calendar_events`.
- Campos no agendamento para `google_event_id`, `google_meet_link`, `google_html_link` e `sync_status`.
- Botões no painel de integrações e agenda para conectar Google e criar Meet.
- SQL base do Supabase ampliado para `google_connections` e `calendar_events`.

## Parcial
- OAuth depende de preencher `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI` no Railway.
- Criação real de Google Meet depende do Google Cloud estar configurado com Calendar API ativa e redirect autorizado.
- Ainda não há sincronização bidirecional de eventos editados no Google Calendar.

## Em espera
- Sync bidirecional completo.
- Conflito avançado de agenda com múltiplos calendários.
- Cancelamento/edição remota do evento no Google.
- Google Fit continua fora desta sprint.

## Variáveis necessárias no Railway
```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://fitpro-production-847a.up.railway.app/api/google/callback
GOOGLE_TIMEZONE=America/Sao_Paulo
```

## Testes recomendados
1. Confirmar `/health` e `/api/health` no Railway.
2. Entrar como personal/dev.
3. Abrir Integrações > Google > Conectar.
4. Autorizar conta Google.
5. Criar Google Meet em um agendamento.
6. Confirmar que `online_link`/`google_meet_link` aparece na agenda.
