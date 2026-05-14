# FitPro Elite — Supabase principal + SQLite fallback automático

Esta atualização prepara o FitPro para usar Supabase/PostgreSQL como fonte principal de produção, mantendo SQLite como fallback automático controlado.

## Modelo adotado

```text
Leitura crítica: SQLite ainda garante o app enquanto a migração completa é feita.
Escrita: operação local é salva e espelhada para Supabase quando configurado.
Falha no Supabase: item entra em sync_queue.
Storage: Supabase Storage primeiro para comprovantes; se falhar, salva localmente e registra storage_fallback_files.
```

## Novos arquivos

```text
server/supabase.mjs
server/sync.mjs
server/database-adapter.mjs
docs/SUPABASE_STORAGE_POLICIES.sql
docs/SUPABASE_FALLBACK_STRATEGY.md
```

## Novas tabelas SQLite de controle

```text
sync_queue
system_status
storage_fallback_files
```

## Endpoints novos

```text
GET  /api/system/status      dev/super_admin
GET  /api/sync/queue         dev/super_admin
POST /api/sync/run           dev/super_admin
GET  /api/integrations/status usuário autenticado
```

## Buckets privados esperados

```text
payment-proofs
avatars
progress-photos
content-files
```

## Como funciona a fila

Quando uma operação precisa ir para o Supabase e falha, o backend salva um registro em `sync_queue` com:

```text
entity
action
entity_id
payload_json
status
attempts
last_error
```

O dev pode tentar sincronizar manualmente pelo painel ou por:

```bash
POST /api/sync/run
```

## O que ainda falta para migração total

- trocar todas as consultas de leitura para repositories Supabase-first;
- criar RLS definitiva;
- decidir se Supabase Auth substituirá a auth própria;
- criar migração de dados SQLite -> Supabase;
- testar storage assinado para avatars e fotos de evolução.
