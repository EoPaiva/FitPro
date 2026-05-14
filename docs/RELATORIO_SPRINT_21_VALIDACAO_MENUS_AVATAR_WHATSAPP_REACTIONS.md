# Relatório — Sprint 21: Validação funcional, menus, avatar, WhatsApp e reactions

## 🟢 IMPLEMENTADO

🟢 Adicionado guardião de persistência do avatar no frontend com cache local seguro por usuário, evitando que um bootstrap/refetch antigo sobrescreva a foto salva.

🟢 `renderAvatar` agora reconhece `avatar`, `avatarUrl`, `avatar_url`, `userAvatar` e `user_avatar`, cobrindo usuários, alunos, personais, comentários e reações.

🟢 Todas as respostas de API que retornam `bootstrap` passam por `adoptBootstrap`, preservando avatar salvo durante reload, refetch, ações de comunidade, pagamentos, treinos, mensagens, integrações e perfil.

🟢 Criado endpoint `GET /api/profile/avatar/status` para testar se a foto está persistida em `users.avatar`, perfil vinculado, storage/caminho/base64 fallback e bootstrap.

🟢 Perfil ganhou botão “Testar persistência do avatar” para validar banco/storage/sessão sem depender apenas do visual.

🟢 Backend agora resolve avatar atualizado para comentários e reações da comunidade a partir da tabela `users`, evitando exibir avatar antigo salvo dentro de JSON de post.

🟢 `publicUsers()` agora usa `normalizeUser`, evitando perder avatar quando o valor estiver no perfil vinculado de aluno/personal.

🟢 Botão de WhatsApp em cards de personal no estado pendente do aluno deixou de usar ação genérica e passou a usar telefone/contexto do personal correto.

🟢 Adicionada auditoria funcional de menus nos dashboards, listando os principais módulos do perfil atual e mantendo navegação direta para cada área.

🟢 Mantidos login, logout, sessão, health checks, gates de ativação, menu Leandro/trial, dashboards modulares, logo/favicons e deploy Railway/Vercel.

## 🟡 PARCIAL / EM ANDAMENTO / EM ESPERA

🟡 `npm run type-check` passou.

🟡 `node --check server/index.mjs`, `server/db.mjs`, `server/integrations.mjs` e `server/security.mjs` passaram.

🟡 `npm run server` subiu localmente e `/health` respondeu corretamente.

🟡 `npm run build` ainda depende de `vite` instalado em `node_modules`. Neste ambiente o binário não estava disponível e o `npm install` não pôde ser concluído aqui; no PC do projeto, rodar `npm install --registry https://registry.npmjs.org/` antes do build.

🟡 A auditoria de menus é funcional/visual e ajuda a testar os módulos, mas não substitui teste manual clicando em cada aba por perfil.

## 🔴 NÃO IMPLEMENTADO / PENDENTE

🔴 Supabase-first 100%.

🔴 Marketplace/split Mercado Pago.

🔴 Comissão automática da plataforma.

🔴 KYC/conta conectada do personal.

🔴 Multi-tenant completo.

🔴 Push notifications avançado.

🔴 Antifraude avançado.

🔴 PDF de avaliação física.

🔴 Google Calendar/Meet avançado.

🔴 README, conforme regra atual de não criar README nesta entrega.

## Arquivos alterados/criados

- `src/main.ts`
- `src/styles.css`
- `server/index.mjs`
- `.env.example`
- `docs/RELATORIO_SPRINT_21_VALIDACAO_MENUS_AVATAR_WHATSAPP_REACTIONS.md`

## Testes executados

- `node --check server/index.mjs`
- `node --check server/db.mjs`
- `node --check server/integrations.mjs`
- `node --check server/security.mjs`
- `npm run type-check`
- `npm run server`
- `curl http://127.0.0.1:3333/health`

## Testes manuais obrigatórios

- Login/logout/sessão.
- Perfil Leandro/trial.
- Upload de avatar, aguardar alguns segundos, F5, logout/login.
- Botão “Testar persistência do avatar”.
- Avatar em perfil, header, sidebar, comunidade, comentários, ranking, desafios, pódio e mensagens.
- Botões de WhatsApp de aluno para personal e personal para aluno.
- Reactions da comunidade com contagem, troca/remoção e nomes de quem reagiu.
- Auditoria funcional de menus em Aluno, Personal e Dev/Super Admin.
- Mobile 360px, 390px, 414px, tablet e desktop.
