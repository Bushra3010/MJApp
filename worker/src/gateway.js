// Front door for each app. Every app (friends, host, admin) is its own Worker with its own address and static build;
// all of them forward API, WebSocket and upload traffic to the one shared Hub Durable Object.
const APPS = ['user', 'host', 'admin'];
const hub = (env) => env.HUB.get(env.HUB.idFromName('global'));

/** Re-issue the request with the app name stamped by the server, never taken from the browser. */
function forApp(req, env) {
  const asked = req.headers.get('x-mj-app');
  const app = env.TRUST_APP_HEADER === 'true' && APPS.includes(asked) ? asked : (env.APP || 'user'); // trust only in local dev
  const headers = new Headers(req.headers);
  headers.set('x-mj-app', app);
  return new Request(req, { headers });
}

export default {
  async fetch(req, env, ctx) {
    const p = new URL(req.url).pathname;

    if (p === '/.well-known/assetlinks.json') {
      const fp = env.ANDROID_SHA256_FINGERPRINT;
      if (!fp) return new Response('Not found', { status: 404 });
      return Response.json([{ relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: env.ANDROID_PACKAGE || 'app.milojulo.twa', sha256_cert_fingerprints: fp.split(',') } }]);
    }

    if (p.startsWith('/uploads/')) {
      // immutable random names → cache at the edge so photos rarely reach the Durable Object
      const cache = caches.default;
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await hub(env).fetch(req);
      if (res.ok) ctx.waitUntil(cache.put(req, res.clone()));
      return res;
    }

    if (p === '/ws' || p.startsWith('/api/')) return hub(env).fetch(forApp(req, env));

    return env.ASSETS.fetch(req);
  },
};
