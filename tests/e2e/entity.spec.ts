import { expect, test, type Page } from '@playwright/test';

type Vec3 = [number, number, number];

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    stats(): { nodes: number };
    selection(): string[];
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
      const camera = joole.camera(view) as {
        axis: 'xy' | 'xz' | 'yz';
        center: Vec3;
        zoom: number;
      };
      const rect = joole.viewRects()[view]!;
      const canvas = document
        .querySelector('[data-testid=viewport-area] canvas')!
        .getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const axes: Record<string, [number, number]> = { xy: [0, 1], xz: [0, 2], yz: [1, 2] };
      const [hAxis, vAxis] = axes[camera.axis]!;
      return {
        x:
          canvas.left +
          rect.x +
          (point[hAxis!]! - camera.center[hAxis!]!) * (camera.zoom / ratio) +
          rect.width / 2,
        y:
          canvas.top +
          rect.y -
          (point[vAxis!]! - camera.center[vAxis!]!) * (camera.zoom / ratio) +
          rect.height / 2,
      };
    },
    { view, point },
  );
}

test('places entities through the context menu and the tool, converts brushes', async ({
  page,
}) => {
  await openEmptyEditor(page);

  // Place a monster_soldier through the drill-down context menu.
  const spot = await worldScreen(page, 'front', [0, 0, 32]);
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await page.locator('[data-testid=menu-add-entity]').click();
  await page.getByRole('menuitem', { name: 'monster →' }).click();
  await page.locator('[data-testid=menu-class-monster_soldier]').click();
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const stats = () => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes);
  expect(await stats()).toBe(1); // the soldier (stats does not count worldspawn)

  // The tool mode is now entity with monster_soldier chosen; pressing E keeps
  // it and clicking places another one.
  await page.keyboard.press('e');
  const spot2 = await worldScreen(page, 'front', [64, 0, 32]);
  await page.mouse.click(spot2.x, spot2.y);
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  expect(await stats()).toBe(2);

  // Draw a brush and convert it into a func_door through Apply Entity.
  await page.keyboard.press('b');
  const a = await worldScreen(page, 'front', [-64, 0, 0]);
  const b = await worldScreen(page, 'front', [-32, 0, 64]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  expect(await stats()).toBe(3);

  // The new brush is selected; right-click it for the context menu.
  const mid = await worldScreen(page, 'front', [-48, 0, 32]);
  await page.mouse.click(mid.x, mid.y, { button: 'right' });
  await page.locator('[data-testid=menu-apply-entity]').click();
  await page.getByRole('menuitem', { name: 'func →' }).click();
  await page.locator('[data-testid=menu-class-func_door]').click();
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());

  // Conversion wraps the brush in a func_door entity. The renderer stats
  // cannot see it (brush entities are not drawn as boxes), so verify the
  // document structure through the project text.
  const structure = await page.evaluate(() => {
    const joole = (window as unknown as { joole: { project(): string; selection(): string[] } })
      .joole;
    const project = JSON.parse(joole.project()) as {
      document: {
        nodes: { kind: string; id: string; props?: [string, string][]; children?: string[] }[];
      };
    };
    const entities = project.document.nodes.filter((n) => n.kind === 'entity');
    return {
      classes: entities.map((e) => e.props?.find(([k]) => k === 'classname')?.[1]),
      doorChildren:
        entities.find((e) => e.props?.some(([, v]) => v === 'func_door'))?.children ?? [],
      selection: joole.selection(),
    };
  });
  expect(structure.classes).toContain('monster_soldier');
  expect(structure.classes).toContain('func_door');
  expect(structure.doorChildren.length).toBe(1);
  // The new entity is selected.
  expect(structure.selection.length).toBe(1);

  // Undo restores the flat structure.
  await page.keyboard.press('Control+z');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const afterUndo = await page.evaluate(() => {
    const joole = (window as unknown as { joole: { project(): string } }).joole;
    const project = JSON.parse(joole.project()) as {
      document: { nodes: { kind: string; props?: [string, string][] }[] };
    };
    return project.document.nodes.filter(
      (n) => n.kind === 'entity' && n.props?.some(([, v]) => v === 'func_door'),
    ).length;
  });
  expect(afterUndo).toBe(0);
});
