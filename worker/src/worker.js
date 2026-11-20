// Worker entry: the React app is served from static assets; API, WebSocket and uploads go to the single Hub Durable Object.
export { Hub } from './hub.js';

const hub = (env) => env.HUB.get(env.HUB.idFromName('global'));

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === '/.well-known/assetlinks.json') {
      if (!env.ANDROID_SHA256_FINGERPRINT) return new Response('Not found', { status: 404 });
      return Response.json([{ relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: env.ANDROID_PACKAGE || 'app.milojulo.twa', sha256_cert_fingerprints: env.ANDROID_SHA256_FINGERPRINT.split(',') } }]);
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

    if (p === '/ws' || p.startsWith('/api/')) return hub(env).fetch(req);

    return env.ASSETS.fetch(req);
  },
};
