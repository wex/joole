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

test('clicking a texture tile applies it to the selected brush', async ({ page }) => {
  await openWithGame(page);

  // Draw a 64³ brush in the top view; it stays selected.
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const top = await page.evaluate(() => {
    const joole = (
      window as unknown as {
        joole: {
          camera(view: string): { center: [number, number, number]; zoom: number };
          viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
        };
      }
    ).joole;
    const camera = joole.camera('top');
    const rect = joole.viewRects().top!;
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const toScreen = (wx: number, wy: number) => ({
      x: canvas.left + rect.x + (wx - camera.center[0]) * (camera.zoom / ratio) + rect.width / 2,
      y: canvas.top + rect.y - (wy - camera.center[1]) * (camera.zoom / ratio) + rect.height / 2,
    });
    return { a: toScreen(0, 0), b: toScreen(64, 64) };
  });
  await page.mouse.move(top.a.x, top.a.y);
  await page.mouse.down();
  await page.mouse.move(top.b.x, top.b.y, { steps: 5 });
  await page.mouse.up();

  const textureNames = () =>
    page.evaluate(() => {
      const project = JSON.parse(
        (window as unknown as { joole: { project(): string } }).joole.project(),
      ) as { document: { nodes: { kind: string; faces?: { tex: { name: string } }[] }[] } };
      const brush = project.document.nodes.find((node) => node.kind === 'brush')!;
      return brush.faces!.map((face) => face.tex.name);
    });
  expect(await textureNames()).toHaveLength(6);

  // Clicking the tile applies the texture to every face of the brush.
  await page
    .locator('[data-testid=texture-browser]')
    .getByRole('button', { name: /basic1_1/ })
    .click();
  expect((await textureNames()).filter((name) => name === 'e1u1/basic1_1')).toHaveLength(6);

  // One undo restores the original texture on every face.
  await page.keyboard.press('Control+z');
  expect((await textureNames()).filter((name) => name === 'e1u1/basic1_1')).toHaveLength(0);
});
