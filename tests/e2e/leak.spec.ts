import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const fixtureDir = path.dirname(fileURLToPath(new URL('../fixtures/room.map', import.meta.url)));
const gameDir = path.join(fixtureDir, 'game-browser');

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    project(): string;
    leakPath(): readonly (readonly number[])[] | null;
    camera(view: string): { kind: string; center?: number[] };
  };
}

async function openLeakingMap(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.locator('[data-testid=game-directory-input]').setInputFiles(gameDir);
  await expect(page.locator('[data-testid=texture-browser]')).toBeVisible();
  await page
    .locator('[data-testid=map-input]')
    .setInputFiles(path.join(fixtureDir, 'maps', 'leaking.map'));
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
}

test('a leaking compile draws the pointfile path and N steps the camera along it', async ({
  page,
}) => {
  test.setTimeout(90000);
  await openLeakingMap(page);

  // Compile: the map leaks, so no download happens and the log reports it.
  await page.locator('[data-testid=compile-button]').click();
  await page.locator('[data-testid=compile-normal]').click();
  await page.locator('#bottom-tab-log').click();
  await expect(page.locator('[data-testid=log-panel]')).toContainText('leaks', {
    timeout: 60000,
  });

  // The leak path is parsed and held by the app.
  const path = await page.evaluate(() => (window as unknown as JooleWindow).joole!.leakPath());
  expect(path).not.toBeNull();
  expect(path!.length).toBeGreaterThan(1);

  // The 3D view shows the magenta leak polyline, verified by its pixel
  // count. The exact screenshot is only a secondary check: the large
  // textured cube's rasterization depends on the machine's GL stack (a
  // GPU-accelerated WSL machine versus CI's software renderer differ by
  // about five percent of pixels), so the ratio is loose and the tool
  // overlay, which is transient, is masked out.
  const canvasPng = await page.locator('[data-testid=viewport-area] canvas').screenshot();
  const { decodePng, countColor } = await import('./png');
  const img = decodePng(canvasPng);
  const magenta = countColor(
    img,
    { x: 0, y: 0, width: img.width, height: img.height },
    (r, g, b) => r > 150 && g < 110 && b > 180,
  );
  expect(magenta).toBeGreaterThan(200);
  await expect(page.locator('[data-testid=viewport-area] canvas')).toHaveScreenshot(
    'leak-path.png',
    { maxDiffPixelRatio: 0.08, mask: [page.locator('[data-testid=tool-hint]')] },
  );

  // N centers the ortho cameras on successive leak points.
  const centerBefore = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.camera('top').center,
  );
  await page.locator('[data-testid=editor-shell]').click();
  await page.keyboard.press('n');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const centerAfter = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.camera('top').center,
  );
  expect(centerAfter).not.toEqual(centerBefore);
  // The camera lands on the first leak point.
  const first = path![0]!;
  expect(Math.abs(centerAfter![0]! - first[0]!)).toBeLessThan(1);
  expect(Math.abs(centerAfter![1]! - first[1]!)).toBeLessThan(1);

  // Pressing N again advances to the second point.
  await page.keyboard.press('n');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const centerSecond = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.camera('top').center,
  );
  const second = path![1]!;
  expect(Math.abs(centerSecond![0]! - second[0]!)).toBeLessThan(1);
});
