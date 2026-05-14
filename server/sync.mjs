import { all, get, run, toJSON } from './db.mjs';
import { id, nowISO } from './security.mjs';
import fs from 'node:fs';
import { hasSupabaseAdmin, supabaseHealthCheck, supabaseRest, uploadPrivateObject } from './supabase.mjs';

export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCED: 'synced',
  ERROR: 'error',
  SKIPPED: 'skipped'
};

export function queueSync({ workspaceId = 'ws_fitpro_elite', entity, action, entityId = '', payload = {}, lastError = '' }) {
  const queueId = id('sync');
  run(
    'INSERT INTO sync_queue (id,workspace_id,entity,entity_id,action,payload_json,status,attempts,last_error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [queueId, workspaceId, entity, entityId, action, toJSON(payload), SYNC_STATUS.PENDING, 0, String(lastError || '').slice(0, 1000), nowISO(), nowISO()]
  );
  return queueId;
}

export function recordSystemStatus(key, status, message = '', metadata = {}) {
  run(
    'INSERT INTO system_status (id,key,status,message,metadata_json,checked_at) VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET status=excluded.status,message=excluded.message,metadata_json=excluded.metadata_json,checked_at=excluded.checked_at',
    [id('sys'), key, status, String(message || '').slice(0, 1000), toJSON(metadata), nowISO()]
  );
}

export function listSyncQueue(status = '') {
  if (status) return all('SELECT * FROM sync_queue WHERE status=? ORDER BY created_at DESC LIMIT 200', [status]);
  return all('SELECT * FROM sync_queue ORDER BY created_at DESC LIMIT 200');
}

export function syncSummary() {
  const rows = all('SELECT status, COUNT(*) as total FROM sync_queue GROUP BY status');
  const summary = { pending: 0, synced: 0, error: 0, skipped: 0 };
  rows.forEach(row => { summary[row.status] = row.total; });
  return summary;
}

export const SUPABASE_SYNC_TABLES = [
  'workspaces','users','trainers','students','plans','payments','payment_history','notifications','audit_logs',
  'workouts','workout_plans','workout_days','workout_exercises','exercise_library','workout_plan_versions','workout_logs','workout_exercise_logs',
  'schedules','assessments','habits','supplements','contents','community_posts','messages','leads','challenges',
  'reward_items','reward_redemptions','challenge_checkins','giveaways','giveaway_entries','integration_logs','integration_settings','ai_help_logs',
  'push_subscriptions','notification_preferences','point_ledger','antifraud_events','sync_queue','system_status','storage_fallback_files',
  'tenant_branding','referral_codes','coupons','device_connections','health_metrics','google_connections','calendar_events','automation_rules',
  'mercado_pago_webhook_events','whatsapp_webhook_events','whatsapp_ai_replies','whatsapp_template_sends',
  'platform_plans','platform_subscriptions','platform_activation_codes','activation_code_redemptions','payment_logs','trainer_payment_settings','trainer_plans','student_payments'
];

function tableForEntity(entity) {
  const safe = String(entity || '').trim();
  const allowed = new Set(SUPABASE_SYNC_TABLES);
  return allowed.has(safe) ? safe : '';
}

async function pushToSupabase(item) {
  const table = tableForEntity(item.entity);
  if (!table) throw new Error(`Entidade não permitida para sync: ${item.entity}`);
  const payload = JSON.parse(item.payload_json || '{}');
  if (item.action === 'delete') {
    const targetId = item.entity_id || payload.id;
    if (!targetId) throw new Error('Delete sem entity_id.');
    return supabaseRest(`/rest/v1/${table}?id=eq.${encodeURIComponent(targetId)}`, { method: 'DELETE' });
  }
  return supabaseRest(`/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(payload)
  });
}

export async function mirrorToSupabaseOrQueue({ workspaceId, entity, action = 'upsert', entityId = '', payload = {} }) {
  if (!hasSupabaseAdmin()) {
    const queueId = queueSync({ workspaceId, entity, action, entityId, payload, lastError: 'Supabase não configurado. Item salvo no fallback SQLite.' });
    recordSystemStatus('database', 'fallback', 'Supabase não configurado. SQLite fallback ativo.', { queueId });
    return { mode: 'fallback', queued: true, queueId };
  }

  try {
    const table = tableForEntity(entity);
    if (!table) throw new Error(`Entidade não permitida para Supabase mirror: ${entity}`);
    await supabaseHealthCheck();
    await supabaseRest(`/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });
    recordSystemStatus('database', 'supabase', 'Supabase principal operacional.', { entity, entityId });
    return { mode: 'supabase', queued: false };
  } catch (error) {
    const queueId = queueSync({ workspaceId, entity, action, entityId, payload, lastError: error.message });
    recordSystemStatus('database', 'fallback', 'Falha no Supabase. Item salvo no fallback SQLite e entrou na fila de sincronização.', { error: error.message, queueId });
    return { mode: 'fallback', queued: true, queueId, error: error.message };
  }
}

export async function processSyncQueue(limit = 25) {
  const items = all('SELECT * FROM sync_queue WHERE status IN (?,?) ORDER BY created_at ASC LIMIT ?', [SYNC_STATUS.PENDING, SYNC_STATUS.ERROR, limit]);
  const result = { total: items.length, synced: 0, failed: 0, skipped: 0, errors: [] };

  if (!hasSupabaseAdmin()) {
    recordSystemStatus('database', 'fallback', 'Sync não executado: Supabase não configurado.');
    return { ...result, skipped: items.length, errors: ['Supabase não configurado.'] };
  }

  for (const item of items) {
    try {
      await pushToSupabase(item);
      run('UPDATE sync_queue SET status=?, attempts=attempts+1, last_error=?, synced_at=?, updated_at=? WHERE id=?', [SYNC_STATUS.SYNCED, '', nowISO(), nowISO(), item.id]);
      result.synced += 1;
    } catch (error) {
      run('UPDATE sync_queue SET status=?, attempts=attempts+1, last_error=?, updated_at=? WHERE id=?', [SYNC_STATUS.ERROR, String(error.message || error).slice(0, 1000), nowISO(), item.id]);
      result.failed += 1;
      result.errors.push(`${item.entity}/${item.entity_id}: ${error.message}`);
    }
  }

  recordSystemStatus('database', result.failed ? 'fallback' : 'supabase', `Sync concluído: ${result.synced} enviados, ${result.failed} falharam.`, result);
  return result;
}

export function systemStatusRows() {
  return all('SELECT * FROM system_status ORDER BY checked_at DESC');
}

export function recordStorageFallback({ workspaceId, ownerId = '', bucket = '', objectPath = '', localPath = '', mimeType = '', size = 0, reason = '' }) {
  const fallbackId = id('sf');
  run(
    'INSERT INTO storage_fallback_files (id,workspace_id,owner_id,bucket,object_path,local_path,mime_type,size,status,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [fallbackId, workspaceId, ownerId, bucket, objectPath, localPath, mimeType, Number(size || 0), 'pending', String(reason || '').slice(0, 1000), nowISO(), nowISO()]
  );
  recordSystemStatus('storage', 'fallback', 'Arquivo salvo em storage local temporário aguardando sincronização.', { fallbackId, bucket, objectPath });
  return fallbackId;
}


export async function processStorageFallback(limit = 25) {
  const result = { total: 0, synced: 0, failed: 0, skipped: 0, errors: [] };
  const items = all('SELECT * FROM storage_fallback_files WHERE status IN (?,?) ORDER BY created_at ASC LIMIT ?', ['pending', 'error', limit]);
  result.total = items.length;
  if (!hasSupabaseAdmin()) {
    recordSystemStatus('storage', 'fallback', 'Sync de storage não executado: Supabase não configurado.');
    return { ...result, skipped: items.length, errors: ['Supabase não configurado.'] };
  }
  for (const item of items) {
    try {
      if (!item.bucket || !item.object_path) throw new Error('Item de storage sem bucket/object_path.');
      if (!fs.existsSync(item.local_path)) throw new Error('Arquivo local não encontrado para sincronização.');
      const buffer = fs.readFileSync(item.local_path);
      await uploadPrivateObject(item.bucket, item.object_path, buffer, item.mime_type || 'application/octet-stream');
      run('UPDATE storage_fallback_files SET status=?, synced_at=?, updated_at=?, reason=? WHERE id=?', ['synced', nowISO(), nowISO(), '', item.id]);
      result.synced += 1;
    } catch (error) {
      run('UPDATE storage_fallback_files SET status=?, reason=?, updated_at=? WHERE id=?', ['error', String(error.message || error).slice(0, 1000), nowISO(), item.id]);
      result.failed += 1;
      result.errors.push(`${item.bucket}/${item.object_path}: ${error.message}`);
    }
  }
  recordSystemStatus('storage', result.failed ? 'fallback' : 'supabase', `Storage sync: ${result.synced} enviados, ${result.failed} falharam.`, result);
  return result;
}

export async function processAllSyncQueues(limit = 25) {
  const database = await processSyncQueue(limit);
  const storage = await processStorageFallback(limit);
  return { database, storage };
}

export function startBackgroundSync({ intervalSeconds = Number(process.env.SYNC_INTERVAL_SECONDS || 0), limit = 25 } = {}) {
  if (!intervalSeconds || intervalSeconds < 30) return null;
  const timer = setInterval(() => {
    processAllSyncQueues(limit).catch(error => {
      recordSystemStatus('sync', 'error', `Falha no sync automático: ${error.message}`);
    });
  }, intervalSeconds * 1000);
  return timer;
}
