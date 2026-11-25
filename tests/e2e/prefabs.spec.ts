import { expect, test, type Page } from '@playwright/test';

type Vec3 = [number, number, number];

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    project(): string;
    camera(view: string): unknown;
    viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
  };
}

async function openEmptyEditor(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
}

async function worldScreen(page: Page, view: string, point: Vec3) {
  return page.evaluate(
    ({ view, point }) => {
      const joole = (window as unknown as JooleWindow).joole!;
      const camera = joole.camera(view) as { axis: string; center: Vec3; zoom: number };
      const rect = joole.viewRects()[view]!;
      const canvas = document
        .querySelector('[data-testid=viewport-area] canvas')!
        .getBoundingClientRect();
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

async function drawBrush(page: Page, from: Vec3, to: Vec3): Promise<void> {
  const a = await worldScreen(page, 'front', from);
  const b = await worldScreen(page, 'front', to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
}

function brushCount(project: string): number {
  const doc = JSON.parse(project) as { document: { nodes: { kind: string }[] } };
  return doc.document.nodes.filter((n) => n.kind === 'brush').length;
}

test('saves a prefab and places it again', async ({ page }) => {
  await openEmptyEditor(page);

  // Draw a brush and keep it selected.
  await page.keyboard.press('b');
  await drawBrush(page, [-64, 0, 0], [0, 0, 64]);

  const before = brushCount(
    await page.evaluate(() => (window as unknown as JooleWindow).joole!.project()),
  );
  expect(before).toBe(1);

  // Save it as a prefab through the browser tab.
  await page.locator('#bottom-tab-prefabs').click();
  await expect(page.locator('[data-testid=prefab-browser]')).toBeVisible();
  await page.locator('[data-testid=prefab-name]').fill('pillar');
  await page.locator('[data-testid=prefab-save]').click();
  await expect(page.locator('[data-testid=prefab-pillar]')).toBeVisible();

  // Insert it through the browser's insert button.
  await page.locator('[data-testid=prefab-insert-pillar]').click();
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const after = brushCount(
    await page.evaluate(() => (window as unknown as JooleWindow).joole!.project()),
  );
  expect(after).toBe(2);

  // Undo removes the placed prefab in one step.
  await page.keyboard.press('Control+z');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const undone = brushCount(
    await page.evaluate(() => (window as unknown as JooleWindow).joole!.project()),
  );
  expect(undone).toBe(1);

  // The prefab survives in OPFS across a reload.
  await page.reload();
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.locator('#bottom-tab-prefabs').click();
  await expect(page.locator('[data-testid=prefab-pillar]')).toBeVisible();
});
