# FitPro Elite — Sprint 31

## Ficha interativa: YouTube direto + abrir cada dia do plano completo

### 🟢 Implementado

- Botão “Buscar vídeo” na ficha do aluno agora abre direto o YouTube em nova aba quando o exercício não possui tutorial cadastrado.
- A busca usa o nome do exercício + “execução correta”, sem abrir modal vazio e sem parecer botão morto.
- Exercícios com `videoUrl`, `video_url`, `youtubeUrl`, `youtube_url`, `tutorialUrl` ou `tutorial_url` continuam abrindo o tutorial cadastrado.
- Cards da visão “Semana / Plano completo” agora são clicáveis.
- Cada dia do plano abre um modal/drawer limpo com detalhes daquele treino/dia.
- Dias de treino mostram exercícios, séries, repetições, descanso, observações, progresso, vídeo/tutorial e concluir exercício.
- Dias de descanso/cardio/mobilidade também abrem detalhe adequado, sem tela vazia.
- Mantido cálculo por data real do plano 30D.
- Mantida persistência de progresso por exercício/dia via backend.
- Adicionado script local `fitpro-safe-update-push-v3.cmd` com delay reduzido para 1,5s.
- `.gitignore` atualizado para ignorar scripts locais de conveniência, mesmo eles estando inclusos no ZIP.

### 🟡 Parcial / em espera

- Player embutido do YouTube dentro do app segue em espera; a ação usa link direto/seguro em nova aba.
- Painel detalhado do personal para acompanhar cada treino/dia concluído ainda pode evoluir.
- Aplicar plano para vários alunos, favoritos de planos e autosave backend em edição continuam em espera.

### 🔴 Pendente

- Player de vídeo incorporado dentro do app.
- Dashboard analítico do personal para execução diária de cada aluno.
- Autosave em backend para plano mensal em edição.
- Aplicar plano para vários alunos.
- Indicador completo de volume semanal por grupo muscular.
- Supabase-first 100% do banco inteiro.
- Marketplace/split Mercado Pago.
- Comissão automática.
- KYC/conta conectada do personal.
- Multi-tenant completo.
- Push avançado.
- Antifraude avançado.
- PDF de avaliação física.
- Google Calendar/Meet avançado.
- README novo.

## Arquivos alterados/criados

- `src/main.ts`
- `src/styles.css`
- `.gitignore`
- `fitpro-safe-update-push-v3.cmd`
- `docs/RELATORIO_SPRINT_31_FICHA_INTERATIVA_YOUTUBE_PLANO_COMPLETO.md`

## Testes/checks realizados

- `npm run type-check` ✅
- `node --check server/index.mjs` ✅
- `node --check server/db.mjs` ✅
- `node --check server/supabase.mjs` ✅
- `node --check server/integrations.mjs` ✅
- `node --check server/security.mjs` ✅
- `npm run build` 🟡 parou em `vite: not found` porque o ambiente não tem `node_modules`; rodar `npm install --registry https://registry.npmjs.org/` no PC antes do build.

## Como testar

1. Entrar como aluno.
2. Abrir `Meus Treinos`.
3. Abrir uma ficha/plano 30D.
4. Na área `Semana / Plano completo`, clicar em qualquer card de dia.
5. Confirmar que abriu o detalhe do dia/treino.
6. Em exercício sem vídeo cadastrado, clicar em `Buscar no YouTube`.
7. Confirmar que abriu diretamente o YouTube com busca pelo exercício.
8. Marcar exercício como concluído e conferir progresso.
9. Dar F5 e validar se progresso permaneceu salvo.

