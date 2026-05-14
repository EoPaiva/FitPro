const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

export function supabaseAvatarBucket() {
  return process.env.SUPABASE_AVATAR_BUCKET || process.env.SUPABASE_STORAGE_BUCKET_AVATARS || 'avatars';
}

export function publicObjectUrl(bucket, objectPath) {
  if (!SUPABASE_URL || !bucket || !objectPath) return '';
  const safePath = String(objectPath).split('/').map(part => encodeURIComponent(part)).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucket)}/${safePath}`;
}

export function parseSupabaseStoragePath(storagePath = '') {
  const raw = String(storagePath || '');
  if (!raw.startsWith('supabase://')) return null;
  const rest = raw.slice('supabase://'.length);
  const [bucket, ...parts] = rest.split('/');
  const objectPath = parts.join('/');
  if (!bucket || !objectPath) return null;
  return { bucket, objectPath };
}

export function hasSupabaseAdmin() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

export function supabasePublicStatus() {
  return {
    configured: Boolean(SUPABASE_URL),
    adminConfigured: hasSupabaseAdmin(),
    publishableConfigured: Boolean(PUBLISHABLE_KEY),
    url: SUPABASE_URL ? `${SUPABASE_URL.replace(/https?:\/\//, '').slice(0, 22)}...` : ''
  };
}

function adminHeaders(extra = {}) {
  if (!hasSupabaseAdmin()) {
    throw new Error('Supabase não configurado no backend. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...extra
  };
}

export async function supabaseRest(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${SUPABASE_URL}${normalizedPath}`, {
    ...options,
    headers: adminHeaders(options.headers || {})
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase retornou ${response.status}: ${text || response.statusText}`);
  }

  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.arrayBuffer();
}

export async function supabaseHealthCheck() {
  if (!hasSupabaseAdmin()) return { ok: false, configured: false, error: 'Supabase admin não configurado.' };
  try {
    await supabaseRest('/rest/v1/workspaces?select=id&limit=1', { method: 'GET' });
    return { ok: true, configured: true };
  } catch (error) {
    return { ok: false, configured: true, error: error.message };
  }
}

export async function supabaseSelect(table, query = 'select=*') {
  return supabaseRest(`/rest/v1/${table}?${query}`, { method: 'GET' });
}

export async function supabaseUpsert(table, payload) {
  return supabaseRest(`/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(payload)
  });
}

export async function uploadPrivateObject(bucket, objectPath, buffer, contentType = 'application/octet-stream') {
  return supabaseRest(`/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body: buffer
  });
}

export async function createSignedUrl(bucket, objectPath, expiresIn = 300) {
  return supabaseRest(`/storage/v1/object/sign/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn })
  });
}

export async function bucketStatus(bucket) {
  if (!bucket) return { configured: false, ok: false };
  if (!hasSupabaseAdmin()) return { configured: true, ok: false, error: 'Supabase admin não configurado.' };
  try {
    await supabaseRest(`/storage/v1/bucket/${bucket}`, { method: 'GET' });
    return { configured: true, ok: true };
  } catch (error) {
    return { configured: true, ok: false, error: error.message };
  }
}
