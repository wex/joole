import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const gameDir = path.join(
  path.dirname(fileURLToPath(new URL('../fixtures/room.map', import.meta.url))),
  'game-browser',
);

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    project(): string;
  };
}

async function openWithGame(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.locator('[data-testid=game-directory-input]').setInputFiles(gameDir);
  await expect(page.locator('[data-testid=texture-browser]')).toBeVisible();
}

test('compiles the map in the browser through all three tools', async ({ page }) => {
  test.setTimeout(90000);
  await openWithGame(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Open the sealed gate sample: two rooms, a door, a button, a monster.
  const sample = path.join(
    path.dirname(fileURLToPath(new URL('../fixtures/room.map', import.meta.url))),
    'maps',
    'sp-sample.map',
  );
  await page.locator('[data-testid=map-input]').setInputFiles(sample);
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());

  // Compile with the fast profile through the toolbar menu.
  await page.locator('[data-testid=compile-button]').click();
  await expect(page.locator('[data-testid=compile-normal]')).toBeVisible();
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('[data-testid=compile-normal]').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.bsp$/);
  const filePath = await file.path();
  const { statSync } = await import('node:fs');
  expect(statSync(filePath!).size).toBeGreaterThan(5000);

  // The log streamed the tools' banners; open the log tab to read them.
  await page.locator('#bottom-tab-log').click();
  await expect(page.locator('[data-testid=log-panel]')).toContainText('qbsp3', {
    timeout: 15000,
  });
  await expect(page.locator('[data-testid=log-panel]')).toContainText('---- vis ----');
  await expect(page.locator('[data-testid=log-panel]')).toContainText('Radiosity');
  expect(errors).toEqual([]);
});
