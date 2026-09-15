import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true,
    port: 5734,
    // Proxied rather than hitting the backend's own port directly (as VITE_API_BASE_URL used to)
    // so the browser sees frontend and backend as the SAME origin — needed for the session
    // cookie auth uses: a cross-origin cookie over plain HTTP (no TLS in local dev) can't reliably
    // survive a fetch() the way a same-origin one does. Mirrors production, where Caddy already
    // reverse-proxies /api/* under the frontend's own origin for the same reason.
    proxy: {
      '/api': {
        target: 'http://backend:8734',
        changeOrigin: true,
      },
    },
  },
});
