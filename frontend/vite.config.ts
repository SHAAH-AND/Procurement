import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Catalyst serves the built client from /app (catalyst.json → client.url_prefix),
// so every asset URL has to be rooted there. Routing is hash-based (see
// main.tsx) because Catalyst web hosting has no SPA fallback: /app/anything
// that is not a real file is a 404.
const BASE = '/app/';

// Local development: the API runs in the cloud. Point the Vite dev server at
// the Development environment so /server and the Catalyst SDK bootstrap
// resolve; sign-in still happens through Zoho Accounts.
const CATALYST_TARGET = process.env.CATALYST_TARGET || 'https://procurement-932021889.development.catalystserverless.com';

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    proxy: {
      '/server': { target: CATALYST_TARGET, changeOrigin: true },
      '/__catalyst': { target: CATALYST_TARGET, changeOrigin: true },
      // The dev server prefixes the absolute init.js src with `base`; the
      // production build leaves it alone (verified in dist/index.html).
      '/app/__catalyst': { target: CATALYST_TARGET, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/app/, '') },
    },
  },
});
