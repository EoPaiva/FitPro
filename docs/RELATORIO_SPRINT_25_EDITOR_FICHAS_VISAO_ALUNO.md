# FitPro Elite — Sprint 25

## 🟢 Implementado

- Editor de ficha existente em etapas, reutilizando o wizard profissional da Sprint 24.
- Botão **Editar** nos cards de ficha do personal.
- Botão **Editar em etapas** dentro do modal da ficha.
- Salvamento completo de alterações da ficha no backend por `PATCH /api/workout-plans/:id` quando enviado com `fullEdit` ou `days`.
- Versionamento antes de substituir a ficha editada.
- Substituição segura de dias e exercícios da ficha, preservando workspace, permissões, notificações e auditoria.
- Visão limpa do aluno no modal de ficha: Hoje, Próximo treino, Semana completa e exercícios do dia.
- Aluno continua sem campos técnicos de edição.
- Personal continua podendo publicar, duplicar, arquivar e restaurar versão.
- Biblioteca do wizard continua adicionando exercícios ao dia ativo no rascunho/edição.
- CSS responsivo para editor, visão limpa do aluno e cards semanais.

## 🟡 Parcial / em espera

- Substituição individual de exercício direto no card ainda pode evoluir para uma ação dedicada “Substituir”.
- Editor inline de exercício já publicado ainda foi tratado pelo editor completo em etapas, não por edição direta no card.
- Autosave em backend enquanto edita ficha existente fica para próxima etapa; nesta sprint a edição existente salva ao confirmar.
- Build Vite precisa ser rodado após `npm install` no ambiente local do usuário.

## 🔴 Pendente

- Substituir exercício diretamente no card da ficha publicada.
- Histórico visual detalhado por alteração de exercício individual.
- PDF de avaliação física.
- Supabase-first 100%.
- Marketplace/split Mercado Pago.
- Comissão automática.
- KYC/conta conectada do personal.
- Multi-tenant completo.
- Push avançado.
- Antifraude avançado.
- Google Calendar/Meet avançado.
- README novo.

## Arquivos alterados

- `src/main.ts`
- `src/styles.css`
- `server/index.mjs`

## Testes realizados

- `npm run type-check` passou.
- `node --check server/index.mjs` passou.
- `node --check server/db.mjs` passou.
- `node --check server/integrations.mjs` passou.
- `node --check server/security.mjs` passou.
- `npm run server` subiu localmente.
- `/api/health` respondeu localmente.
- `npm run build` não concluiu neste ambiente porque o binário `vite` não está disponível sem reinstalar dependências.

## Como testar

1. Entrar como personal.
2. Abrir **Treinos**.
3. Em uma ficha existente, clicar em **Editar**.
4. Alterar dados, dias, exercícios, progressão ou status.
5. Salvar como rascunho ou publicar.
6. Reabrir a ficha e confirmar alterações.
7. Entrar como aluno e abrir a ficha para validar a visão limpa.
8. Confirmar que o aluno não vê campos técnicos de edição.

## Comandos do zero até GitHub

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

git commit -m "feat: improve FitPro workout editor and student plan view"

git pull origin main --rebase

git push -u origin main
```

Se o GitHub recusar por histórico diferente e esta pasta for realmente a correta:

```bash
git fetch origin
git push -u origin main --force-with-lease
```
