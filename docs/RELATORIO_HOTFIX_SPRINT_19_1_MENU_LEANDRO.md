# FitPro Elite — Hotfix Sprint 19.1 — Menu Leandro

🟢 IMPLEMENTADO

🟢 Corrigida a regra de liberação do painel do personal para aceitar assinaturas em status `trial`, `teste` e `provisorio` enquanto não expiradas.

🟢 O perfil seeded Leandro usa assinatura `trial`; por isso, antes do hotfix, os botões do menu abriam o gate de ativação e pareciam ter parado de funcionar.

🟢 Mantido o bloqueio para personal com status `pendente`, `inativo`, `inadimplente`, `cancelado` ou vencido.

🟢 Adicionado rótulo amigável para `trial`/`teste`: “Teste ativo”.

🟡 PARCIAL / EM ANDAMENTO / EM ESPERA

🟡 A validação manual recomendada é entrar com `leandro@fitpro.dev / Leandro123` e testar: Coach Invisível, Solicitações, Alunos, Treinos, Agenda, Pagamentos, Comunidade, Mensagens, Relatórios, CRM/Leads, Sorteios, Recompensas, Integrações, Automações e Perfil.

🔴 NÃO IMPLEMENTADO / PENDENTE

🔴 Não foi alterado o modelo de assinatura definitivo. Este hotfix apenas corrige a regressão do perfil de teste Leandro sem liberar status pendente.
