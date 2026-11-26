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

test('the bottom panel starts collapsed and expands on tab click (T15.9)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  // Fresh profile: only the tab strip is visible — no tree content, no splitter.
  await expect(page.locator('[data-testid=tree-view]')).toHaveCount(0);
  await expect(page.getByRole('separator', { name: 'Resize bottom panel' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Tree' })).toBeVisible();

  // Clicking the Tree tab expands the panel on that tab.
  await page.getByRole('tab', { name: 'Tree' }).click();
  await expect(page.locator('[data-testid=tree-view]')).toBeVisible();

  // The disclosure button collapses it again.
  await page.getByRole('button', { name: 'Collapse bottom panel' }).click();
  await expect(page.locator('[data-testid=tree-view]')).toHaveCount(0);

  // The state survives a reload. Settings writes are debounced, so the test
  // waits out the timer before reloading.
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await expect(page.locator('[data-testid=tree-view]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand bottom panel' }).click();
  await expect(page.locator('[data-testid=tree-view]')).toBeVisible();
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await expect(page.locator('[data-testid=tree-view]')).toBeVisible();
});

test('new errors are marked on the collapsed Log tab (T15.9)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  // Expand the panel onto the Log tab so existing entries are "seen".
  await page.getByRole('button', { name: 'Expand bottom panel' }).click();
  await page.getByRole('tab', { name: 'Log' }).click();
  await expect(page.locator('[data-testid=log-panel]')).toBeVisible();
  // Collapse again, then trigger errors: two invalid typed sizes.
  await page.getByRole('button', { name: 'Collapse bottom panel' }).click();
  const before = await page.locator('[data-testid=log-panel]').count();
  expect(before).toBe(0);

  // Provoke an error entry: deleting with nothing selected logs a warning or
  // info, so instead submit an invalid compile-less action. The reliable
  // error source in a fresh profile: paste invalid .map text.
  await page.evaluate(() => navigator.clipboard?.writeText?.('not a map').catch(() => {}));
  // Use the app's own error path: an empty CSG subtract logs info, not error.
  // Instead the compile profile without game data is disabled, so trigger the
  // map parse error through the file input with a broken file.
  await page.locator('[data-testid=map-input]').setInputFiles({
    name: 'broken.map',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is not a map file'),
  });
  // The Log tab shows the error marker with a count.
  const logTab = page.getByRole('tab', { name: /Log/ });
  await expect(logTab).toContainText('1', { timeout: 5000 });
  // Opening the tab clears the marker.
  await logTab.click();
  await expect(page.locator('[data-testid=log-panel]')).toBeVisible();
  const text = await logTab.textContent();
  expect(text).not.toMatch(/\d/);
});
