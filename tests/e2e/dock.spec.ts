import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const gameDir = path.join(
  path.dirname(fileURLToPath(new URL('../fixtures/room.map', import.meta.url))),
  'game-browser',
);

test('the right dock collapses, resizes thumbnails and persists (T1.12)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  // The bottom panel has no Textures tab; the texture placeholder lives in the dock.
  await expect(page.locator('#bottom-tab-textures')).toHaveCount(0);
  await expect(page.locator('[data-testid=dock-textures]')).toBeVisible();
  await expect(page.locator('[data-testid=texture-placeholder]')).toBeVisible();

  // Collapsing Properties leaves only its header; expanding brings it back.
  await page.getByRole('button', { name: 'Collapse Properties' }).click();
  await expect(page.getByRole('button', { name: 'Expand Properties' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand Properties' }).click();
  await expect(page.getByRole('button', { name: 'Collapse Properties' })).toBeVisible();

  // Open the game folder: the browser appears in the dock with 64 px thumbnails.
  await page.locator('[data-testid=game-directory-input]').setInputFiles(gameDir);
  const browser = page.locator('[data-testid=texture-browser]');
  await expect(browser).toBeVisible();
  const firstCanvas = browser.locator('canvas').first();
  await expect.poll(async () => (await firstCanvas.boundingBox())?.width).toBe(64);

  // The slider changes the thumbnail size, and the image scales with it
  // (T15.1): the canvas is 128 px on screen and its pixels are drawn
  // outside the old 64 px square.
  await page.locator('[data-testid=thumb-size-slider]').fill('128');
  await expect.poll(async () => (await firstCanvas.boundingBox())?.width).toBe(128);
  await expect
    .poll(() =>
      firstCanvas.evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext('2d')!;
        const ratio = canvas.width / 128;
        // A pixel near the bottom-right corner, outside the old 64 px area.
        return context.getImageData(Math.floor(120 * ratio), Math.floor(120 * ratio), 1, 1).data[3];
      }),
    )
    .toBeGreaterThan(0);

  // The state survives a reload: thumbnail size and the collapsed state.
  await page.getByRole('button', { name: 'Collapse Properties' }).click();
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        // The save is debounced at 500 ms; wait for it to land in IndexedDB.
        await new Promise((resolve) => setTimeout(resolve, 700));
        return true;
      });
    })
    .toBe(true);
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand Properties' })).toBeVisible();
  await expect(page.locator('[data-testid=thumb-size-slider]')).toHaveValue('128');
});
