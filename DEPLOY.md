# FitPro Elite — Deploy Vercel + Railway

Este projeto usa:

```text
Frontend: Vercel
Backend/API: Railway
Banco local da fase atual: SQLite no backend
Secrets reais: .env local / Railway Variables / Vercel Env Vars
```

## 1. Depois de extrair um novo ZIP

Restaure seu `.env` privado a partir do backup protegido fora do projeto:

```powershell
copy "C:\Users\mpaii\Documents\Projetos\_keys_privadas\fitpro.env.backup" "C:\Users\mpaii\Documents\Projetos\fitpro-premium\.env"
```

Nunca suba `.env` para o GitHub.

---

## 2. Teste local

```bash
npm install --registry https://registry.npmjs.org/
npm run build
npm run type-check
npm run dev
```

Teste local:

```text
http://localhost:5173
http://localhost:3333/health
http://localhost:3333/api/health
```

---

## 3. Vercel — frontend

Na Vercel, configure apenas variáveis públicas do frontend:

```env
VITE_API_URL=https://fitpro-production-847a.up.railway.app
APP_URL=https://fit-pro-xp7c.vercel.app
```

Opcional se o frontend usar Supabase público:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Não coloque na Vercel frontend com prefixo `VITE_`:

```text
SUPABASE_SERVICE_ROLE_KEY
AUTH_SECRET
MERCADO_PAGO_ACCESS_TOKEN
WHATSAPP_BUSINESS_TOKEN
RESEND_API_KEY
OPENAI_API_KEY
```

Após alterar env vars na Vercel, faça redeploy.

---

## 4. Railway — backend/API

Start Command:

```bash
npm run server
```

Este projeto também inclui `railway.json` com:

```text
buildCommand: npm install --registry https://registry.npmjs.org/ && npm run build
startCommand: npm run server
healthcheckPath: /health
```

Variáveis esperadas no Railway:

```env
NODE_ENV=production
DEMO_MODE=false
APP_URL=https://fit-pro-xp7c.vercel.app
API_URL=https://fitpro-production-847a.up.railway.app
CORS_ORIGIN=https://fit-pro-xp7c.vercel.app
AUTH_SECRET=
AUTH_COOKIE_NAME=fitpro_session
AUTH_TOKEN_EXPIRES_IN=86400
DATABASE_PATH=./data/fitpro.sqlite
UPLOAD_DIR=./storage/uploads
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_SUCCESS_URL=https://fit-pro-xp7c.vercel.app/pagamento/sucesso
MERCADO_PAGO_FAILURE_URL=https://fit-pro-xp7c.vercel.app/pagamento/erro
MERCADO_PAGO_PENDING_URL=https://fit-pro-xp7c.vercel.app/pagamento/pendente
WHATSAPP_PHONE=
WHATSAPP_BUSINESS_TOKEN=
WHATSAPP_BUSINESS_PHONE_ID=
WHATSAPP_VERIFY_TOKEN=
RESEND_API_KEY=
EMAIL_FROM=
OPENAI_API_KEY=
```

A Railway fornece `PORT` automaticamente. O backend usa `process.env.PORT || 3333`.

---

## 5. Testes de produção

Teste a API antes do login:

```text
https://fitpro-production-847a.up.railway.app/health
https://fitpro-production-847a.up.railway.app/api/health
```

Teste o preflight CORS no DevTools ou via terminal:

```bash
curl -i -X OPTIONS https://fitpro-production-847a.up.railway.app/api/auth/login \
  -H "Origin: https://fit-pro-xp7c.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization"
```

A resposta esperada deve ter:

```text
HTTP/1.1 204
Access-Control-Allow-Origin: https://fit-pro-xp7c.vercel.app
Access-Control-Allow-Credentials: true
```

Teste login:

```text
https://fit-pro-xp7c.vercel.app
leandro@fitpro.dev / Leandro123
upaiva@dev / 99221542Mat@
aluno@fitpro.dev / Aluno123
```

Teste webhook WhatsApp:

```text
https://fitpro-production-847a.up.railway.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=12345
```

A resposta correta deve ser somente:

```text
12345
```

---

## 6. Checklist antes de subir

1. `npm install --registry https://registry.npmjs.org/`
2. `npm run build`
3. `npm run type-check`
4. Verificar `package-lock.json` sem registry interno.
5. Verificar `.gitignore` sem conflito.
6. Conferir que `.env` não foi commitado.
7. Conferir Vercel com `VITE_API_URL`.
8. Conferir Railway com `CORS_ORIGIN`.
9. Testar `/health`.
10. Testar login.
11. Testar WhatsApp webhook.
12. Testar refresh em rota interna da Vercel.

---

## 7. Comandos Git

```bash
git add .
git commit -m "fix: harden FitPro production CORS and Railway deploy"
git push origin main
```

---

## 8. Smoke test automatizado

Depois de publicar Railway + Vercel, rode:

```bash
npm run smoke:production
```

O teste valida:

```text
/health
/api/health
OPTIONS /api/auth/login com CORS
POST /api/auth/login com usuário demo personal
```

Se o teste de CORS falhar, confira no Railway:

```env
CORS_ORIGIN=https://fit-pro-xp7c.vercel.app
CORS_ORIGINS=https://fit-pro-xp7c.vercel.app,https://fit-pro-xp7c-jn8uju0eq-eopaivas-projects.vercel.app
```

---

## 9. Arquivos auxiliares incluídos

```text
docs/RAILWAY_RAW_EDITOR.example.env
docs/VERCEL_ENV.example.env
docs/SUPABASE_SETUP.sql
server/supabase.mjs
scripts/smoke-production.mjs
```

O arquivo `SUPABASE_SETUP.sql` prepara a futura migração para PostgreSQL/Supabase, mas a fase atual ainda usa SQLite no backend Railway para manter compatibilidade com a base existente.
