import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev-only: forward Catalyst API/SDK calls to the cloud backend,
// so the app works with Catalyst auth and data during local dev.
const CATALYST_TARGET = 'https://procurement-932021889.development.catalystserverless.com';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/server': { target: CATALYST_TARGET, changeOrigin: true },
      '/__catalyst': { target: CATALYST_TARGET, changeOrigin: true },
    },
  },
});
