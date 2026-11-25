import solidPlugin from '@solidjs/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
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
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export default defineConfig({
  plugins: [
    solidPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['fonts/**/*'],
      workbox: {
        // The whole application precaches: bundle, workers, the wasm
        // compilers in public/wasm/, fonts and the html shell, so the app
        // starts and compiles fully offline.
        globPatterns: ['**/*.{js,mjs,css,html,wasm,woff2,json,webmanifest,png,svg}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        // No runtime caching: the application makes no external requests
        // by design, and everything it needs is precached.
      },
      manifest: {
        name: 'Joole',
        short_name: 'Joole',
        description: 'A browser-based brush-based Quake 2 map editor.',
        theme_color: '#101214',
        background_color: '#101214',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
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
