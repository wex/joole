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
          rect.x / ratio +
          (point[0] - camera.center[0]) * (camera.zoom / ratio) +
          rect.width / ratio / 2,
        y:
          canvas.top +
          rect.y / ratio -
          (point[1] - camera.center[1]) * (camera.zoom / ratio) +
          rect.height / ratio / 2,
      };
    },
    { point },
  );
}

function viewCenter(page: Page, view: string) {
  return page.evaluate((viewName) => {
    const joole = (
      window as unknown as {
        joole: {
          viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
        };
      }
    ).joole;
    const rect = joole.viewRects()[viewName]!;
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    return {
      x: canvas.left + (rect.x + rect.width / 2) / ratio,
      y: canvas.top + (rect.y + rect.height / 2) / ratio,
    };
  }, view);
}

interface ProjectNode {
  kind: string;
  faces?: { tex: { name: string; offset: [number, number] } }[];
}

function brushNode(page: Page): Promise<ProjectNode> {
  return page.evaluate(() => {
    const project = JSON.parse(
      (window as unknown as { joole: { project(): string } }).joole.project(),
    ) as { document: { nodes: ProjectNode[] } };
    return project.document.nodes.find((node) => node.kind === 'brush')!;
  });
}

test('applying a texture through the UI changes faces and renders in the views', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  // Draw a 64³ brush in the top view.
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const a = await worldScreen(page, [0, 0, 0]);
  const b = await worldScreen(page, [64, 64, 0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  expect((await brushNode(page)).faces).toHaveLength(6);

  // Apply the test texture to the whole selected brush through the Edit menu.
  await page.evaluate(() => {
    (window as unknown as { joole: { texture(name: string): string } }).joole.texture(
      'e1u1/e2u1test',
    );
  });
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: 'Apply Texture' }).click();
  for (const face of (await brushNode(page)).faces!) {
    expect(face.tex.name).toBe('e1u1/e2u1test');
  }

  // The texture tool picks one face in the 3D view.
  await page.keyboard.press('t');
  await expect(page.getByRole('button', { name: 'Texture (T)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const center3d = await viewCenter(page, '3d');
  await page.mouse.click(center3d.x, center3d.y);
  expect(
    await page.evaluate(() => (window as unknown as { joole: { faces(): number } }).joole.faces()),
  ).toBe(1);

  // Applying now affects only the picked face.
  await page.evaluate(() => {
    (window as unknown as { joole: { texture(name: string): string } }).joole.texture(
      'e1u1/faceonly',
    );
  });
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: 'Apply Texture' }).click();
  const names = (await brushNode(page)).faces!.map((face) => face.tex.name);
  expect(names.filter((name) => name === 'e1u1/faceonly')).toHaveLength(1);
  expect(names.filter((name) => name === 'e1u1/e2u1test')).toHaveLength(5);

  // Arrow keys shift the picked face's texture by the grid step.
  await page.keyboard.press('ArrowRight');
  const shifted = (await brushNode(page)).faces!.find((face) => face.tex.name === 'e1u1/faceonly')!;
  expect(Math.abs(shifted.tex.offset[0])).toBe(8);

  // Undo restores both the shift and the face-only application.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await brushNode(page)).faces!.every((face) => face.tex.name === 'e1u1/e2u1test')).toBe(
    true,
  );

  // The textured checker fallback renders identically regardless of the name,
  // so the screenshot is a regression baseline of the editor after editing.
  await expect(page.locator('[data-testid=viewport-area]').locator('canvas')).toHaveScreenshot('texture-tool-applied.png');
});
