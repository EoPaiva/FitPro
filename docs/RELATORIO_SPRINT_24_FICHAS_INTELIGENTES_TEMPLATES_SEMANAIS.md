# FitPro Elite — Sprint 24

## 🟢 Implementado

- Criador de ficha profissional reorganizado em wizard real de 5 etapas: Dados gerais, Estrutura semanal, Exercícios/Biblioteca, Progressão e Revisão/Publicação.
- Autosave local de rascunho do wizard com opção de continuar ou descartar rascunho ao reabrir.
- Campo Template agora aplica a estrutura automaticamente no formulário, preenchendo dados gerais e a semana com treinos, descansos e exercícios editáveis.
- Templates do backend agora são enviados no bootstrap com dias e exercícios completos para uso real no frontend.
- Estrutura semanal por Segunda a Domingo com tipo de dia: treino, descanso, cardio, mobilidade, alongamento, recuperação ou opcional.
- Biblioteca avançada integrada à Etapa 3 do wizard com busca, filtro por grupo muscular e botão “Adicionar ao treino”.
- Exercício adicionado entra imediatamente no dia selecionado, evita duplicidade no rascunho e é persistido ao salvar/publicar a ficha.
- Cada exercício da ficha tem campos editáveis: nome, grupo, séries, reps/tempo, carga, descanso, técnica/observação, cuidados, duplicar, remover e mover.
- Backend preparado para persistir `weekday` e `day_type` em `workout_days` sem quebrar dados antigos.
- Endpoint administrativo criado para adicionar exercício diretamente a um dia de treino existente: `POST /api/workout-days/:id/exercises`.
- Endpoint administrativo criado para remover exercício de uma ficha existente: `DELETE /api/workout-exercises/:id`.
- Modal da ficha agora permite remover exercício existente com confirmação.
- Aviso de responsabilidade fitness incluído no criador: modelos são sugestões gerais e devem ser ajustados pelo profissional.

## 🟡 Parcial / em espera

- Os 14 templates obrigatórios já existem como base no backend e agora são aplicáveis no wizard. Alguns ainda podem ser refinados com mais exercícios e textos técnicos conforme validação visual/funcional.
- A biblioteca adiciona exercício perfeitamente durante a criação/rascunho da ficha; edição avançada de ficha existente ainda pode evoluir para um editor completo em etapas.
- O aluno já visualiza ficha de forma mais limpa no modal de ficha/logs, mas a visão “Hoje / Próximo treino / Semana completa” pode ser refinada em sprint futura.
- `npm run type-check` passou.
- `node --check server/index.mjs` e `node --check server/db.mjs` passaram.
- `npm run server` subiu localmente e `/health` respondeu.
- `npm run build` não concluiu neste ambiente porque o binário `vite` não estava disponível sem reinstalar dependências; no PC do projeto, rodar `npm install --registry https://registry.npmjs.org/` antes do build.

## 🔴 Pendente

- Editor completo em etapas para modificar uma ficha já publicada sem abrir novo cadastro.
- Substituir exercício por outro direto no card da ficha existente.
- Visual final do aluno com cards dedicados de Hoje, Próximo treino e Semana completa.
- Supabase-first 100%.
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
- `server/index.mjs`
- `server/db.mjs`
- `docs/RELATORIO_SPRINT_24_FICHAS_INTELIGENTES_TEMPLATES_SEMANAIS.md`

## Como testar

1. Entrar como personal/admin.
2. Abrir Treinos.
3. Clicar em “Criar ficha profissional”.
4. Selecionar um template como “Hipertrofia ABC” ou “Adaptação 7 dias”.
5. Verificar preenchimento automático da semana.
6. Ir para a Etapa 3.
7. Escolher um dia ativo e clicar em “Adicionar ao treino” em um exercício da biblioteca.
8. Salvar rascunho ou publicar.
9. Dar F5 e confirmar que a ficha continua salva.
10. Abrir a ficha e testar remover exercício existente.

## Compatibilidade

- Não inclui `.env` real.
- Não inclui banco real.
- Não inclui `node_modules`.
- Não inclui `dist`.
- Não remove login, sessão, health, pagamentos, avatar, comunidade, WhatsApp, auditoria, footer, legal ou permissões.
