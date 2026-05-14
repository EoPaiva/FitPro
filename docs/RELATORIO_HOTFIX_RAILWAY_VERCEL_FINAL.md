# Relatório — Hotfix produção Railway/Vercel + pequenas pendências

## Objetivo
Corrigir os problemas atuais observados em produção, principalmente `502` em `/health`, falha de login por API indisponível/CORS e configuração de Railway/Vercel, sem refazer o projeto do zero, sem expor `.env`, sem criar README e sem modo demo público.

## Arquivos alterados

- `server/index.mjs`
- `railway.json`
- `docs/RAILWAY_RAW_EDITOR.example.env`
- `docs/RELATORIO_HOTFIX_RAILWAY_VERCEL_FINAL.md`

## Correções implementadas

### IMPLEMENTADO — Railway `/health` e `/api/health`
- `/health` e `/api/health` agora respondem no início do handler principal, antes de auth, body parser, rotas protegidas ou fallback SPA.
- A resposta inclui `ok`, `app`, `env`, `host`, `port` e `mode`.
- `favicon.ico` responde `204` para não gerar ruído nos HTTP logs.

### IMPLEMENTADO — Host e porta da Railway
- O servidor agora usa `process.env.PORT` prioritariamente.
- O servidor faz bind explícito em `0.0.0.0`.
- O log agora mostra `FitPro API rodando em 0.0.0.0:<porta>`.

### IMPLEMENTADO — CORS/preflight
- `OPTIONS` é respondido com `204` antes de qualquer rota.
- Headers CORS são aplicados antes do tratamento de rotas.
- Domínios aceitos continuam incluindo `https://fit-pro-xp7c.vercel.app`, o domínio longo da Vercel e localhost.

### IMPLEMENTADO — Railway build config
- `railway.json` não roda mais `npm run build` na Railway.
- Railway agora só instala dependências com registry público e inicia `npm run server`.
- Healthcheck permanece em `/health`.

### IMPLEMENTADO — Deploy seguro
- `.env` real não foi incluído.
- `README.md` não foi criado.
- `.gitignore` continua bloqueando `.env`, banco local, uploads, dist, node_modules e README.
- `package-lock.json` continua com registry público `https://registry.npmjs.org/`.

## Pequenas pendências simples também mantidas/adiantadas

### IMPLEMENTADO PARCIALMENTE — Status do sistema
- Endpoints e painel de status já existem na base atual.
- A correção do `/health` permite validar melhor API, Railway, Vercel e webhook.

### IMPLEMENTADO PARCIALMENTE — Supabase Storage/Fallback
- Código atual mantém Supabase Storage como principal e fallback local controlado.
- A correção de Railway viabiliza testar esses fluxos em produção.

## Validações executadas localmente

- `node --check server/index.mjs`
- `node --check server/config.mjs`
- `npm run type-check`
- `GET /health` local: OK
- `GET /api/health` local: OK
- `OPTIONS /api/auth/login` com Origin da Vercel: OK
- `POST /api/auth/login` com Origin da Vercel: OK localmente

## Não concluído no sandbox

### EM ESPERA — `npm run build` completo no ambiente do sandbox
O comando não completou aqui porque `node_modules` não está presente e o `npm install` público não finalizou no ambiente do sandbox. No seu PC, após extrair e restaurar `.env`, rode:

```powershell
npm install --registry https://registry.npmjs.org/
npm run build
npm run type-check
```

## O que testar depois do push

```txt
https://fitpro-production-847a.up.railway.app/health
https://fitpro-production-847a.up.railway.app/api/health
```

No login, confirmar no F12 que a chamada vai para `https://fitpro-production-847a.up.railway.app/api/auth/login` e que o preflight `OPTIONS` não falha.

## Variáveis importantes

### Railway
Não criar `PORT` manualmente. A Railway injeta a porta.

```env
NODE_ENV=production
DEMO_MODE=false
APP_URL=https://fit-pro-xp7c.vercel.app
API_URL=https://fitpro-production-847a.up.railway.app
CORS_ORIGIN=https://fit-pro-xp7c.vercel.app
CORS_ORIGINS=https://fit-pro-xp7c.vercel.app,https://fit-pro-xp7c-jn8uju0eq-eopaivas-projects.vercel.app
```

### Vercel

```env
VITE_API_URL=https://fitpro-production-847a.up.railway.app
```

## Próximas pendências após estabilizar produção

- Migrar leituras principais para Supabase-first.
- Fechar RLS/policies finais.
- Testar Storage real dos quatro buckets.
- Mercado Pago webhook + status real.
- WhatsApp Business webhook real após `/health` funcionar.
- Resend templates.
- IA de ajuda com logs e limites.
- Google Calendar/Meet quando as keys forem preenchidas.
