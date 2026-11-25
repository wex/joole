import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test } from '@playwright/test';

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    selection(): string[];
  };
}

const fixtureDir = path.dirname(fileURLToPath(new URL('../fixtures/room.map', import.meta.url)));
const roomMap = path.join(fixtureDir, 'room.map');

// Picking converts CSS input coordinates against the renderer's device-pixel
// view rectangles; the suite otherwise runs at devicePixelRatio 1 where the
// two spaces coincide, so a scaling regression would be invisible.
test.use({ deviceScaleFactor: 1.5 });

test('click-selecting a brush works with display scaling', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.locator('[data-testid=map-input]').setInputFiles(roomMap);
  await expect(page.locator('[data-testid=properties-panel]')).toContainText('room.map');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());

  const box = await page.locator('[data-testid=viewport-area]').boundingBox();
  if (!box) {
    throw new Error('viewport is not visible');
  }
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1.5);
  // The centre of the top view, where the fixture map frames a brush.
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.25, { button: 'left' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.selection().length), {
      timeout: 10000,
    })
    .toBe(1);
});
