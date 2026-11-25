import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { writeGeneratedBrushMap } from '../fixtures/generatedMap';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixtureDir = path.join(projectRoot, 'tests/fixtures');
const gameDir = path.join(fixtureDir, 'game');

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    stats(): {
      frames: number;
      nodes: number;
      textures: readonly unknown[];
    };
  };
}

// The target is 2 s on the reference hardware. CI uses the spec's loose
// 2× threshold because its CPU performance varies and it renders through
// SwiftShader. The measured value is annotated either way.
const budgetMs = process.env.CI ? 4000 : 2000;

test('opens a generated 5000-brush map within the performance budget', async ({
  page,
}, testInfo) => {
  const mapFile = writeGeneratedBrushMap(5000, projectRoot);
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.locator('[data-testid=game-directory-input]').setInputFiles(gameDir);
  await expect(page.locator('[data-testid=texture-placeholder]')).toContainText(
    '1 textures indexed',
  );
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());

  const start = performance.now();
  await page.locator('[data-testid=map-input]').setInputFiles(mapFile);
  await expect(page.locator('[data-testid=properties-panel]')).toContainText('brushes-5000.map');
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const elapsed = performance.now() - start;
  testInfo.annotations.push({
    type: 'measurement',
    description: `5000-brush map open: ${elapsed.toFixed(1)} ms`,
  });

  const stats = await page.evaluate(() => (window as unknown as JooleWindow).joole!.stats());
  expect(stats.nodes).toBe(5000);
  expect(stats.frames).toBeGreaterThan(0);
  expect(elapsed).toBeLessThan(budgetMs);
});
