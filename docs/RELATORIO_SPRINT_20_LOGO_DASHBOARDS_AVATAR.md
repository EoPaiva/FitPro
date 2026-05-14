# FitPro Elite — Sprint 20 Logo Referência + Dashboards + Avatar Persistente

## 🟢 IMPLEMENTADO

🟢 Logo FitPro Elite refeita seguindo a referência visual: monograma FP mais forte, maior, com visual fitness-tech premium, dark mode, neon/emerald, motion trails, energy sweep, heartbeat integrada, brilho e presença maior.

🟢 Favicon e app icon/PWA atualizados com o mesmo símbolo FP premium.

🟢 Animações reais em SVG/CSS preservadas e reforçadas: glow pulse, motion trails, heartbeat animada, sweep no ícone, energy ring/sweep e fallback com prefers-reduced-motion.

🟢 Dashboards de Aluno e Personal reorganizados com uma camada modular de navegação guiada, sem remover menus, botões, cards, métricas ou funcionalidades existentes.

🟢 Dashboard do aluno ganhou blocos de contexto: Hoje, Meu Treino, Hábitos, Evolução, Agenda, Pagamentos, Comunidade, Personal e Perfil.

🟢 Dashboard do personal ganhou blocos de contexto: Coach Invisível, Solicitações, Alunos, Treinos, Agenda, Pagamentos, Comunidade, Relatórios, CRM/Leads, Integrações, Automações e Perfil.

🟢 Avatar/foto de perfil recebeu correção adicional de persistência: backend reforça users.avatar, students.avatar_url, trainers.avatar_url, users vinculados, reactions e comentários; frontend protege o bootstrap retornado para não sobrescrever a foto salva com dado antigo.

🟢 Perfil mostra status de persistência do avatar e explica o critério: não piscar, não sumir, permanecer após F5/logout/login.

🟢 Health check local testado em `/health`.

## 🟡 PARCIAL / EM ANDAMENTO / EM ESPERA

🟡 Build com Vite precisa ser rodado no ambiente local após `npm install --registry https://registry.npmjs.org/`. Neste ambiente, o `npm install` não concluiu a instalação do binário do Vite dentro do prazo, então `npm run build` parou em `vite: not found`.

🟡 Agenda, pagamentos, integrações e códigos de ativação foram preservados e receberam organização visual indireta no dashboard, mas não foram reescritos nesta sprint para evitar quebra.

🟡 Reactions/comunidade foram preservados; a sprint atual manteve a melhoria de visual/contagem já existente e reforçou a propagação de avatar em reactions/comentários.

## 🔴 NÃO IMPLEMENTADO / PENDENTE

🔴 Supabase-first 100%.

🔴 Marketplace/split Mercado Pago.

🔴 Comissão automática da plataforma.

🔴 KYC/conta conectada do personal.

🔴 Multi-tenant completo.

🔴 Push avançado.

🔴 Antifraude avançado.

🔴 PDF de avaliação física.

🔴 Google Calendar/Meet avançado.

🔴 README, conforme regra de não criar README nesta sprint.

## Arquivos alterados/criados

- `src/main.ts`
- `src/styles.css`
- `server/index.mjs`
- `public/favicon.svg`
- `public/app-icon.svg`
- `docs/RELATORIO_SPRINT_20_LOGO_DASHBOARDS_AVATAR.md`

## Testes executados

- `node --check server/index.mjs` ✅
- `node --check server/db.mjs` ✅
- `npm run type-check` ✅
- `npm run server` ✅
- `curl http://127.0.0.1:3333/health` ✅
- `npm run build` 🟡 não concluído por `vite: not found` neste ambiente após instalação incompleta; rodar localmente após `npm install`.
