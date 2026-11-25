import { defineConfig, devices } from '@playwright/test';

/** P5.6 measurement harness. The numbers are recorded in the spec's
    performance table. Run manually — especially on the reference hardware —
    with `pnpm measure`; timings are meaningless in a parallel CI run. */
export default defineConfig({
  testDir: 'tests/measure',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      name: 'preview',
      command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--use-angle=swiftshader'] },
      },
    },
  ],
});
