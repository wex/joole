import { expect, test, type Page } from '@playwright/test';

// The harness exists only on the dev server: it is not part of the build.
const harness = 'http://127.0.0.1:5173/tests/e2e/harness/render.html';

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${harness}?${query}`);
  await page.locator('html[data-render-ready="true"]').waitFor();
  return errors;
}

// Screenshot baselines of every view and mode (SwiftShader). The baselines
// are updated only for an intentional visual change.
const cases = [
  ['views-textured', 'mode=textured'],
  ['views-flat', 'mode=flat'],
  ['views-wireframe', 'mode=wireframe'],
  ['3d-textured', 'mode=textured&max=3d'],
  ['3d-flat', 'mode=flat&max=3d'],
  ['3d-wireframe', 'mode=wireframe&max=3d'],
  ['top', 'max=top'],
  ['front', 'max=front'],
  ['side', 'max=side'],
  ['selection', 'mode=flat&select=g_ramp'],
  ['views-light-theme', 'mode=flat&theme=light'],
  ['3d-tool-faces-hidden', 'mode=flat&max=3d&toolfaces=hide'],
] as const;

test.describe('renderer screenshots', () => {
  for (const [name, query] of cases) {
    test(name, async ({ page }) => {
      const errors = await open(page, query);
      await expect(page.locator('#views')).toHaveScreenshot(`${name}.png`);
      expect(errors).toEqual([]);
    });
  }
});

test('a texture arrives in the renderer through the texture worker', async ({ page }) => {
  await open(page, 'mode=textured&max=3d');
  const stats = await page.evaluate(() => window.jooleRender!.stats());
  expect(stats.pendingTextures).toBe(0);
  expect(stats.textures).toEqual([{ name: 'e2u1/mine10_1', width: 64, height: 64 }]);
  // 11 brushes and 2 point entities.
  expect(stats.nodes).toBe(13);
});

test('draws only on demand: no frames without a change', async ({ page }) => {
  await open(page, 'mode=textured');
  const before = await page.evaluate(() => window.jooleRender!.stats().frames);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.jooleRender!.stats().frames)).toBe(before);
  await page.evaluate(() => window.jooleRender!.invalidate());
  await expect.poll(() => page.evaluate(() => window.jooleRender!.stats().frames)).toBe(before + 1);
});

test('a patch updates only its brushes, and its inverse restores the same pixels', async ({
  page,
}) => {
  const errors = await open(page, 'max=top');
  const canvas = page.locator('#views');
  await page.evaluate(() => window.jooleRender!.removeFirstBrush('g_ramp'));
  expect((await page.evaluate(() => window.jooleRender!.stats())).nodes).toBe(12);
  await expect(canvas).toHaveScreenshot('top-ramp-removed.png');
  await page.evaluate(() => window.jooleRender!.undo());
  expect((await page.evaluate(() => window.jooleRender!.stats())).nodes).toBe(13);
  // The very same baseline as the untouched view.
  await expect(canvas).toHaveScreenshot('top.png');
  expect(errors).toEqual([]);
});

test('the canvas follows its element size and redraws once', async ({ page }) => {
  await open(page, 'mode=flat');
  await page.setViewportSize({ width: 800, height: 600 });
  // The backing store is element size times the device pixel ratio, which
  // differs across engines (WebKit headless reports 2, Chromium 1).
  await expect
    .poll(() =>
      page.evaluate(() => [
        document.querySelector('canvas')!.width,
        document.querySelector('canvas')!.height,
      ]),
    )
    .toEqual([
      800 * (await page.evaluate(() => devicePixelRatio)),
      600 * (await page.evaluate(() => devicePixelRatio)),
    ]);
  await page.evaluate(() => window.jooleRender!.whenIdle());
  const frames = await page.evaluate(() => window.jooleRender!.stats().frames);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.jooleRender!.stats().frames)).toBe(frames);
});
