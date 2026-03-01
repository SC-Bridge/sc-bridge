import { Hono } from './node_modules/hono/dist/esm/index.js';
import { cors } from './node_modules/hono/dist/esm/middleware/cors/index.js';

const app = new Hono();

// Simulate src/index.ts CORS middleware exactly
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin') || '';
  const host = c.req.header('Host') || 'scbridge.app';
  if (!origin) return cors({ origin: `https://${host}` })(c, next);
  try {
    const originHost = new URL(origin).hostname;
    const isSameOrigin = originHost === host || originHost === host.split(':')[0];
    if (isSameOrigin) return cors({ origin, credentials: true })(c, next);
  } catch {}
  return next();
});

app.on(['POST','GET'], '/api/auth/**', (c) => {
  console.log('[auth-route] FIRED');
  return c.json({ matched: 'auth-route' });
});
app.all('/api/*', (c) => c.json({ matched: 'fallthrough' }, 404));
app.get('*', (c) => c.json({ matched: 'spa' }));

async function test(method, path, headers = {}) {
  const req = new Request('http://scbridge.app' + path, { method, headers });
  const res = await app.fetch(req, { hostname: 'scbridge.app' });
  const body = await res.json();
  console.log(method, path, JSON.stringify(headers), '->', res.status, JSON.stringify(body));
}

await test('GET', '/api/auth/get-session');
await test('GET', '/api/auth/get-session', { Origin: 'https://scbridge.app' });
await test('POST', '/api/auth/sign-in/email');
await test('POST', '/api/auth/sign-in/email', { Origin: 'https://scbridge.app' });
