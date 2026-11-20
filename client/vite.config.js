import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs in `wrangler dev` (port 8787).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:8787',
      '/uploads': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
