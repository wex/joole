import { expect, test, type Page } from '@playwright/test';

type Vec3 = [number, number, number];

async function worldScreen(page: Page, point: Vec3) {
  return page.evaluate(
    ({ point }) => {
      const joole = (
        window as unknown as {
          joole: {
            camera(view: string): { axis: 'xy' | 'xz' | 'yz'; center: Vec3; zoom: number };
            viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
          };
        }
      ).joole;
      const camera = joole.camera('top');
      const rect = joole.viewRects()['top']!;
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

test('resizing a brush snaps the dragged corner to the grid (T1.10)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  // Paint a 64³ box at the origin; it stays selected.
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const a = await worldScreen(page, [0, 0, 0]);
  const b = await worldScreen(page, [64, 64, 0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();

  // Grid 8. Drag the (64, 64) resize corner toward (105, 90): the corner
  // snaps to (104, 88).
  await page.keyboard.press('s');
  const corner = await worldScreen(page, [64, 64, 0]);
  const target = await worldScreen(page, [105, 90, 0]);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();

  const bounds = await page.evaluate(() => {
    const project = JSON.parse(
      (window as unknown as { joole: { project(): string } }).joole.project(),
    ) as { document: { nodes: { kind: string; faces?: { points: number[][] }[] }[] } };
    const brush = project.document.nodes.find((node) => node.kind === 'brush')!;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const face of brush.faces!) {
      for (const p of face.points) {
        maxX = Math.max(maxX, p[0]!);
        maxY = Math.max(maxY, p[1]!);
      }
    }
    return { maxX, maxY };
  });
  expect(bounds.maxX % 8).toBe(0);
  expect(bounds.maxY % 8).toBe(0);
  expect(bounds.maxX).toBe(104);
  expect(bounds.maxY).toBe(88);
});
