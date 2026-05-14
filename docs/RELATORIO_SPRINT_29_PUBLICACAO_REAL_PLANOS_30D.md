# FitPro Elite — Sprint 29
## Publicação real de ficha + Planos 30D

Data: 13/05/2026

## 🟢 Implementado

🟢 Corrigido o fluxo da Biblioteca avançada de exercícios: o formulário `assign-exercise` agora tem handler real no frontend.

🟢 O botão **Adicionar em uma ficha** deixa de gerar apenas uma mensagem genérica; agora salva no backend usando:

- `POST /api/workout-days/:id/exercises` para ficha existente.
- `POST /api/workout-plans` para criar nova ficha com o exercício.
- `PATCH /api/workout-plans/:id` para publicar ficha existente quando o personal usa **Publicar para aluno**.

🟢 Ao publicar pelo fluxo da biblioteca, a ficha passa a status `ativo` e fica vinculada ao `student_id` correto.

🟢 A listagem de fichas do aluno no bootstrap agora filtra apenas fichas realmente publicadas/ativas, evitando rascunhos técnicos no painel do aluno.

🟢 Adicionada a área **Planos prontos de 30 dias** dentro de Treinos.

🟢 Criados 7 planos mensais completos como camada acima das fichas semanais:

1. Hipertrofia Base 30D
2. Emagrecimento + Condicionamento 30D
3. Força Essencial 30D
4. Iniciante Total 30D
5. Casa Sem Equipamento 30D
6. Mobilidade, Postura e Core 30D
7. Glúteos e Pernas 30D

🟢 Cada plano mensal cria automaticamente uma ficha com 30 dias, treinos, descanso, cardio, mobilidade, exercícios, séries, repetições, descanso, observações e progressão semanal.

🟢 O fluxo mensal segue o princípio: **Aluno → Plano de 30 dias → Prévia → Publicar**.

🟢 Adicionada prévia do mês por semanas e dias antes de salvar/publicar.

🟢 O botão **Aplicar plano de 30 dias** aparece na área de Treinos do Personal.

🟢 Mantida a criação manual de ficha, biblioteca, templates semanais, edição avançada e visão do aluno.

## 🟡 Parcial / em espera

🟡 Os planos 30D usam a estrutura atual de `workout_plans`, `workout_days` e `workout_exercises`, sem criar novas tabelas mensais para evitar risco de migração pesada.

🟡 Ajustes rápidos avançados antes de publicar ainda podem evoluir: trocar exercício dentro do modal mensal, mudar dias em massa e salvar modelo personalizado do personal.

🟡 Autosave em backend para plano mensal em edição ainda fica para próxima etapa; o salvamento real acontece ao confirmar rascunho/publicação.

🟡 Aplicar plano para vários alunos ao mesmo tempo fica em espera.

## 🔴 Pendente

🔴 Tabelas dedicadas `monthly_workout_templates` e `student_monthly_plans`, caso o projeto decida separar ficha mensal de ficha comum no futuro.

🔴 Favoritos do personal para planos mensais.

🔴 Duplicar plano mensal para múltiplos alunos.

🔴 Indicador completo de volume semanal por grupo muscular em planos mensais.

🔴 Supabase-first 100% do banco inteiro.

🔴 Marketplace/split Mercado Pago.

🔴 Comissão automática.

🔴 KYC/conta conectada do personal.

🔴 Multi-tenant completo.

🔴 Push avançado.

🔴 Antifraude avançado.

🔴 PDF de avaliação física.

🔴 Google Calendar/Meet avançado.

🔴 README novo.

## Arquivos alterados

- `src/main.ts`
- `src/styles.css`
- `server/index.mjs`
- `docs/RELATORIO_SPRINT_29_PUBLICACAO_REAL_PLANOS_30D.md`

## Como testar

1. Entrar como personal.
2. Ir em Treinos.
3. Abrir Biblioteca avançada.
4. Clicar em **Adicionar em uma ficha**.
5. Selecionar aluno.
6. Escolher criar nova ficha ou ficha existente.
7. Clicar em **Publicar para aluno**.
8. Entrar como aluno.
9. Confirmar que a ficha aparece em **Meus Treinos**.
10. Voltar como personal.
11. Clicar em **Aplicar plano de 30 dias**.
12. Escolher aluno e plano.
13. Ver prévia mensal.
14. Publicar.
15. Entrar como aluno e conferir o plano/ficha mensal.

## Testes realizados

🟢 `npm run type-check`

🟢 `node --check server/index.mjs`

🟢 `node --check server/db.mjs`

🟢 `/health` local

🟢 `/api/health` local

🟡 `npm run build` parou em `vite: not found` neste ambiente porque o binário do Vite não está instalado. Rodar `npm install --registry https://registry.npmjs.org/` antes do build no PC.
