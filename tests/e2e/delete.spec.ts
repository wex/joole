import { expect, test, type Page } from '@playwright/test';

type Joole = {
  joole: {
    camera(name: string): { center: [number, number, number]; zoom: number };
    viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
    project(): string;
  };
};

// Paints a box at the origin with the brush tool and returns nothing.
async function paintBox(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const pts = await page.evaluate(() => {
    const joole = (window as unknown as Joole).joole;
    const camera = joole.camera('top');
    const rect = joole.viewRects()['top']!;
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const toScreen = (wx: number, wy: number) => ({
      x: canvas.left + rect.x + (wx - camera.center[0]) * (camera.zoom / ratio) + rect.width / 2,
      y: canvas.top + rect.y - (wy - camera.center[1]) * (camera.zoom / ratio) + rect.height / 2,
    });
    return { a: toScreen(0, 0), b: toScreen(64, 64) };
  });
  await page.mouse.move(pts.a.x, pts.a.y);
  await page.mouse.down();
  await page.mouse.move(pts.b.x, pts.b.y, { steps: 4 });
  await page.mouse.up();
}

test('Delete removes the selection immediately and undo restores it (T1.9)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await paintBox(page);
  // The painted brush is the selection. No dialog appears: the click count of
  // any modal overlay stays zero throughout.
  const hasBrush = () =>
    page.evaluate(() => (window as unknown as Joole).joole.project().includes('e2u1/mine10_1'));
  expect(await hasBrush()).toBe(true);
  await page.keyboard.press('Delete');
  expect(await hasBrush()).toBe(false);
  await page.keyboard.press('Control+z');
  expect(await hasBrush()).toBe(true);
  // Backspace deletes as well.
  await page.keyboard.press('Backspace');
  expect(await hasBrush()).toBe(false);
});
