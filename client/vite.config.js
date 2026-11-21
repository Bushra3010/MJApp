import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One codebase, three apps. `vite --mode host` / `vite build --mode admin` etc.
// Each build goes to dist/<app> and is deployed as its own Worker with its own address.
const APPS = {
  user: { name: 'Milo Julo', short: 'Milo Julo', desc: 'Video call, audio call and chat with new friends.', port: 5173 },
  host: { name: 'Milo Julo Host', short: 'MJ Host', desc: 'Talk, connect and earn as a Milo Julo host.', port: 5174 },
  admin: { name: 'Milo Julo Admin', short: 'MJ Admin', desc: 'Milo Julo administration.', port: 5175 },
};

export default defineConfig(({ mode }) => {
  const app = APPS[mode] ? mode : 'user';
  const cfg = APPS[app];
  return {
    plugins: [
      react(),
      {
        name: 'mj-app-shell',
        transformIndexHtml: (html) => html
          .replace(/<title>.*<\/title>/, `<title>${cfg.name}</title>`)
          .replace(/(<meta name="description" content=")[^"]*/, `$1${cfg.desc}`),
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify({
            id: `/?app=${app}`, name: cfg.name, short_name: cfg.short, description: cfg.desc,
            start_url: '/', scope: '/', display: 'standalone', background_color: '#1c1c1e', theme_color: '#1c1c1e',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
          }, null, 2) });
        },
        configureServer(server) {
          server.middlewares.use('/manifest.webmanifest', (_req, res) => {
            res.setHeader('content-type', 'application/manifest+json');
            res.end(JSON.stringify({ name: cfg.name, short_name: cfg.short, start_url: '/', display: 'standalone', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] }));
          });
        },
      },
    ],
    define: { 'import.meta.env.VITE_APP': JSON.stringify(app) },
    build: { outDir: `dist/${app}`, emptyOutDir: true },
    server: {
      port: cfg.port,
      host: true,
      // In development the API runs in `wrangler dev` (port 8787); the proxy tells it which app is calling.
      proxy: {
        '/api': { target: 'http://localhost:8787', headers: { 'x-mj-app': app } },
        '/uploads': 'http://localhost:8787',
        '/ws': { target: 'ws://localhost:8787', ws: true, headers: { 'x-mj-app': app } },
      },
    },
  };
});
