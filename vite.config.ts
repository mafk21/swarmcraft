import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The preview runs behind a proxy host; allow any origin so the app and
    // its HMR websocket work under https://<port>-<sandbox>.e2b.app
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
  },
  build: { target: 'es2022' },
});
