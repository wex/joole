import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    stats(): {
      frames: number;
      nodes: number;
      textures: readonly { name: string; width: number; height: number }[];
    };
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
  await expect(page.locator('[data-testid=texture-placeholder]')).toContainText(
    '1 textures indexed',
  );
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
  await expect(page.locator('[data-testid=properties-panel]')).toContainText('Properties');
  await expect(page.getByRole('tab', { name: 'Log' })).toBeVisible();

  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('menuitem', { name: 'Open Game Folder…' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open Map…' })).toBeVisible();
  await page.keyboard.press('Escape');

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

  const fly = await viewPoint(page, '3d');
  await page.mouse.move(fly.x, fly.y);
  await page.mouse.down({ button: 'right' });
  await expect(page.locator('[data-testid=view-title-3d]')).toContainText('Fly');
  await page.mouse.move(fly.x + 48, fly.y + 8, { steps: 3 });
  await page.keyboard.down('w');
  await page.waitForTimeout(350);
  await page.keyboard.up('w');
  await page.mouse.up({ button: 'right' });
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
