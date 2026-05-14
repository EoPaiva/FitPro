# RELATÓRIO — SPRINT 10 LITE

Atualização: Visual, utilitários, footer premium e correção real de avatar.

## Regra principal aplicada

Não refazer do zero, não quebrar o que já funciona, não expor secrets, não criar README, não incluir `.env` real, não incluir banco real, uploads privados, `node_modules` ou `dist`.

## Arquivos criados

🟢 `docs/RELATORIO_SPRINT_10_LITE_VISUAL_UTILITARIOS_AVATAR.md`

## Arquivos alterados

🟢 `src/main.ts`
🟢 `src/styles.css`
🟢 `server/index.mjs`
🟢 `server/db.mjs`
🟢 `server/seed.mjs`

## Arquivos removidos

🟢 Nenhum arquivo funcional foi removido.

## Funcionalidades implementadas

🟢 Correção do fallback de avatar: valores antigos como `JD`, `LP` ou `UP` deixam de ser tratados como URL de imagem.
🟢 Upload de avatar mantém validação de PNG/JPG/WebP e limite de 3MB.
🟢 Avatar passa a salvar `avatar`, `avatar_storage_path`, `avatar_mime_type`, `avatar_size`, `avatar_data_url`, `avatar_updated_at` e `avatar_storage_provider` no banco local.
🟢 Avatar agora tem fallback no banco: se o arquivo local não for encontrado, o backend tenta servir a imagem persistida em `avatar_data_url`.
🟢 Avatar continua privado por rota autenticada `/api/profile/avatar/:userId`.
🟢 Bootstrap retorna avatar atualizado imediatamente após upload.
🟢 Foto aparece no perfil, cabeçalho, chat, comunidade, comentários, desafios, pódio e componentes que usam `renderAvatar`.
🟢 Fallback visual com iniciais fica consistente quando não houver foto.
🟢 Preview local da foto antes de salvar.
🟢 Footer premium com bloco da marca, status da API, último ping, latência, ambiente, links legais e criador do projeto.
🟢 Botão real “Verificar API” chamando `VITE_API_URL/health`.
🟢 Status verde/amarelo/vermelho para API online, lenta ou offline.
🟢 Links legais em modal: Termos, Privacidade, LGPD, Cookies, Aviso de saúde, Suporte e Contato.
🟢 Suporte a abertura direta das rotas legais simples: `/termos`, `/privacidade`, `/lgpd`, `/aviso-de-saude`, `/suporte`, `/contato`, `/cookies`, `/responsabilidade`.
🟢 Melhorias visuais em botões, foco, inputs, selects, modal, toast, cards, footer, avatar e mobile.
🟢 Seed ajustado para não gravar iniciais no campo `avatar` de novos usuários de teste.

## Funcionalidades parcialmente implementadas

🟡 Footer premium foi melhorado dentro da estrutura atual de SPA; as páginas legais reais por roteador ainda podem ser evoluídas futuramente se o projeto ganhar roteamento completo.
🟡 Status da API no footer usa ping frontend para `/health`; a Central Real de Integrações Dev completa ainda fica para a Sprint 12.
🟡 Avatar com Supabase Storage continua preparado; persistência definitiva em produção depende das variáveis/buckets do Supabase quando você quiser deixar Supabase-first.

## Funcionalidades em espera

🔴 Central Real de Integrações Dev completa.
🔴 Supabase-first 100% com RLS e policies finais.
🔴 Mercado Pago webhook real.
🔴 WhatsApp Business webhook real.
🔴 OpenAI real com chave em produção.
🔴 Google Calendar/Meet com OAuth configurado em produção.
🔴 Reestruturação completa de rotas reais com router.
🔴 README manual.

## Não implementado por segurança/dependência

🔴 Nenhuma secret real foi adicionada.
🔴 Nenhum `.env` real foi criado.
🔴 Nenhum token foi exposto no frontend.
🔴 Nenhum banco SQLite real foi incluído.
🔴 Nenhum upload privado real foi incluído.

## Variáveis necessárias

Frontend/Vercel:

```env
VITE_API_URL=https://fitpro-production-847a.up.railway.app
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_MERCADO_PAGO_PUBLIC_KEY=
```

Backend/Railway:

```env
NODE_ENV=production
AUTH_SECRET=
AUTH_COOKIE_NAME=fitpro_session
AUTH_TOKEN_EXPIRES_IN=7d
APP_URL=https://fit-pro-xp7c.vercel.app
CORS_ORIGIN=https://fit-pro-xp7c.vercel.app,http://localhost:5173,http://localhost:3000
DATABASE_PATH=./data/fitpro.sqlite
UPLOAD_DIR=./storage/uploads
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET_AVATARS=avatars
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
WHATSAPP_BUSINESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
RESEND_API_KEY=
EMAIL_FROM=
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Como testar localmente

```powershell
cd "C:\Users\mpaii\Documents\Projetos\fitpro-premium"
copy "C:\Users\mpaii\Documents\Projetos\_keys_privadas\fitpro.env.backup" "C:\Users\mpaii\Documents\Projetos\fitpro-premium\.env"
npm install --registry https://registry.npmjs.org/
npm run type-check
npm run build
npm run server
npm run dev
```

## Testes feitos nesta atualização

🟢 `node --check server/index.mjs`
🟢 `node --check server/db.mjs`
🟢 `node --check server/seed.mjs`
🟢 `tsc --noEmit`
🟢 API local iniciou com `node server/index.mjs`
🟢 `/health` local respondeu 200
🟢 Login local do aluno de seed funcionou
🟢 Upload local de avatar PNG funcionou
🟢 GET do avatar privado retornou imagem PNG válida

## Observação sobre build

🟡 O `tsc --noEmit` passou.
🟡 O `npm run build` precisa ser rodado no seu PC depois de `npm install`, porque o ambiente daqui não conseguiu completar o `npm install` com o Vite por timeout/rede.

## Riscos e pontos de atenção

🟡 Em produção Railway, se usar storage local sem Supabase, arquivos podem depender do disco do serviço. Por isso foi adicionado fallback do avatar no banco local.
🟡 O campo `avatar_data_url` pode aumentar o tamanho do banco se forem enviadas imagens grandes, mas há limite de 3MB.
🟡 Para produção mais robusta, o ideal futuro é usar Supabase Storage privado com bucket `avatars`.

## Próximos passos recomendados

🟡 Subir esta versão no GitHub.
🟡 Conferir `/health` no Railway.
🟡 Conferir `VITE_API_URL` na Vercel.
🟡 Fazer login em produção.
🟡 Entrar em Perfil, subir uma foto e apertar F5.
🟡 Confirmar foto no cabeçalho, chat, comunidade e pódio.
🟡 Depois seguir para Sprint 12 — Central Real de Integrações Dev.
