import solidPlugin from '@solidjs/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
} as const;

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@game': fileURLToPath(new URL('./src/game', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
      '@platform': fileURLToPath(new URL('./src/platform', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  optimizeDeps: {
    entries: ['index.html', 'tests/e2e/harness/*.html'],
  },
  server: {
    headers: crossOriginHeaders,
    watch: {
      ignored: ['**/ext/**'],
    },
  },
  preview: {
    headers: {
      ...crossOriginHeaders,
      'Content-Security-Policy': contentSecurityPolicy,
    },
  },
  worker: {
    format: 'es',
  },
});
