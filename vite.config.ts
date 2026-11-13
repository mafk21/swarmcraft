import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

/**
 * Which commit is this build? Stamped in so the page can name it.
 *
 * Four rounds of debugging were wasted on code the user's checkout did not
 * contain. The app could not say what it was, so nobody could tell. Now it can.
 */
function buildStamp(): string {
  try {
    const commit = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return dirty ? `${commit}+dirty` : commit;
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
  },
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
