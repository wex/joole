import { defineConfig, devices } from '@playwright/test';

/** P5.7 production smoke: runs against the live Cloudflare deployment.
    No local web servers are started. Usage: pnpm e2e:production */
export default defineConfig({
  testDir: 'tests/e2e-production',
  use: {
    baseURL: process.env.JOOLE_PRODUCTION_URL ?? 'https://joole.niko-hujanen.workers.dev',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
