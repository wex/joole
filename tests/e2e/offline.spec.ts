import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const fixtureDir = path.dirname(fileURLToPath(new URL('../fixtures/room.map', import.meta.url)));
const gameDir = path.join(fixtureDir, 'game-browser');

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
  };
}

async function openGameAndMap(page: Page): Promise<void> {
  await page.locator('[data-testid=game-directory-input]').setInputFiles(gameDir);
  await expect(page.locator('[data-testid=texture-browser]')).toBeVisible();
  await page
    .locator('[data-testid=map-input]')
    .setInputFiles(path.join(fixtureDir, 'maps', 'sp-sample.map'));
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
}

test('the app starts and compiles fully offline', async ({ page, context }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  // The base URL is the production preview, where the service worker registers.
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  // Wait for the service worker to finish precaching and take control.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // The first load is uncontrolled; the reload is served by the worker.
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.evaluate(async () => {
    // Wait until the page is actually controlled by the worker.
    for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await openGameAndMap(page);

  // Go offline and reload: the whole app must come back from the precache.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible({
    timeout: 30000,
  });

  // The game data and map are local files, so reopening them works offline.
  await openGameAndMap(page);

  // Compile offline through all three tools.
  await page.locator('[data-testid=compile-button]').click();
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('[data-testid=compile-start]').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.bsp$/);
  const filePath = await file.path();
  const { statSync } = await import('node:fs');
  expect(statSync(filePath!).size).toBeGreaterThan(5000);
  await context.setOffline(false);
});
