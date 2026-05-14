# FitPro Elite — Sprint 17

## Planos da plataforma + códigos de ativação para personal

Atualização aplicada em cima da Sprint 16, sem refazer o projeto do zero, sem README, sem `.env` real e sem expor tokens/secrets.

## Status

🟢 FitPro Start criado como plano da plataforma para personal.
🟢 FitPro Start configurado com preço R$ 49,99/mês.
🟢 FitPro Start configurado com limite de até 10 alunos ativos.
🟢 FitPro Start configurado com recursos de painel básico, treinos, treino provisório, avaliação básica, Pix próprio, comprovantes, chat básico, comunidade básica e suporte padrão.
🟢 FitPro Plus criado como plano da plataforma para personal.
🟢 FitPro Plus configurado com preço R$ 149,99/mês.
🟢 FitPro Plus configurado com limite de até 100 alunos ativos.
🟢 FitPro Plus configurado com recursos de biblioteca de exercícios, avaliações completas, fotos de evolução, relatórios, desafios, pódio, FitPoints, Academy, hábitos, suplementos, WhatsApp Link, IA assistiva limitada e suporte prioritário.
🟢 Plano futuro FitPro Elite / Studio aparece como EM ESPERA na interface.
🟢 Banco SQLite cria/atualiza `platform_plans` automaticamente.
🟢 Banco SQLite cria/atualiza `platform_activation_codes` automaticamente.
🟢 Banco SQLite cria/atualiza `activation_code_redemptions` automaticamente.
🟢 `platform_subscriptions` ganhou campos de origem, plano, início, expiração e código de ativação.
🟢 Backend valida código em `POST /api/platform-activation-codes/validate`.
🟢 Backend resgata código em `POST /api/platform-activation-codes/redeem`.
🟢 Validação do código acontece no backend, não no frontend.
🟢 Aluno não consegue usar código de plano de personal.
🟢 Personal consegue ativar código próprio.
🟢 Dev/Super Admin consegue criar código de ativação.
🟢 Dev/Super Admin consegue listar códigos.
🟢 Dev/Super Admin consegue cancelar, bloquear, inativar ou reativar código.
🟢 Código pode liberar FitPro Start.
🟢 Código pode liberar FitPro Plus.
🟢 Código registra duração em dias.
🟢 Código registra expiração.
🟢 Código registra limite de usos e usos realizados.
🟢 Código pode ser vinculado a personal específico.
🟢 Código registra tipo: cortesia, teste, parceiro, implantação, promoção, renovação manual, acesso interno ou suporte.
🟢 Resgate cria/atualiza assinatura do personal.
🟢 Assinatura criada por código fica com `source = activation_code`.
🟢 Assinatura criada por código fica com `payment_method = activation_code`.
🟢 Assinatura mostra data de expiração.
🟢 Painel do personal mostra aviso de plano ativo via código.
🟢 Painel do personal tem botão “Tenho um código de ativação”.
🟢 Painel do personal tem caminho “Escolher plano e pagar agora”.
🟢 Checkout de assinatura da plataforma via Mercado Pago preparado em `POST /api/platform-subscriptions/checkout`.
🟢 Webhook Mercado Pago agora também reconhece assinatura da plataforma por `external_reference`.
🟢 Painel Dev tem área para planos da plataforma e códigos.
🟢 Logs de pagamento e auditoria são registrados no uso de códigos.
🟢 SQL Supabase incremental criado em `docs/SUPABASE_SPRINT_17_PLATFORM_PLANS_ACTIVATION_CODES.sql`.

🟡 Checkout Mercado Pago da assinatura do personal depende das variáveis reais no Railway.
🟡 Bloqueio automático por expiração do plano está preparado por status/data, mas a rotina de bloqueio por cron fica para sprint futura.
🟡 Avisos automáticos 7/3/1 dias antes da expiração ficam para sprint futura de automações.
🟡 Mostrar código completo apenas para Dev/Super Admin foi mantido no painel atual; política de copiar uma única vez pode ser reforçada depois.
🟡 RLS/policies finais do Supabase ficam para etapa futura de Supabase-first completo.

🔴 Marketplace/split de pagamento não foi implementado.
🔴 Comissão automática da plataforma não foi implementada.
🔴 Repasse automático para personal não foi implementado.
🔴 KYC/conta conectada do personal não foi implementado.
🔴 Plano FitPro Elite / Studio não foi implementado; ficou como EM ESPERA.
🔴 README não foi criado, conforme regra do projeto.

## Arquivos alterados

🟢 `server/db.mjs`
🟢 `server/index.mjs`
🟢 `server/seed.mjs`
🟢 `server/sync.mjs`
🟢 `src/api.ts`
🟢 `src/main.ts`
🟢 `src/styles.css`

## Arquivos criados

🟢 `docs/SUPABASE_SPRINT_17_PLATFORM_PLANS_ACTIVATION_CODES.sql`
🟢 `docs/RELATORIO_SPRINT_17_PLANOS_PLATAFORMA_CODIGOS_ATIVACAO.md`

## Arquivos removidos

🟢 Nenhum arquivo removido.

## Banco de dados

🟢 `platform_plans` criada.
🟢 `platform_activation_codes` criada.
🟢 `activation_code_redemptions` criada.
🟢 `platform_subscriptions.platform_plan_id` adicionado.
🟢 `platform_subscriptions.source` adicionado.
🟢 `platform_subscriptions.activation_code_id` adicionado.
🟢 `platform_subscriptions.starts_at` adicionado.
🟢 `platform_subscriptions.expires_at` adicionado.
🟢 `platform_subscriptions.payment_method` adicionado.
🟢 `platform_subscriptions.metadata` adicionado.

## Como testar

🟢 Entrar como Dev/Super Admin.
🟢 Abrir “Planos plataforma” ou “Códigos”.
🟢 Criar código para FitPro Plus por 30 dias.
🟢 Copiar o código gerado.
🟢 Entrar como personal.
🟢 Abrir “Plano FitPro”.
🟢 Clicar em “Tenho um código de ativação”.
🟢 Validar o código.
🟢 Ativar o código.
🟢 Conferir se o plano aparece como ativo via código de ativação.
🟢 Voltar ao Dev e conferir assinatura e último resgate.

## Validações executadas

🟢 `node --check server/index.mjs` passou.
🟢 `node --check server/db.mjs` passou.
🟢 `node --check server/seed.mjs` passou.
🟢 `node --check server/sync.mjs` passou.
🟢 `npx tsc --noEmit --pretty false` passou.
🟢 API local iniciou.
🟢 `/health` respondeu 200.
🟢 Login Dev local funcionou.
🟢 Criação de código local funcionou.
🟢 Login personal local funcionou.
🟢 Validação de código local funcionou.
🟢 Resgate de código local funcionou.

## Próximos passos recomendados

🟡 Criar rotina de aviso de expiração 7/3/1 dias.
🟡 Criar bloqueio automático controlado para plano expirado.
🟡 Melhorar checkout Mercado Pago da assinatura do personal com tela dedicada de sucesso.
🟡 Fechar Supabase-first por blocos.
🟡 Evoluir plano FitPro Elite / Studio quando houver regra comercial final.
