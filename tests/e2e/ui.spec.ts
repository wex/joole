import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    stats(): {
      frames: number;
      nodes: number;
      textures: readonly { name: string; width: number; height: number }[];
    };
    selection(): string[];
    autosave(): Promise<boolean>;
    camera(view: string): unknown;
  };
}

const fixtureDir = path.dirname(fileURLToPath(new URL('../fixtures/room.map', import.meta.url)));
const gameDir = path.join(fixtureDir, 'game');
const roomMap = path.join(fixtureDir, 'room.map');

function consoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
}

async function openFixtureMap(page: Page): Promise<void> {
  await openEditor(page);
  await page.locator('[data-testid=game-directory-input]').setInputFiles(gameDir);
  await expect(page.locator('[data-testid=texture-browser]')).toBeVisible();
  await page.locator('[data-testid=map-input]').setInputFiles(roomMap);
  await expect(page.locator('[data-testid=properties-panel]')).toContainText('room.map');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
}

async function viewPoint(page: Page, view: '3d' | 'top' | 'front' | 'side') {
  const box = await page.locator('[data-testid=viewport-area]').boundingBox();
  if (!box) {
    throw new Error('viewport is not visible');
  }
  return {
    x: box.x + box.width * (view === 'top' || view === 'side' ? 0.75 : 0.25),
    y: box.y + box.height * (view === 'front' || view === 'side' ? 0.75 : 0.25),
  };
}

async function canvasScreenshot(page: Page): Promise<Buffer> {
  return page.locator('[data-testid=viewport-area] canvas').screenshot();
}

test('the shell has the workspace, file menu, panels, splitters, theme and view maximise', async ({
  page,
}) => {
  const errors = consoleErrors(page);
  await openEditor(page);

  await expect(page.locator('[data-testid^=view-title-]')).toHaveCount(4);
  await expect(page.locator('[data-testid=view-title-3d]')).toContainText('Textured');
  await expect(page.locator('[data-testid=view-title-top]')).toContainText('X, Y');
  await expect(page.locator('[data-testid=view-title-front]')).toContainText('X, Z');
  await expect(page.locator('[data-testid=view-title-side]')).toContainText('Y, Z');
  await expect(page.locator('[data-testid=dock-properties]')).toContainText('Properties');
  await expect(page.locator('[data-testid=dock-textures]')).toContainText('Textures');
  await expect(page.locator('[data-testid=properties-panel]')).toContainText('Selection');
  await expect(page.getByRole('tab', { name: 'Log' })).toBeVisible();

  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('menuitem', { name: 'Open Game Folder…' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open Map…' })).toBeVisible();
  await page.keyboard.press('Escape');

  const top = await viewPoint(page, 'top');
  await page.mouse.click(top.x, top.y, { button: 'right' });
  await expect(page.locator('[data-testid=view-context-menu]')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Add Brush' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid=view-context-menu]')).toHaveCount(0);

  await page.keyboard.press('F2');
  await expect(page.locator('[data-testid=view-title-top]')).toBeVisible();
  await expect(page.locator('[data-testid=view-title-3d]')).toBeHidden();
  await page.keyboard.press('F2');
  await expect(page.locator('[data-testid=view-title-3d]')).toBeVisible();
  await expect(page.locator('[data-testid=view-title-top]')).toBeVisible();

  const vertical = page.getByRole('separator', { name: 'Resize properties panel' });
  const widthBefore = Number(await vertical.getAttribute('aria-valuenow'));
  await vertical.focus();
  await page.keyboard.press('ArrowLeft');
  expect(Number(await vertical.getAttribute('aria-valuenow'))).toBe(widthBefore + 8);
  // The bottom panel starts collapsed (T15.9): expand it to reach the splitter.
  await page.getByRole('button', { name: 'Expand bottom panel' }).click();
  const horizontal = page.getByRole('separator', { name: 'Resize bottom panel' });
  const heightBefore = Number(await horizontal.getAttribute('aria-valuenow'));
  await horizontal.focus();
  await page.keyboard.press('ArrowUp');
  expect(Number(await horizontal.getAttribute('aria-valuenow'))).toBe(heightBefore + 8);

  await page.getByRole('button', { name: 'Use Light Theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Use Dark Theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

test('opens the fixture game folder and map and reports them in the log', async ({ page }) => {
  const errors = consoleErrors(page);
  await openFixtureMap(page);

  await expect(page.locator('[data-testid=properties-panel]')).toContainText(/Game data\s*Open/);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes))
    .toBe(13);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().textures))
    .toEqual([{ name: 'e2u1/mine10_1', width: 64, height: 64 }]);

  await page.getByRole('tab', { name: 'Log' }).click();
  await expect(page.locator('[data-testid=log-panel]')).toContainText(
    'Game data opened: 1 texture.',
  );
  await expect(page.locator('[data-testid=log-panel]')).toContainText(
    'Opened map room.map (16 nodes).',
  );
  expect(errors).toEqual([]);
});

test('2D pan and zoom and 3D fly change the rendered views', async ({ page }) => {
  // Fly mode runs on a stand-in for the Pointer Lock API. The app sees the
  // same document.pointerLockElement and pointerlockchange events, but the
  // browser's real lock is avoided: Playwright's WebKit denies it, and
  // headless Chromium starves its input and evaluation channels while the
  // pointer is locked.
  await page.addInitScript(() => {
    const lock: { element: Element | null } = { element: null };
    const changed = () =>
      queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')));
    Object.defineProperty(Document.prototype, 'pointerLockElement', {
      configurable: true,
      get: () => lock.element,
    });
    Element.prototype.requestPointerLock = function (this: Element) {
      lock.element = this;
      changed();
      return Promise.resolve();
    } as Element['requestPointerLock'];
    Document.prototype.exitPointerLock = function () {
      lock.element = null;
      changed();
    };
  });
  const errors = consoleErrors(page);
  await openFixtureMap(page);

  const initial = await canvasScreenshot(page);
  const top = await viewPoint(page, 'top');
  await page.mouse.move(top.x, top.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(top.x + 80, top.y + 40, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const panned = await canvasScreenshot(page);
  expect(panned.equals(initial)).toBe(false);

  await page.mouse.move(top.x, top.y);
  await page.mouse.wheel(0, -240);
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const zoomed = await canvasScreenshot(page);
  expect(zoomed.equals(panned)).toBe(false);

  const framesBeforeIgnoredKeys = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.stats().frames,
  );
  await page.keyboard.down('w');
  await page.waitForTimeout(200);
  await page.keyboard.up('w');
  expect(await page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().frames)).toBe(
    framesBeforeIgnoredKeys,
  );

  // Right-hold fly is gone (T1.4): a right-drag in 3D must not change the view.
  const fly = await viewPoint(page, '3d');
  const framesBeforeRightDrag = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.stats().frames,
  );
  await page.mouse.move(fly.x, fly.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(fly.x + 48, fly.y + 8, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('[data-testid=view-title-3d]')).toContainText('Textured');
  expect(await page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().frames)).toBe(
    framesBeforeRightDrag,
  );

  // The wheel moves the 3D camera forward and backward (T1.5).
  await page.mouse.move(fly.x, fly.y);
  await page.mouse.wheel(0, -240);
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const dollied = await canvasScreenshot(page);
  expect(dollied.equals(zoomed)).toBe(false);

  // Mouse-look and WASD work in pointer-lock mode (middle-click).
  await page.mouse.move(fly.x, fly.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  await expect(page.locator('[data-testid=view-title-3d]')).toContainText('Fly');
  await page.mouse.move(fly.x + 48, fly.y + 8, { steps: 3 });
  // Copied inside the page: the moved camera is not a plain object.
  const position = () =>
    page.evaluate(() => {
      const camera = (window as unknown as JooleWindow).joole!.camera('3d') as {
        position: number[];
      };
      return [...camera.position];
    });
  const start = await position();
  await page.keyboard.down('w');
  await page.waitForTimeout(350);
  await page.keyboard.up('w');
  const forward = await position();
  // S moves backwards (T15.2): opposite to the W step, and the Select tool
  // shortcut does not take the key.
  await page.keyboard.down('s');
  await page.waitForTimeout(350);
  await page.keyboard.up('s');
  const back = await position();
  const step = forward.map((v, i) => v - start[i]!);
  const backStep = back.map((v, i) => v - forward[i]!);
  expect(step.reduce((sum, v, i) => sum + v * backStep[i]!, 0)).toBeLessThan(0);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  await expect(page.locator('[data-testid=view-title-3d]')).toContainText('Textured');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const flown = await canvasScreenshot(page);
  expect(flown.equals(zoomed)).toBe(false);

  const framesAtIdle = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.stats().frames,
  );
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().frames)).toBe(
    framesAtIdle,
  );
  expect(errors).toEqual([]);
});

test('selecting and dragging a brush moves it, and Ctrl+Z undoes the move', async ({ page }) => {
  const errors = consoleErrors(page);
  await openFixtureMap(page);
  const initial = await canvasScreenshot(page);
  const top = await viewPoint(page, 'top');

  await page.mouse.click(top.x, top.y, { button: 'left' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.selection().length))
    .toBe(1);
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const selected = await canvasScreenshot(page);
  expect(selected.equals(initial)).toBe(false);

  await page.mouse.move(top.x, top.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(top.x + 72, top.y + 40, { steps: 5 });
  await page.mouse.up({ button: 'left' });
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const moved = await canvasScreenshot(page);
  expect(moved.equals(selected)).toBe(false);

  await page.keyboard.press('Control+z');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const undone = await canvasScreenshot(page);
  expect(undone.equals(selected)).toBe(true);
  expect(errors).toEqual([]);
});

test('the brush tool creates a primitive in a 2D view and undo removes it', async ({ page }) => {
  const errors = consoleErrors(page);
  await openFixtureMap(page);
  const initial = await canvasScreenshot(page);
  const nodesBefore = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.stats().nodes,
  );

  await page.getByRole('button', { name: 'Brush (B)' }).click();
  await expect(page.getByLabel('Brush primitive')).toBeVisible();
  await page.getByLabel('Brush primitive').selectOption('wedge');

  const top = await viewPoint(page, 'top');
  await page.mouse.move(top.x, top.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(top.x + 80, top.y + 80, { steps: 6 });
  await page.mouse.up({ button: 'left' });
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());

  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.selection().length))
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes))
    .toBe(nodesBefore + 1);
  const created = await canvasScreenshot(page);
  expect(created.equals(initial)).toBe(false);

  await page.keyboard.press('Control+z');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes))
    .toBe(nodesBefore);
  expect(errors).toEqual([]);
});

test('toolbar Undo and Redo buttons follow command history', async ({ page }) => {
  await openFixtureMap(page);
  const nodesBefore = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.stats().nodes,
  );
  const undo = page.getByRole('button', { name: 'Undo', exact: true }).first();
  const redo = page.getByRole('button', { name: 'Redo', exact: true }).first();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  const top = await viewPoint(page, 'top');
  await page.mouse.click(top.x, top.y);
  await page.keyboard.press('Control+d');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes))
    .toBe(nodesBefore);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes))
    .toBe(nodesBefore + 1);
});

test('copy, paste, cut and duplicate operate on the selection', async ({ page, context }) => {
  const errors = consoleErrors(page);
  // Firefox has no clipboard permission names; the copy paths do not need
  // them for the node-count assertions either, so an unsupported grant is
  // simply skipped.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await openFixtureMap(page);
  const nodesBefore = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.stats().nodes,
  );
  const top = await viewPoint(page, 'top');
  await page.mouse.click(top.x, top.y, { button: 'left' });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.selection().length))
    .toBe(1);

  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes))
    .toBe(nodesBefore + 1);

  await page.keyboard.press('Control+x');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes))
    .toBe(nodesBefore);

  await page.mouse.click(top.x, top.y, { button: 'left' });
  await page.keyboard.press('Control+d');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes))
    .toBe(nodesBefore + 1);
  expect(errors).toEqual([]);
});

test('Ctrl+S downloads a project and the project reloads without loss', async ({ page }) => {
  const errors = consoleErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  await openFixtureMap(page);
  const nodesBefore = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.stats().nodes,
  );

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('room.joole.json');
  const path = await download.path();
  expect(path).not.toBeNull();

  await page.locator('[data-testid=map-input]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: await readFile(path!),
  });
  await expect(page.locator('[data-testid=properties-panel]')).toContainText('room.joole.json');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  expect(await page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes)).toBe(
    nodesBefore,
  );
  expect(errors).toEqual([]);
});

test('an edit autosaves and reload offers recovery', async ({ page }) => {
  const errors = consoleErrors(page);
  await contextlessOpen(page);

  async function contextlessOpen(page: Page) {
    await openFixtureMap(page);
  }
  const nodesBefore = await page.evaluate(
    () => (window as unknown as JooleWindow).joole!.stats().nodes,
  );
  const top = await viewPoint(page, 'top');
  await page.mouse.click(top.x, top.y, { button: 'left' });
  await page.keyboard.press('Control+d');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes))
    .toBe(nodesBefore + 1);
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.autosave());

  await page.reload();
  await expect(page.locator('[data-testid=recovery-prompt]')).toBeVisible();
  await page.getByRole('button', { name: 'Recover' }).click();
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  await expect
    .poll(() => page.evaluate(() => (window as unknown as JooleWindow).joole!.stats().nodes))
    .toBe(nodesBefore + 1);
  expect(errors).toEqual([]);
});

test('Space frames a selected group (T16.2)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  type Joole = {
    joole: {
      camera(name: string): { center: [number, number, number]; zoom: number };
      viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
      selection(): string[];
    };
  };

  // Draw a box in the Top view.
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const top = await page.evaluate(() => {
    const joole = (window as unknown as Joole).joole;
    const cam = joole.camera('top');
    const rect = joole.viewRects()['top']!;
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const toScreen = (wx: number, wy: number) => ({
      x: canvas.left + rect.x + (wx - cam.center[0]) * (cam.zoom / ratio) + rect.width / 2,
      y: canvas.top + rect.y - (wy - cam.center[1]) * (cam.zoom / ratio) + rect.height / 2,
    });
    return {
      a: toScreen(0, 0),
      b: toScreen(64, 64),
      cx: canvas.left + rect.x + rect.width / 2,
      cy: canvas.top + rect.y + rect.height / 2,
    };
  });
  await page.mouse.move(top.a.x, top.a.y);
  await page.mouse.down();
  await page.mouse.move(top.b.x, top.b.y, { steps: 4 });
  await page.mouse.up();

  // Group the brush: the selection now holds the group, not the brush.
  await page.keyboard.press('Control+g');
  await page.waitForTimeout(200);

  // Space in the Top view frames the group's members.
  const before = await page.evaluate(() => (window as unknown as Joole).joole.camera('top'));
  await page.mouse.move(top.cx, top.cy);
  await page.keyboard.press(' ');
  const after = await page.evaluate(() => (window as unknown as Joole).joole.camera('top'));
  expect(after.center[0]).toBeCloseTo(32, 1);
  expect(after.center[1]).toBeCloseTo(32, 1);
  expect(after.zoom).not.toBeCloseTo(before.zoom, 2);
});

test('Space frames the selection in the hovered view (T15.5)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  type Joole = {
    joole: {
      camera(name: string): { center: [number, number, number]; zoom: number };
      viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
    };
  };
  const camera = (view: string) =>
    page.evaluate((v) => (window as unknown as Joole).joole.camera(v), view);

  // Draw a box in the Top view.
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const top = await page.evaluate(() => {
    const joole = (window as unknown as Joole).joole;
    const cam = joole.camera('top');
    const rect = joole.viewRects()['top']!;
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const toScreen = (wx: number, wy: number) => ({
      x: canvas.left + rect.x + (wx - cam.center[0]) * (cam.zoom / ratio) + rect.width / 2,
      y: canvas.top + rect.y - (wy - cam.center[1]) * (cam.zoom / ratio) + rect.height / 2,
    });
    return {
      a: toScreen(0, 0),
      b: toScreen(64, 64),
      cx: canvas.left + rect.x + rect.width / 2,
      cy: canvas.top + rect.y + rect.height / 2,
    };
  });
  await page.mouse.move(top.a.x, top.a.y);
  await page.mouse.down();
  await page.mouse.move(top.b.x, top.b.y, { steps: 4 });
  await page.mouse.up();

  // Zoom far out, then Space in the Top view frames the selection.
  const before = await camera('top');
  await page.mouse.move(top.cx, top.cy);
  await page.keyboard.press(' ');
  const after = await camera('top');
  expect(after.center[0]).toBeCloseTo(32, 1);
  expect(after.center[1]).toBeCloseTo(32, 1);
  expect(after.zoom).not.toBeCloseTo(before.zoom, 2);
  // The selection fills about half of the view: extent × zoom / height ≈ 0.5.
  const ratio = await page.evaluate(() => window.devicePixelRatio || 1);
  const rect = await page.evaluate(() => (window as unknown as Joole).joole.viewRects()['top']!);
  const fill = (64 * after.zoom) / ratio / Math.min(rect.width, rect.height);
  expect(fill).toBeGreaterThan(0.3);
  expect(fill).toBeLessThan(0.7);
  // The depth coordinate does not jump.
  expect(after.center[2]).toBeCloseTo(before.center[2], 5);
});

test('the top bar shows the application version before the theme toggle', async ({ page }) => {
  await openEditor(page);
  const version = page.locator('[data-testid=app-version]');
  await expect(version).toHaveText(/^v\d+\.\d+\.\d+$/);
  // It sits immediately before the theme toggle.
  const order = await page.evaluate(() => {
    const v = document.querySelector('[data-testid=app-version]');
    const t = document.querySelector('[aria-label*="Theme"]');
    if (!v || !t) return 'missing';
    return v.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before' : 'after';
  });
  expect(order).toBe('before');
});
