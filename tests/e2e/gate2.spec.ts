import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { expectCleanQbsp3, runQbsp3Oracle } from '../compiler/runQbsp3';

type OrthoView = 'top' | 'front' | 'side';
type Vec3 = [number, number, number];

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    stats(): { nodes: number };
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

/** Converts a world point to client coordinates using the same orthographic maths as the UI. */
async function worldScreen(page: Page, view: OrthoView, point: Vec3) {
  return page.evaluate(
    ({ view, point }) => {
      const joole = (window as unknown as JooleWindow).joole!;
      const camera = joole.camera(view) as {
        kind: 'ortho';
        axis: 'xy' | 'xz' | 'yz';
        center: Vec3;
        zoom: number;
      };
      const rect = joole.viewRects()[view]!;
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const axes: Record<string, [number, number]> = { xy: [0, 1], xz: [0, 2], yz: [1, 2] };
      const [hAxis, vAxis] = axes[camera.axis]!;
      const horizontal =
        (point[hAxis!]! - camera.center[hAxis!]!) * (camera.zoom / ratio) + rect.width / 2;
      const vertical =
        -(point[vAxis!]! - camera.center[vAxis!]!) * (camera.zoom / ratio) + rect.height / 2;
      return {
        x: canvas.left + rect.x + horizontal,
        y: canvas.top + rect.y + vertical,
      };
    },
    { view, point },
  );
}

async function dragWorld(page: Page, view: OrthoView, from: Vec3, to: Vec3): Promise<void> {
  const a = await worldScreen(page, view, from);
  const b = await worldScreen(page, view, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up({ button: 'left' });
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
}

async function drawBrush(page: Page, view: OrthoView, from: Vec3, to: Vec3): Promise<void> {
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  await dragWorld(page, view, from, to);
}

async function dragSelected(page: Page, view: OrthoView, from: Vec3, to: Vec3): Promise<void> {
  await page.getByRole('button', { name: 'Select (S)' }).click();
  await dragWorld(page, view, from, to);
}

async function nodeCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes);
}

test('Gate 2: build a sealed room in the UI, save it and export a compiler-clean map', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await openEmptyEditor(page);

  // Floor: draw the horizontal extents in Top, then move the 64-unit-deep
  // brush down so it occupies z -64..0.
  await drawBrush(page, 'top', [-96, -96, 0], [96, 96, 0]);
  expect(await nodeCount(page)).toBe(1);
  await dragSelected(page, 'front', [0, 0, 0], [0, 0, -32]);

  // Ceiling: duplicate the floor (the duplicate is offset by one grid step),
  // raise it in two grid-snapped moves and align it back in X/Y.
  await page.keyboard.press('Control+d');
  expect(await nodeCount(page)).toBe(2);
  await dragSelected(page, 'front', [8, 0, -32], [8, 0, 48]);
  await dragSelected(page, 'front', [8, 0, 48], [8, 0, 128]);
  await dragSelected(page, 'top', [8, 8, 128], [0, 0, 128]);

  // North and south walls: x/z are drawn directly in Front; the default
  // 64-unit Y depth is exactly the wall thickness. Move them into place.
  await drawBrush(page, 'front', [-96, 0, 0], [96, 0, 96]);
  await dragSelected(page, 'top', [0, 0, 48], [0, 64, 48]);
  await drawBrush(page, 'front', [-96, 0, 0], [96, 0, 96]);
  await dragSelected(page, 'top', [0, 0, 48], [0, -64, 48]);

  // East and west walls fill the 64-unit gap between the longer north and
  // south walls. They are 64 × 64 × 96 and move along X.
  await drawBrush(page, 'front', [-32, 0, 0], [32, 0, 96]);
  await dragSelected(page, 'front', [0, 0, 48], [64, 0, 48]);
  await drawBrush(page, 'front', [-32, 0, 0], [32, 0, 96]);
  await dragSelected(page, 'front', [0, 0, 48], [-64, 0, 48]);
  expect(await nodeCount(page)).toBe(6);

  // Place the player entity through the Gate-2 minimal placement command.
  const inside = await worldScreen(page, 'front', [0, 0, 48]);
  await page.mouse.click(inside.x, inside.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Add Player Start' }).click();
  expect(await nodeCount(page)).toBe(7);

  const projectDownload = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const project = await projectDownload;
  expect(project.suggestedFilename()).toBe('untitled.joole.json');
  expect(await project.path()).not.toBeNull();

  await page.getByRole('button', { name: 'File' }).click();
  const mapDownload = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export .map…' }).click();
  const exported = await mapDownload;
  expect(exported.suggestedFilename()).toBe('untitled.map');
  const exportPath = await exported.path();
  const mapText = await readFile(exportPath!, 'utf8');
  await mkdir('tests/fixtures/generated', { recursive: true });
  await writeFile('tests/fixtures/generated/gate2-room.map', mapText);
  expect(mapText).toContain('"classname" "info_player_start"');
  expect(mapText.match(/"classname" "worldspawn"/)).not.toBeNull();
  expect(errors).toEqual([]);

  const qbsp = await runQbsp3Oracle(mapText, 'gate2-room', ['e2u1/mine10_1']);
  expect(() => expectCleanQbsp3(qbsp)).not.toThrow();
});
