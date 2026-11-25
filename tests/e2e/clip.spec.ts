import { expect, test, type Page } from '@playwright/test';

type Vec3 = [number, number, number];

async function worldScreen(page: Page, view: 'top' | 'front' | 'side', point: Vec3) {
  return page.evaluate(
    ({ view, point }) => {
      const joole = (
        window as unknown as {
          joole: {
            camera(view: string): { axis: 'xy' | 'xz' | 'yz'; center: Vec3; zoom: number };
            viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
          };
        }
      ).joole;
      const camera = joole.camera(view);
      const rect = joole.viewRects()[view]!;
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const axes: Record<string, [number, number]> = { xy: [0, 1], xz: [0, 2], yz: [1, 2] };
      const [h, v] = axes[camera.axis]!;
      return {
        x:
          canvas.left +
          rect.x / ratio +
          (point[h]! - camera.center[h]!) * (camera.zoom / ratio) +
          rect.width / ratio / 2,
        y:
          canvas.top +
          rect.y / ratio -
          (point[v]! - camera.center[v]!) * (camera.zoom / ratio) +
          rect.height / ratio / 2,
      };
    },
    { view, point },
  );
}

async function dragWorld(page: Page, from: Vec3, to: Vec3): Promise<void> {
  const a = await worldScreen(page, 'top', from);
  const b = await worldScreen(page, 'top', to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

async function clickWorld(page: Page, point: Vec3): Promise<void> {
  const p = await worldScreen(page, 'top', point);
  await page.mouse.click(p.x, p.y);
}

test('the Clip tool clips a selected brush in a 2D view and undo restores it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  await dragWorld(page, [0, 0, 0], [64, 64, 0]);

  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: 'Clip (C)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await clickWorld(page, [32, 0, 0]);
  await clickWorld(page, [32, 64, 0]);
  await page.keyboard.press('Enter');

  const clipped = await page.evaluate(() => {
    const project = JSON.parse(
      (window as unknown as { joole: { project(): string } }).joole.project(),
    ) as {
      document: { nodes: { kind: string; faces?: { points: [number, number, number][] }[] }[] };
    };
    const brush = project.document.nodes.find((node) => node.kind === 'brush')!;
    const xs = brush.faces!.flatMap((face) => face.points.map((point) => point[0]));
    return { minX: Math.min(...xs), maxX: Math.max(...xs) };
  });
  expect(clipped.minX).toBeCloseTo(32, 5);
  expect(clipped.maxX).toBeCloseTo(64, 5);

  await page.keyboard.press('Control+z');
  const restored = await page.evaluate(() => {
    const project = JSON.parse(
      (window as unknown as { joole: { project(): string } }).joole.project(),
    ) as {
      document: { nodes: { kind: string; faces?: { points: [number, number, number][] }[] }[] };
    };
    const brush = project.document.nodes.find((node) => node.kind === 'brush')!;
    const xs = brush.faces!.flatMap((face) => face.points.map((point) => point[0]));
    return Math.min(...xs);
  });
  expect(restored).toBeCloseTo(0, 5);
});
