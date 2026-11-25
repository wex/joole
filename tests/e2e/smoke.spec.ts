import { expect, test } from '@playwright/test';

const servers = [
  { name: 'dev', url: 'http://127.0.0.1:5173' },
  { name: 'preview', url: 'http://127.0.0.1:4173' },
] as const;

for (const server of servers) {
  test(`cross-origin isolation smoke test (${server.name})`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(server.url);
    await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);

    if (server.name === 'preview') {
      const cspViolations = consoleErrors.filter((message) =>
        message.includes('Content Security Policy'),
      );
      expect(cspViolations).toEqual([]);
    }
  });
}
