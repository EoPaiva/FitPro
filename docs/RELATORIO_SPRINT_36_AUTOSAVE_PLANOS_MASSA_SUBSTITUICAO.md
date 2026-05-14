# FitPro Elite — Sprint 36

## 🟢 Implementado

- Autosave backend para rascunhos de ficha/plano durante criação e edição.
- Nova estrutura SQLite segura para `workout_plan_drafts`.
- Painel visual de rascunhos salvos no backend dentro da área de Treinos.
- Possibilidade de descartar rascunho salvo no backend.
- Aplicação de plano 30D para vários alunos usando endpoint backend único.
- Cada aluno recebe uma ficha/plano individual, sem copiar histórico de outro aluno.
- Duplicação guiada de ficha/plano para outro aluno via modal já existente e agora exposto na ficha.
- Botão para salvar ficha/plano como modelo do personal.
- Nova estrutura SQLite para `personal_workout_templates`.
- Favoritar/desfavoritar modelos do personal.
- Painel de modelos do personal na área de Treinos.
- Indicador simples de volume semanal por grupo muscular dentro da ficha.
- Alertas simples de equilíbrio semanal: peito/costas, core ausente e volume alto de pernas.
- Substituição inteligente preservada e reforçada: continua usando biblioteca filtrável e mantém ficha/dia/aluno.
- Script `fitpro-safe-update-push-v3.cmd` mantido no ZIP, com commit message atualizado para a Sprint 36.
- `.gitignore` continua ignorando o script local para ele não ser enviado ao GitHub por padrão.

## 🟡 Parcial / em espera

- Autosave backend salva rascunho estruturado, mas a restauração visual direta do rascunho de backend ainda pode ficar mais guiada em uma sprint futura.
- Modelos do personal já podem ser salvos/favoritados, mas ainda podem ganhar fluxo completo “usar modelo em novo aluno”.
- Aplicação em massa cria cópias individuais, mas personalização individual pós-aplicação ainda fica para evolução futura.
- Indicador de volume semanal usa regras simples, sem IA ou periodização avançada.

## 🔴 Pendente

- Restauração guiada de rascunho backend com botão “Continuar exatamente daqui”.
- Fluxo completo para usar modelo salvo do personal em novo aluno.
- Personalização individual depois de aplicar plano em massa.
- Dashboard analítico profundo por aluno/dia/exercício/carga.
- Supabase-first 100% do banco inteiro.
- Marketplace/split Mercado Pago.
- KYC, multi-tenant, push avançado, PDF, Google Calendar/Meet e README.

## Arquivos alterados

- `src/main.ts`
- `src/styles.css`
- `server/index.mjs`
- `server/db.mjs`
- `fitpro-safe-update-push-v3.cmd`
- `docs/RELATORIO_SPRINT_36_AUTOSAVE_PLANOS_MASSA_SUBSTITUICAO.md`

## Banco / backend

Novas tabelas:

- `workout_plan_drafts`
- `personal_workout_templates`

Novos endpoints:

- `GET /api/workout-drafts`
- `POST /api/workout-drafts`
- `DELETE /api/workout-drafts/:id`
- `POST /api/workout-plans/bulk-apply`
- `POST /api/workout-plans/:id/save-template`
- `POST /api/personal-workout-templates/:id/favorite`

## Testes/checks realizados

- `npm run type-check` ✅
- `node --check server/index.mjs` ✅
- `node --check server/db.mjs` ✅
- `node --check server/supabase.mjs` ✅
- `node --check server/integrations.mjs` ✅
- `node --check server/security.mjs` ✅
- `npm run server` ✅
- `npm run build` 🟡 parou em `vite: not found` neste ambiente sem `node_modules`; no PC, rodar `npm install --registry https://registry.npmjs.org/` antes.

## Como testar

1. Abrir Treinos como personal.
2. Criar ficha e alterar campos para acionar autosave backend.
3. Ver painel “Rascunhos salvos”.
4. Aplicar plano 30D para vários alunos.
5. Abrir uma ficha e usar “Salvar como modelo”.
6. Ver modelo em “Modelos do personal”.
7. Abrir ficha e conferir “Equilíbrio semanal”.
8. Duplicar ficha/plano para outro aluno.
9. Substituir exercício e conferir se a biblioteca filtrada continua funcionando.

## Comandos

```bash
cd "C:\Users\mpaii\Documents\Projetos\FitPro ELITE"

copy "C:\Users\mpaii\Documents\Projetos\_keys_privadas\fitpro.env.backup" "C:\Users\mpaii\Documents\Projetos\FitPro ELITE\.env"

npm install --registry https://registry.npmjs.org/

npm run type-check
npm run build
npm run server
npm run dev

git status

git init
git branch -M main

git remote -v
git remote remove origin
git remote add origin https://github.com/EoPaiva/FitPro.git

git status --ignored

git add .
git status

git commit -m "feat: add FitPro autosave bulk plans and smart substitutions"

git pull origin main --rebase

git push -u origin main
```

Ou executar:

```txt
fitpro-safe-update-push-v3.cmd
```
