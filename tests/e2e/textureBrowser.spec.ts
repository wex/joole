import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const gameDir = path.join(
  path.dirname(fileURLToPath(new URL('../fixtures/room.map', import.meta.url))),
  'game-browser',
);

async function openWithGame(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.locator('[data-testid=game-directory-input]').setInputFiles(gameDir);
  await expect(page.locator('[data-testid=texture-browser]')).toBeVisible();
}

test('the texture browser lists, searches, filters and selects textures', async ({ page }) => {
  await openWithGame(page);
  const browser = page.locator('[data-testid=texture-browser]');

  // All six fixture textures appear (the grid is virtualised; six fit at once).
  await expect(browser.locator('.texture-browser-cell, button')).toHaveCount(6, { timeout: 5000 });

  // Search narrows by substring.
  await page.getByRole('searchbox', { name: 'Search textures' }).fill('mine');
  await expect(browser.getByRole('button')).toHaveCount(3);
  await page.getByRole('searchbox', { name: 'Search textures' }).fill('');
  await expect(browser.getByRole('button')).toHaveCount(6);

  // The folder filter keeps only one folder's textures.
  await page.getByRole('combobox', { name: 'Texture folder' }).selectOption('e1u1');
  await expect(browser.getByRole('button')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Texture folder' }).selectOption('');
  await expect(browser.getByRole('button')).toHaveCount(6);

  // Clicking a texture selects it: footer shows the full path and source.
  await browser.getByRole('button', { name: /basic1_1/ }).click();
  await expect(page.locator('[data-testid=texture-browser-footer]')).toContainText('e1u1/basic1_1');
  await expect(page.locator('[data-testid=texture-browser-footer]')).toContainText('baseq2');
  expect(
    await page.evaluate(() =>
      (window as never as { joole: { texture(): string } }).joole.texture(),
    ),
  ).toBe('e1u1/basic1_1');

  // In use: nothing is in the document yet, so the list empties; after
  // unchecking, everything is back.
  await page.getByRole('checkbox', { name: 'In use' }).check();
  await expect(browser.getByRole('button')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'In use' }).uncheck();
  await expect(browser.getByRole('button')).toHaveCount(6);

  // Thumbnails convert lazily through the real worker pipeline.
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const canvas = document.querySelector(
          '[data-testid=texture-browser] canvas',
        ) as HTMLCanvasElement | null;
        if (!canvas) return false;
        const context = canvas.getContext('2d')!;
        const data = context.getImageData(0, 0, 64, 64).data;
        // The checker fallback is grey; the converted mine texture is not.
        return Array.from(data.slice(0, 400)).some((v) => v > 100 && v < 240);
      });
    })
    .toBe(true);
});
