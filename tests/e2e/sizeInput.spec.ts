import { expect, test, type Page } from '@playwright/test';

type Vec3 = [number, number, number];

/** The CSS-pixel page position of a world point in a 2D view. */
async function viewPoint(page: Page, view: 'top' | 'front', point: Vec3) {
  return page.evaluate(
    ({ view, point }) => {
      const joole = (
        window as unknown as {
          joole: {
            camera(view: string): { center: Vec3; zoom: number };
            viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
          };
        }
      ).joole;
      const camera = joole.camera(view);
      const rect = joole.viewRects()[view]!;
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      // Top: x right, y up. Front: x right, z up.
      const h = point[0] - camera.center[0];
      const v = view === 'top' ? point[1] - camera.center[1] : point[2] - camera.center[2];
      return {
        x: canvas.left + rect.x + rect.width / 2 + h * (camera.zoom / ratio),
        y: canvas.top + rect.y + rect.height / 2 - v * (camera.zoom / ratio),
      };
    },
    { view, point },
  );
}

function brushCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const project = JSON.parse(
      (window as unknown as { joole: { project(): string } }).joole.project(),
    ) as { document: { nodes: { kind: string }[] } };
    return project.document.nodes.filter((node) => node.kind === 'brush').length;
  });
}

test('a typed size creates a brush and resizes the selection (T15.4)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const field = page.getByRole('textbox', { name: 'Brush size, width height depth' });

  // A click in the Top view opens the field there, focused.
  const click = await viewPoint(page, 'top', [32, 16, 0]);
  await page.mouse.click(click.x, click.y);
  await expect(field).toBeFocused();

  // Escape cancels without creating anything.
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  expect(await brushCount(page)).toBe(0);

  // An invalid size keeps the field open with the message.
  await page.mouse.click(click.x, click.y);
  await field.fill('12 x');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Enter three sizes, such as 128 64 32');
  expect(await brushCount(page)).toBe(0);

  // A valid size creates one brush, selected, in one step.
  await field.fill('128, 64 32');
  await page.keyboard.press('Enter');
  await expect(field).toHaveCount(0);
  expect(await brushCount(page)).toBe(1);

  // Select: Enter over the Front view prefills width (x), height (z) and
  // depth (y) of that view.
  await page.keyboard.press('s');
  const front = await page.evaluate(() => {
    const rect = (
      window as unknown as {
        joole: {
          viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
        };
      }
    ).joole.viewRects().front!;
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: canvas.left + rect.x + 12, y: canvas.top + rect.y + rect.height - 12 };
  });
  await page.mouse.move(front.x, front.y);
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('128 32 64');
  await field.fill('64 32 64');
  await page.keyboard.press('Enter');
  await expect(field).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('64 32 64');
  await page.keyboard.press('Escape');

  // One undo restores the size.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('128 32 64');
  await page.keyboard.press('Escape');
  expect(await brushCount(page)).toBe(1);
});
