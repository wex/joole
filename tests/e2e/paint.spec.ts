import { expect, test, type Page } from '@playwright/test';

type Vec3 = [number, number, number];

async function worldScreen(page: Page, point: Vec3) {
  return page.evaluate(
    ({ point }) => {
      const joole = (
        window as unknown as {
          joole: {
            camera(view: string): { center: Vec3; zoom: number };
            viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
          };
        }
      ).joole;
      const camera = joole.camera('top');
      const rect = joole.viewRects().top!;
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      return {
        x:
          canvas.left +
          rect.x +
          (point[0] - camera.center[0]) * (camera.zoom / ratio) +
          rect.width / 2,
        y:
          canvas.top +
          rect.y -
          (point[1] - camera.center[1]) * (camera.zoom / ratio) +
          rect.height / 2,
      };
    },
    { point },
  );
}

interface ProjectBrush {
  kind: string;
  faces?: { points: [Vec3, Vec3, Vec3] }[];
}

function brushBounds(page: Page): Promise<{ min: Vec3; max: Vec3 }> {
  return page.evaluate(() => {
    const project = JSON.parse(
      (window as unknown as { joole: { project(): string } }).joole.project(),
    ) as { document: { nodes: ProjectBrush[] } };
    const brush = project.document.nodes.find((node) => node.kind === 'brush')!;
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const face of brush.faces!) {
      for (const point of face.points) {
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis]!, point[axis]!);
          max[axis] = Math.max(max[axis]!, point[axis]!);
        }
      }
    }
    return { min, max };
  });
}

test('painting a brush snaps every bound to the grid at any grid size', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.getByRole('button', { name: 'Brush (B)' }).click();

  for (const grid of [8, 16, 128]) {
    await page.evaluate((size) => {
      const slider = document.querySelector('[aria-label="Grid size"]') as HTMLInputElement;
      slider.value = String(Math.log2(size));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, grid);
    // Deliberately off-grid pointer positions.
    const a = await worldScreen(page, [5, 3, 0]);
    const b = await worldScreen(page, [101, 69, 0]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });

    // The measure overlay follows the drag with the in-plane extents.
    const overlay = page.locator('[data-testid=measure-overlay]');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('span').first()).toBeVisible();

    await page.mouse.up();

    const { min, max } = await brushBounds(page);
    for (let axis = 0; axis < 3; axis++) {
      expect(
        Math.abs((min[axis]! / grid) % 1),
        `min axis ${axis} at grid ${grid}: ${min[axis]}`,
      ).toBeLessThan(1e-6);
      expect(
        Math.abs((max[axis]! / grid) % 1),
        `max axis ${axis} at grid ${grid}: ${max[axis]}`,
      ).toBeLessThan(1e-6);
    }
    expect(max[2]! - min[2]!).toBeGreaterThanOrEqual(64);

    // The overlay hides when the drag is over.
    await expect(page.locator('[data-testid=measure-overlay]')).toHaveCount(0);

    // Remove the brush again for the next grid size.
    await page.keyboard.press('Control+z');
  }
});
