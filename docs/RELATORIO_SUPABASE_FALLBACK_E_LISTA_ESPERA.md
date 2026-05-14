# Relatório — Supabase principal + fallback automático + lista de espera

## Implementado

- Supabase como camada principal preparada no backend.
- SQLite mantido como fallback automático.
- Fila `sync_queue` para itens pendentes de sincronização.
- Tabela `system_status` para monitorar banco/storage.
- Tabela `storage_fallback_files` para arquivos salvos localmente quando Supabase Storage falhar.
- `server/sync.mjs` para queue, status e processamento manual.
- `server/database-adapter.mjs` como adapter Supabase-primary/SQLite-fallback.
- `server/supabase.mjs` ampliado com health check, upsert, select e status de buckets.
- Endpoint `/api/system/status` para dev/super_admin.
- Endpoint `/api/sync/queue` para dev/super_admin.
- Endpoint `/api/sync/run` para dev/super_admin.
- Painel `/super-admin/status` mostrando fila de sync e modo de banco.
- Comprovantes: Supabase Storage primeiro, fallback local se falhar.
- Documentação de buckets/policies do Supabase.
- `.env.example` com `DATA_MODE` e buckets de storage.

## Implementado parcialmente

- Migração Supabase/PostgreSQL: estrutura e adapter criados, mas leituras principais ainda usam SQLite até educarmos o banco.
- Supabase Storage: comprovantes têm caminho híbrido; avatars/fotos de evolução ainda precisam entrar no mesmo padrão.
- Sync automático: existe processamento manual `/api/sync/run`; agendamento automático pode ser ativado depois.
- Status dev: mostra fila e modo; ainda pode receber cards por integração externa em tempo real.

## Em espera

- RLS final do Supabase.
- Migração total de todas as queries para repositories Supabase-first.
- Supabase Auth substituindo auth própria.
- Migração de dados históricos.
- Cron automático de sync.
- Assinatura recorrente Mercado Pago.
- WhatsApp Business com automações por gatilho.
- Google Calendar/Meet real.
- Push notifications.

## Não implementado por segurança/dependência

- Nenhuma secret real foi incluída.
- `.env` real não foi enviado.
- README não foi criado.
- Modo demo público não foi criado.
- Automação que depende de templates aprovados/credenciais externas não foi ativada como pública.

## Comandos

```bash
npm install --registry https://registry.npmjs.org/
npm run build
npm run type-check
npm run server
```

Depois de extrair o zip, restaurar:

```powershell
copy "C:\Users\mpaii\Documents\Projetos\_keys_privadas\fitpro.env.backup" "C:\Users\mpaii\Documents\Projetos\fitpro-premium\.env"
```
