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

function box(min: Vec3, max: Vec3): string {
  const [x1, y1, z1] = min;
  const [x2, y2, z2] = max;
  return `{
( ${x2} ${y1} ${z1} ) ( ${x2} ${y1} ${z2} ) ( ${x2} ${y2} ${z1} ) e2u1/mine10_1 0 0 0 1 1
( ${x1} ${y1} ${z1} ) ( ${x1} ${y2} ${z1} ) ( ${x1} ${y1} ${z2} ) e2u1/mine10_1 0 0 0 1 1
( ${x1} ${y2} ${z1} ) ( ${x2} ${y2} ${z1} ) ( ${x1} ${y2} ${z2} ) e2u1/mine10_1 0 0 0 1 1
( ${x1} ${y1} ${z1} ) ( ${x1} ${y1} ${z2} ) ( ${x2} ${y1} ${z1} ) e2u1/mine10_1 0 0 0 1 1
( ${x1} ${y1} ${z2} ) ( ${x1} ${y2} ${z2} ) ( ${x2} ${y1} ${z2} ) e2u1/mine10_1 0 0 0 1 1
( ${x1} ${y1} ${z1} ) ( ${x2} ${y1} ${z1} ) ( ${x1} ${y2} ${z1} ) e2u1/mine10_1 0 0 0 1 1
}`;
}

const overlapMap = `{
"classname" "worldspawn"
${box([0, 0, 0], [64, 64, 64])}
${box([0, 0, 64], [64, 64, 128])}
}
`;

async function openOverlapMap(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.locator('[data-testid=map-input]').setInputFiles({
    name: 'overlap.map',
    mimeType: 'text/plain',
    buffer: Buffer.from(overlapMap),
  });
  await expect(page.locator('[data-testid=properties-panel]')).toContainText('overlap.map');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
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

async function brushIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const project = JSON.parse((window as unknown as JooleWindow).joole!.project()) as {
      document: { nodes: { kind: string; id: string }[] };
    };
    return project.document.nodes.filter((node) => node.kind === 'brush').map((node) => node.id);
  });
}

async function selection(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as JooleWindow).joole!.selection());
}

test('repeated 2D clicks cycle overlapping brushes closest-first', async ({ page }) => {
  await openOverlapMap(page);
  const [low, high] = await brushIds(page);
  expect(low).toBeTruthy();
  expect(high).toBeTruthy();

  const spot = await worldScreen(page, 'top', [32, 32, 0]);
  await page.mouse.click(spot.x, spot.y);
  await expect.poll(() => selection(page)).toEqual([high!]);
  await page.mouse.click(spot.x, spot.y);
  await expect.poll(() => selection(page)).toEqual([low!]);
  await page.mouse.click(spot.x, spot.y);
  await expect.poll(() => selection(page)).toEqual([high!]);
});
