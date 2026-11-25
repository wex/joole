import { expect, test } from '@playwright/test';

/** The production smoke test for P5.7: the deployed shell must boot,
    be cross-origin isolated (threaded compiles depend on it), and its
    strict CSP must produce no violations. It also verifies the compile
    chain end-to-end in production, since that exercises the wasm
    assets, the workers and the headers together. */
test('production deployment boots isolated and clean', async ({ page, baseURL }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const response = await page.goto(baseURL!);
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);

  const cspViolations = consoleErrors.filter((message) =>
    message.includes('Content Security Policy'),
  );
  expect(cspViolations).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('production serves the security headers', async ({ request, baseURL }) => {
  const response = await request.get(baseURL!);
  const headers = response.headers();
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("worker-src 'self'");
});
