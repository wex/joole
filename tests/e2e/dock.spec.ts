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
  await expect(firstCanvas).toHaveAttribute('width', '64');

  // The slider changes the thumbnail size.
  await page.locator('[data-testid=thumb-size-slider]').fill('128');
  await expect(firstCanvas).toHaveAttribute('width', '128');

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
