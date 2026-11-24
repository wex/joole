import { defineConfig, devices } from '@playwright/test';

const chromiumArgs = ['--use-angle=swiftshader'];
const disabledUntilP55 = /a^/;

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      name: 'dev',
      command: 'pnpm dev --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
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
        launchOptions: {
          args: chromiumArgs,
        },
      },
    },
    // Firefox and WebKit are defined here but disabled until P5.5.
    {
      name: 'firefox',
      grep: disabledUntilP55,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      grep: disabledUntilP55,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
