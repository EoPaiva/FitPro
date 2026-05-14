# FitPro Elite — Sprint 26 — Exercícios editáveis + histórico das fichas

## 🟢 Implementado

- A ficha publicada agora permite gerenciar cada exercício individualmente sem abrir o editor completo em etapas.
- Cada exercício da ficha ganhou ações diretas: **Editar**, **Substituir**, **Duplicar**, **Mover para cima**, **Mover para baixo** e **Remover**.
- A ação **Editar** permite alterar nome, grupo, séries, repetições/tempo, carga, descanso, equipamento, método, observações, substituições sugeridas e cuidados.
- A ação **Substituir** abre a biblioteca avançada e troca o exercício mantendo a ficha, o dia, a ordem e a estrutura do aluno.
- O backend ganhou persistência real para edição individual de exercícios.
- O backend ganhou persistência real para substituição, duplicação e reordenação de exercícios.
- Cada alteração gera nova versão da ficha em `workout_plan_versions`.
- O histórico visual de versões continua disponível no modal da ficha, com motivo da alteração e restauração.
- As ações respeitam permissão: aluno visualiza/registro; personal/dev/super admin editam.
- Interface responsiva para ações dos exercícios em desktop e mobile.

## 🟡 Parcial / em espera

- Histórico detalhado por campo alterado ainda pode evoluir em sprint futura.
- Autosave em backend enquanto o personal digita no editor completo continua em espera; as alterações individuais já salvam imediatamente.
- Substituição com recomendação inteligente por objetivo/grupo ainda pode evoluir para IA/regras avançadas.

## 🔴 Pendente

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
- `docs/RELATORIO_SPRINT_26_EXERCICIOS_HISTORICO_FICHAS.md`

## Como testar

1. Entrar como personal.
2. Abrir **Treinos**.
3. Abrir uma ficha avançada.
4. Em um exercício, testar **Editar** e salvar.
5. Testar **Substituir** escolhendo outro exercício da biblioteca.
6. Testar **Duplicar**.
7. Testar mover para cima/baixo.
8. Testar **Remover** com confirmação.
9. Atualizar a página e confirmar que as mudanças persistiram.
10. Abrir o histórico visual da ficha e verificar as versões geradas.

## Testes realizados

- `npm run type-check`
- `node --check server/index.mjs`
- `node --check server/db.mjs`
- `node --check server/integrations.mjs`
- `node --check server/security.mjs`
