const API_URL = (process.env.VITE_API_URL || process.env.API_URL || 'https://fitpro-production-847a.up.railway.app').replace(/\/$/, '');
const ORIGIN = process.env.APP_URL || 'https://fit-pro-xp7c.vercel.app';

async function assert(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

await assert('Health check /health', async () => {
  const res = await fetch(`${API_URL}/health`, { headers: { Origin: ORIGIN } });
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error('Resposta não contém ok=true.');
});

await assert('Health check /api/health', async () => {
  const res = await fetch(`${API_URL}/api/health`, { headers: { Origin: ORIGIN } });
  if (!res.ok) throw new Error(`Status ${res.status}`);
});

await assert('CORS preflight do login', async () => {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization'
    }
  });
  if (res.status !== 204) throw new Error(`Status ${res.status}, esperado 204.`);
  const allowOrigin = res.headers.get('access-control-allow-origin');
  if (allowOrigin !== ORIGIN) throw new Error(`Access-Control-Allow-Origin inválido: ${allowOrigin}`);
});

await assert('Login demo personal', async () => {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'leandro@fitpro.dev', password: 'Leandro123' })
  });
  if (!res.ok) throw new Error(`Status ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.token || !data.user) throw new Error('Login não retornou token/user.');
});

if (!process.exitCode) {
  console.log(`\nFitPro production smoke test passou em ${API_URL}`);
}
