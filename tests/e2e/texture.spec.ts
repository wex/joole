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
    return {
      x: canvas.left + rect.x + rect.width / 2,
      y: canvas.top + rect.y + rect.height / 2,
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
  await expect(page.locator('[data-testid=viewport-area]').locator('canvas')).toHaveScreenshot(
    'texture-tool-applied.png',
    // The tool overlay (T1.16) is HTML over the canvas and vanishes after
    // 2.5 s, so it is masked out of the baseline.
    { mask: [page.locator('[data-testid=tool-hint]')] },
  );
});

test('the texture tool highlights the picked face (T1.3)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  type Joole = {
    joole: {
      camera(name: string): { center: [number, number, number]; zoom: number };
      viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
      faceHighlight(): number;
      faces(): number;
    };
  };

  // Draw a brush and pick one of its faces with the texture tool.
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const top = await page.evaluate(() => {
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
  await page.mouse.move(top.a.x, top.a.y);
  await page.mouse.down();
  await page.mouse.move(top.b.x, top.b.y, { steps: 4 });
  await page.mouse.up();

  const highlight = () => page.evaluate(() => (window as unknown as Joole).joole.faceHighlight());
  expect(await highlight()).toBe(0);

  await page.keyboard.press('t');
  const center3d = await page.evaluate(() => {
    const joole = (window as unknown as Joole).joole;
    const rect = joole.viewRects()['3d']!;
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: canvas.left + rect.x + rect.width / 2, y: canvas.top + rect.y + rect.height / 2 };
  });
  await page.mouse.click(center3d.x, center3d.y);
  expect(await page.evaluate(() => (window as unknown as Joole).joole.faces())).toBe(1);
  expect(await highlight()).toBe(1);

  // Leaving the texture tool drops the highlight with the face picks.
  await page.keyboard.press('s');
  expect(await highlight()).toBe(0);
});

test('the focus buttons step through the brush and its faces (T1.6)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  // Draw a box and pick it as the texture target.
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const top = await page.evaluate(() => {
    const joole = (
      window as unknown as {
        joole: {
          camera(name: string): { center: [number, number, number]; zoom: number };
          viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
        };
      }
    ).joole;
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
  await page.mouse.move(top.a.x, top.a.y);
  await page.mouse.down();
  await page.mouse.move(top.b.x, top.b.y, { steps: 4 });
  await page.mouse.up();

  await page.keyboard.press('t');
  const row = page.locator('[data-testid=texture-focus]');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Brush (6 faces)');

  // Seven steps forward cycle through faces 1–6 and back to the brush.
  for (const label of [
    'Face 1 of 6',
    'Face 2 of 6',
    'Face 3 of 6',
    'Face 4 of 6',
    'Face 5 of 6',
    'Face 6 of 6',
    'Brush (6 faces)',
  ]) {
    await page.getByRole('button', { name: 'Next face' }).click();
    await expect(row).toContainText(label);
  }
  // Backward from the brush wraps to the last face.
  await page.getByRole('button', { name: 'Previous face' }).click();
  await expect(row).toContainText('Face 6 of 6');
  // The face picks follow: one face picked, highlight active.
  expect(
    await page.evaluate(() =>
      (window as unknown as { joole: { faceHighlight(): number } }).joole.faceHighlight(),
    ),
  ).toBe(1);
});
