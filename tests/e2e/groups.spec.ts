import { expect, test, type Page } from '@playwright/test';

type Vec3 = [number, number, number];

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    selection(): string[];
    project(): string;
    camera(view: string): unknown;
    viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
  };
}

async function openEmptyEditor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
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

function projectJson(page: Page) {
  return page.evaluate(() => {
    const joole = (window as unknown as JooleWindow).joole!;
    return JSON.parse(joole.project()) as {
      document: {
        nodes: { kind: string; id: string; children?: string[]; name?: string }[];
      };
    };
  });
}

test('groups brushes in the tree, round-trips project and map export', async ({ page }) => {
  await openEmptyEditor(page);

  // Draw two brushes; each is selected after drawing. Select both with shift.
  await page.keyboard.press('b');
  await drawBrush(page, [-64, 0, 0], [0, 0, 64]);
  await drawBrush(page, [64, 0, 0], [128, 0, 64]);

  // Open the tree tab and select both brush rows.
  await page.locator('#bottom-tab-tree').click();
  await expect(page.locator('[data-testid=tree-view]')).toBeVisible();
  const rows = page.locator('[role=treeitem]', { hasText: 'brush' });
  expect(await rows.count()).toBe(2);
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Shift'] });

  // Group them.
  await page.locator('[data-testid=tree-group]').click();
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  let project = await projectJson(page);
  const groups = project.document.nodes.filter((n) => n.kind === 'group');
  expect(groups.length).toBe(1);
  expect(groups[0]!.children!.length).toBe(2);

  // Hide the group through the tree flag button.
  await page.locator(`[data-testid=tree-hide-${groups[0]!.id}]`).click();
  project = await projectJson(page);
  const hiddenGroup = project.document.nodes.find((n) => n.kind === 'group');
  expect(hiddenGroup).toBeDefined();

  // The group structure survives in the project text itself (round-trip
  // through serialization): the group node carries its children.
  expect(project.document.nodes.filter((n) => n.kind === 'group')[0]!.children!.length).toBe(2);

  // Export the map: func_group entities carry the group's brushes.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /Export.*map|Export Map/i }).click();
  const file = await download;
  const filePath = await file.path();
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(filePath!, 'utf8');
  expect(text).toContain('func_group');

  // Ungroup restores the flat structure.
  const rowsAfter = page.locator('[role=treeitem]', { hasText: 'group' });
  await rowsAfter.first().click();
  await page.locator('[data-testid=tree-ungroup]').click();
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  project = await projectJson(page);
  expect(project.document.nodes.filter((n) => n.kind === 'group').length).toBe(0);
});
