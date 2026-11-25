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
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.locator('[data-testid=game-directory-input]').setInputFiles(gameDir);
  await expect(page.locator('[data-testid=texture-browser]')).toBeVisible();
}

test('a point entity with a model draws as a wireframe', async ({ page }) => {
  await openWithGame(page);

  // Place a monster_soldier through the drill-down context menu.
  const canvas = page.locator('[data-testid=viewport-area] canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.7, box!.y + box!.height * 0.7, {
    button: 'right',
  });
  await page.locator('[data-testid=menu-add-entity]').click();
  await page.getByRole('menuitem', { name: 'monster →' }).click();
  await page.locator('[data-testid=menu-class-monster_soldier]').click();

  // The model loads asynchronously through the vfs; wait for it to appear
  // in the document as a soldier entity and for rendering to settle.
  await expect
    .poll(async () => {
      const project = await page.evaluate(() =>
        (window as unknown as JooleWindow).joole!.project(),
      );
      return project.includes('monster_soldier');
    })
    .toBe(true);
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  // Give the async model load a beat to finish and re-render.
  await page.waitForTimeout(800);
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());

  await expect(page.locator('[data-testid=viewport-area] canvas')).toHaveScreenshot(
    'md2-wireframe.png',
    { maxDiffPixelRatio: 0.02 },
  );
});
