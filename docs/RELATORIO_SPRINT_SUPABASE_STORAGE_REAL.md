# Relatório — Sprint Supabase e Storage Real

## Implementado

- Supabase Storage principal para avatars, fotos de evolução, conteúdos e comprovantes.
- Fallback local automático para storage quando Supabase falhar ou não estiver configurado.
- Fila `storage_fallback_files` para sincronização posterior.
- Endpoint manual `POST /api/storage/sync`.
- `POST /api/sync/run` agora processa banco e storage.
- Sync automático opcional via `SYNC_INTERVAL_SECONDS`.
- Endpoints privados para recuperar avatar, foto de avaliação e mídia de conteúdo por URL assinada/fallback local.
- SQL ampliado com tabelas essenciais adicionais para próxima migração.

## Implementado parcialmente

- Supabase como banco principal: adapter e fila existem, mas algumas leituras ainda vêm do SQLite até a migração total.
- RLS final: documentado e preparado, mas precisa ser educado no Supabase real depois.
- Storage real: rotas usam buckets privados, mas os buckets/policies precisam ser criados no painel Supabase.

## Em espera

- Migração histórica completa SQLite -> Supabase.
- Supabase Auth substituindo auth própria.
- Cron externo/worker dedicado para sync em produção.
- Mercado Pago recorrente completo.
- WhatsApp automações por gatilho.
- Google Calendar/Meet real.

## Variáveis novas

```env
SUPABASE_STORAGE_BUCKET_PROOFS=payment-proofs
SUPABASE_STORAGE_BUCKET_AVATARS=avatars
SUPABASE_STORAGE_BUCKET_PROGRESS=progress-photos
SUPABASE_STORAGE_BUCKET_CONTENTS=content-files
SYNC_INTERVAL_SECONDS=0
SYNC_BATCH_LIMIT=25
```

## Testes recomendados

```bash
npm install --registry https://registry.npmjs.org/
npm run build
npm run type-check
npm run server
```

Depois testar:

- `/health`
- `/api/system/status` como dev
- upload de avatar
- upload de comprovante
- upload de foto de evolução
- `POST /api/storage/sync` como dev
