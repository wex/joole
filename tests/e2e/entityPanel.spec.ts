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
          rect.x +
          (point[h]! - camera.center[h]!) * (camera.zoom / ratio) +
          rect.width / 2,
        y:
          canvas.top +
          rect.y -
          (point[v]! - camera.center[v]!) * (camera.zoom / ratio) +
          rect.height / 2,
      };
    },
    { view, point },
  );
}

function projectEntities(page: Page) {
  return page.evaluate(() => {
    const joole = (window as unknown as JooleWindow).joole!;
    const project = JSON.parse(joole.project()) as {
      document: { nodes: { kind: string; props?: [string, string][] }[] };
    };
    return project.document.nodes.filter((n) => n.kind === 'entity').map((e) => e.props ?? []);
  });
}

/** The props of the placed monster (index 0 of worldspawn's entity children is worldspawn itself). */
async function monsterProps(page: Page): Promise<[string, string][]> {
  const entities = await projectEntities(page);
  const found = entities.find((props) =>
    props.some(([k, v]) => k === 'classname' && v.startsWith('monster_')),
  );
  if (!found) throw new Error(`no monster entity in ${JSON.stringify(entities)}`);
  return found;
}

test('edits entity keys, spawnflags and class through the panel', async ({ page }) => {
  await openEmptyEditor(page);

  // Place a soldier through the drill-down menu.
  const spot = await worldScreen(page, 'front', [0, 0, 32]);
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await page.locator('[data-testid=menu-add-entity]').click();
  await page.getByRole('menuitem', { name: 'monster →' }).click();
  await page.locator('[data-testid=menu-class-monster_soldier]').click();
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());

  // The panel shows the entity form with the class picker.
  await expect(page.locator('[data-testid=entity-panel]')).toBeVisible();
  await expect(page.locator('[data-testid=entity-class]')).toHaveValue('monster_soldier');

  // Toggle the Ambush spawnflag.
  await page.locator('[data-testid=spawnflag-Ambush]').click();
  expect(await monsterProps(page)).toContainEqual(['spawnflags', '1']);

  // Add the angle key through the (new key) row, then edit it in the
  // compass row's typed input.
  await page.locator('[data-testid=new-key-input]').fill('angle');
  await page.locator('[data-testid=new-key-value]').fill('90');
  await page.locator('[data-testid=new-key-value]').press('Tab');
  expect(await monsterProps(page)).toContainEqual(['angle', '90']);
  await page.locator('[data-testid=angle-input]').fill('180');
  await page.locator('[data-testid=angle-input]').press('Tab');
  expect(await monsterProps(page)).toContainEqual(['angle', '180']);

  // Add a new key through the (new key) row.
  await page.locator('[data-testid=new-key-input]').fill('targetname');
  await page.locator('[data-testid=new-key-value]').fill('sold1');
  await page.locator('[data-testid=new-key-value]').press('Tab');
  expect(await monsterProps(page)).toContainEqual(['targetname', 'sold1']);

  // Change the class with the picker; other keys are preserved.
  await page.locator('[data-testid=entity-class]').selectOption('monster_infantry');
  const props = await monsterProps(page);
  expect(props[0]).toEqual(['classname', 'monster_infantry']);
  expect(props).toContainEqual(['targetname', 'sold1']);
  expect(props).toContainEqual(['angle', '180']);

  // Undo chain reaches back over the edits. Focus must leave the form
  // controls first: Firefox keeps the select focused and would consume
  // Ctrl+Z as native text undo instead of the editor's shortcut.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 5; i++) await page.keyboard.press('Control+z');
  expect(await monsterProps(page)).not.toContainEqual(['spawnflags', '1']);
});
