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
        deviceScaleFactor: Number(process.env.JOOLE_MEASURE_DSF ?? '1'),
        // The harness exists for the reference-hardware GPU measurement, so
        // the real GPU is the default. JOOLE_MEASURE_SOFTWARE_GL=1 forces
        // SwiftShader for comparable development-machine runs, where no GPU
        // is available (WSL2, CI runners). The hardware pass runs headed:
        // the default headless shell does not use the real GPU, so a
        // headless hardware run would silently measure SwiftShader again.
        // Do not cover or minimise the browser window while it runs.
        headless: process.env.JOOLE_MEASURE_SOFTWARE_GL === '1',
        launchOptions:
          process.env.JOOLE_MEASURE_SOFTWARE_GL === '1'
            ? { args: ['--use-angle=swiftshader'] }
            : undefined,
      },
    },
  ],
});
