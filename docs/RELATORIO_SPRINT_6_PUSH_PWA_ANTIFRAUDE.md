# Relatório — Sprint 6 Push/PWA + Antifraude de Pontos

## Implementado
- Service Worker `public/sw.js` com cache básico, modo offline controlado e handlers de push/notification click.
- Manifest PWA ampliado com id, scope, orientation, categorias e shortcuts.
- Endpoints: `/api/push/vapid-public-key`, `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/test`.
- Preferências e inscrições push persistidas e espelháveis no Supabase.
- Painel `/super-admin/status` com card PWA, teste de push e monitoramento.
- Antifraude de pontos com `point_ledger`, `antifraud_events`, limite diário, bloqueio de duplicidade e rule keys.
- Hábito, suplemento, conteúdo e check-in aprovado passam pelo ledger antifraude.
- Resgates validam saldo, evitam duplicidade pendente e descontam pontos apenas quando aprovados.
- SQL Supabase atualizado com novas tabelas.

## Implementado parcialmente
- Push remoto real está preparado por VAPID, mas envio remoto criptografado completo depende de configurar VAPID e provider/biblioteca web-push.
- Antifraude cobre regras principais; análise por IP/device/comportamento avançado fica para depois.

## Em espera
- Web Push remoto fora do app com entrega criptografada completa.
- Antifraude com score comportamental avançado.
- Dashboard gráfico de fraude por período.

## Variáveis novas
PUSH_ENABLED=true
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:suporte@fitpro.local
