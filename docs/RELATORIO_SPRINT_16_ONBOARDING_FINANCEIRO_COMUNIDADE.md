# FitPro Elite — Relatório Sprint 16

## Atualização

**Sprint 16 — Onboarding real, financeiro separado, hábitos rápidos e comunidade com identidade**

Esta atualização foi aplicada em cima da base existente, sem refazer o projeto do zero, sem criar README e sem expor secrets. O objetivo foi corrigir o fluxo real de aluno novo, remover dados falsos de jornada/check-in, reforçar foto/avatar, simplificar hábitos, melhorar comunidade e separar o fluxo financeiro entre Dev, Personal e Aluno.

---

## Arquivos alterados

- `src/main.ts`
- `src/api.ts`
- `src/styles.css`
- `server/index.mjs`
- `server/db.mjs`
- `server/seed.mjs`

## Arquivos criados

- `.env.example`
- `docs/SUPABASE_SPRINT_16_ONBOARDING_FINANCEIRO_COMUNIDADE.sql`
- `docs/RELATORIO_SPRINT_16_ONBOARDING_FINANCEIRO_COMUNIDADE.md`

## Arquivos removidos

- Nenhum arquivo funcional foi removido.
- Nenhum `README.md` foi criado.
- Nenhum `.env` real foi incluído.

---

## Status por item solicitado

🟢 **Onboarding real do aluno novo**
- Novo aluno não é mais vinculado automaticamente ao Leandro.
- Novo aluno fica em `sem_personal` / `perfil_basico`.
- Dashboard completo fica bloqueado até vínculo aprovado.
- Tela guiada “Complete seu início no FitPro” foi adicionada.

🟢 **Escolha de cidade, UF, modalidade, objetivo e nível**
- Formulário visual de onboarding criado.
- Filtros para personais por cidade/UF/modalidade/online foram adicionados.
- Estado vazio quando não houver personal compatível foi adicionado.

🟢 **Solicitação de acompanhamento**
- Endpoint `POST /api/student/onboarding/request-personal` criado.
- Aluno escolhe personal e plano.
- Solicitação fica como `aguardando_aprovacao`.
- Personal recebe notificação interna.

🟢 **Tela aguardando aprovação**
- Aluno vê personal solicitado, plano, cidade e status.
- Botões de cancelar solicitação e chamar no WhatsApp foram adicionados.

🟢 **Cabeçalho sem Leandro automático**
- Cabeçalho agora muda conforme estado:
  - sem personal: `FitPro Elite • Início do acompanhamento`
  - aguardando aprovação: `FitPro Elite • Aguardando aprovação`
  - aprovado: `FitPro Elite • Nome/Marca do personal`

🟢 **Jornada/Pulse sem dados fake**
- Aluno sem personal vê jornada inicial.
- Aluno aguardando aprovação vê status correto.
- Aluno aprovado sem treino vê mensagem de treino ainda não liberado.
- Não mostra treino, desafio ou progresso inexistente.

🟢 **Check-in/desafio sem progresso fake**
- Removido fallback que fazia aluno aparecer em progresso de outro participante.
- Ranking/pódio só mostra participantes com progresso/pontos reais.
- Estado vazio criado para aluno sem desafio.

🟢 **Badges e conquistas base**
- Tabela `badges` criada.
- Badges iniciais reais adicionadas:
  - primeiro acesso
  - primeiro personal escolhido
  - personal aprovado
  - hábito registrado
- Estrutura suporta raridade, critério, bloqueada/desbloqueada e data.

🟢 **Comunidade com reações por identidade**
- Tabela `community_reactions` criada.
- Cada reação salva usuário, nome, avatar, emoji, tipo e data.
- Interface mostra contagem por emoji.
- Lista de quem reagiu aparece no resumo/tooltip.
- Usuário pode remover ou trocar reação.
- Evita duplicidade do mesmo usuário no mesmo post.

🟡 **Comunidade — melhorias adicionais**
- Comentários com avatar/nome foram reforçados.
- Respostas por `parentId` foram preparadas.
- Contador de comentários e reações ficou mais claro.
- Filtros visuais básicos continuam existentes.
- Moderação completa, denúncia, privacidade avançada e autorização formal de antes/depois ficam para próxima etapa.

🟢 **Hábitos rápidos**
- Criado check-in rápido por cards.
- Categorias: água, sono, movimento, alimentação, proteína, carboidratos, gorduras, energia, humor, suplementos e treino.
- Linguagem sem julgamento.
- Feedback motivacional automático.

🟢 **Hábitos avançados opcionais**
- Campos numéricos foram preservados como modo avançado opcional.
- Check-in rápido virou padrão visual.

🟢 **Foto de perfil/avatar**
- Upload continua salvando no usuário.
- Campo `students.avatar_url` foi adicionado e atualizado junto com `users.avatar`.
- Interface usa fallback com iniciais.
- Foto é exibida de forma mais consistente em perfil, cabeçalho, comunidade, comentários, chat, ranking/pódio e solicitações.

🟢 **Separação financeira Dev / Personal / Aluno**
- Fluxo separado em duas camadas:
  - Personal paga assinatura da plataforma para o Dev.
  - Aluno paga manualmente via Pix para o Personal.
- Textos foram ajustados para não confundir “plano da plataforma” com “plano do aluno”.

🟢 **Pagamento do personal para o Dev**
- Tabela `platform_subscriptions` criada.
- Dev/Super Admin visualiza assinatura da plataforma.
- Estrutura preparada para controlar trial, ativo, pendente, vencido, bloqueado e cancelado.
- Webhook Mercado Pago da plataforma continua reservado para esse fluxo.

🟢 **Configurações Pix do personal**
- Tabela `trainer_payment_settings` criada.
- Endpoint `PUT /api/trainer/payment-settings` criado.
- Personal pode salvar tipo de chave, chave Pix, recebedor, banco, documento opcional, instruções, QR Code e status de aceite manual.

🟢 **Planos do personal para alunos**
- Tabela `trainer_plans` criada.
- Endpoint `POST /api/trainer/plans` criado.
- Personal pode criar planos próprios para alunos.
- Aluno vê planos do personal selecionado no onboarding/checkout.

🟢 **Checkout do aluno com Pix do personal**
- Tela de pagamento do aluno mostra Pix/configurações do personal quando disponível.
- Deixa claro que o aluno paga o personal, não a plataforma.
- Comprovante continua seguindo aprovação do personal.

🟢 **Banco de dados — pagamentos**
- Criadas/adaptadas estruturas:
  - `platform_subscriptions`
  - `trainer_payment_settings`
  - `trainer_plans`
  - `student_payments`
  - `payment_logs`

🟡 **Supabase**
- SQL incremental criado em `docs/SUPABASE_SPRINT_16_ONBOARDING_FINANCEIRO_COMUNIDADE.sql`.
- RLS é habilitada no SQL.
- Policies finais por tenant/usuário ainda ficam em espera para evitar regra errada em produção.

---

## Variáveis de ambiente

Nenhuma secret nova obrigatória foi criada nesta sprint.

Manter no Railway/backend:

```env
AUTH_SECRET=
DATABASE_PATH=./data/fitpro.sqlite
UPLOAD_DIR=./storage/uploads
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
WHATSAPP_BUSINESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
OPENAI_API_KEY=
RESEND_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Manter na Vercel/frontend apenas públicas:

```env
VITE_API_URL=https://fitpro-production-847a.up.railway.app
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_MERCADO_PAGO_PUBLIC_KEY=
```

---

## Comandos para rodar localmente

```bash
npm install --registry https://registry.npmjs.org/
npm run type-check
npm run build
npm run server
npm run dev
```

## Validações realizadas neste ambiente

🟢 `node --check server/db.mjs` passou.
🟢 `node --check server/index.mjs` passou.
🟢 `node --check server/seed.mjs` passou.
🟢 `tsc --noEmit --pretty false` passou.
🟢 API local iniciou.
🟢 `/health` respondeu 200 em teste local.
🟢 Cadastro de aluno novo foi testado e ficou sem personal aprovado.
🟢 Bootstrap do aluno novo retornou onboarding bloqueado.

🟡 `npm run build` não concluiu neste ambiente porque o binário local do `vite` não estava disponível em `node_modules`. Rodar `npm install --registry https://registry.npmjs.org/` no PC antes do build.

---

## Pontos de atenção

🟡 Rodar `docs/SUPABASE_SPRINT_16_ONBOARDING_FINANCEIRO_COMUNIDADE.sql` no Supabase se quiser preparar as tabelas por lá.
🟡 Depois do deploy, testar cadastro novo real na Vercel.
🟡 Testar upload de avatar após deploy Railway, porque depende de permissão de escrita em `UPLOAD_DIR`.
🟡 Testar solicitação de personal com aluno novo.
🟡 Testar aprovação/recusa pelo personal.
🟡 Testar configuração Pix do personal.

---

## Próximos passos recomendados

🟡 Fechar moderação avançada da comunidade.
🟡 Criar fluxo visual completo de lista de espera quando não houver personal na cidade.
🟡 Fechar bloqueio financeiro automático do personal inadimplente.
🟡 Criar policies finais do Supabase por tenant/workspace.
🟡 Melhorar upload de QR Code Pix com storage privado.
🟡 Refinar checkout do aluno com comprovante vinculado ao plano do personal.

---

## Segurança

🟢 Nenhum token real foi incluído.
🟢 Nenhum `.env` real foi incluído.
🟢 Nenhum banco SQLite real foi incluído no pacote final.
🟢 Nenhum upload privado foi incluído.
🟢 Nenhum README foi criado.
