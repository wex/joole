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

function faceCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const project = JSON.parse(
      (window as unknown as { joole: { project(): string } }).joole.project(),
    ) as {
      document: { nodes: { kind: string; faces?: unknown[] }[] };
    };
    const brush = project.document.nodes.find((node) => node.kind === 'brush')!;
    return brush.faces!.length;
  });
}

test('the vertex tool edits a brush corner through the UI and undo restores it', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const a = await worldScreen(page, [0, 0, 0]);
  const b = await worldScreen(page, [64, 64, 0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  expect(await faceCount(page)).toBe(6);

  // Switch to the vertex tool and drag the corner handle inwards.
  await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: 'Vertex/edge (V)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const corner = await worldScreen(page, [0, 0, 0]);
  const target = await worldScreen(page, [16, 16, 0]);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y);
  await page.mouse.up();

  // BreakPlanes adds triangular faces around the moved corner.
  expect(await faceCount(page)).toBeGreaterThan(6);

  await page.keyboard.press('Control+z');
  expect(await faceCount(page)).toBe(6);
});

test('edges and faces are grabbed by their midpoint and centre dots (T1.8)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const a = await worldScreen(page, [0, 0, 0]);
  const b = await worldScreen(page, [64, 64, 0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  expect(await faceCount(page)).toBe(6);

  // Edge mode: v enters the vertex tool, v again toggles to edge mode. The
  // front-bottom edge runs along X at y = 0, z = 0; its midpoint dot is at
  // (32, 0) in the top view.
  await page.keyboard.press('v');
  await page.keyboard.press('v');
  const mid = await worldScreen(page, [32, 0, 0]);
  const target = await worldScreen(page, [32, 16, 0]);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y);
  await page.mouse.up();
  // Moving the edge's endpoints reshapes the brush — undo restores the box.
  await page.keyboard.press('Control+z');
  expect(await faceCount(page)).toBe(6);

  // Face mode: the bottom face's centre dot is at (32, 32) in the top view.
  // A click exactly there starts a face drag, which moves the whole face.
  await page.keyboard.press('f');
  const centre = await worldScreen(page, [32, 32, 0]);
  const faceTarget = await worldScreen(page, [48, 32, 0]);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(faceTarget.x, faceTarget.y);
  await page.mouse.up();
  // The drag produced an undoable command: one undo returns to the box.
  await page.keyboard.press('Control+z');
  expect(await faceCount(page)).toBe(6);
});

test('a vertex drag shows the snapped size while dragging (T1.11)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const a = await worldScreen(page, [0, 0, 0]);
  const b = await worldScreen(page, [64, 64, 0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();

  await page.keyboard.press('v');
  const corner = await worldScreen(page, [0, 0, 0]);
  const target = await worldScreen(page, [16, 0, 0]);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 4 });
  // Mid-drag, the active view's title bar carries the measurement.
  await expect(page.locator('[data-testid=view-title-top]')).toContainText('×');
  await page.mouse.up();
  // After the drag the measurement is gone and the title shows coordinates.
  await expect(page.locator('[data-testid=view-title-top]')).not.toContainText('×');
});
