import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { writeGeneratedBrushMap } from '../fixtures/generatedMap';

const glNote = process.env.JOOLE_MEASURE_SOFTWARE_GL === '1' ? 'software GL' : 'hardware GL';

/** The measurement is only meaningful when the renderer string proves the
    expected GL path; a hardware pass that silently fell back to SwiftShader
    must fail instead of recording a worthless number. */
async function probeGlRenderer(page: Page): Promise<string> {
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'no webgl2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
  });
  console.log('P5.6 GL renderer:', renderer);
  if (glNote === 'hardware GL' && /swiftshader|no webgl2/i.test(renderer)) {
    throw new Error(
      `hardware-GL measurement but the renderer is "${renderer}" — refusing to record a meaningless number`,
    );
  }
  return renderer;
}

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixtureDir = path.join(projectRoot, 'tests/fixtures');
const gameDir = path.join(fixtureDir, 'game');

interface JooleWindow {
  joole?: {
    whenIdle(): Promise<void>;
    stats(): { frames: number; nodes: number };
    selection(): string[];
    viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
  };
}

const joole = (page: Page) =>
  page.evaluate(() => {
    const j = (window as unknown as JooleWindow).joole!;
    const rects = j.viewRects();
    const center = (name: string) => {
      const r = rects[name]!;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    return {
      frames: j.stats().frames,
      top: center('top'),
      view3d: center('3d'),
    };
  });

// P5.6 measurements. Numbers are recorded in the spec; the assertions are
// loose sanity bounds because the strict targets belong to reference hardware.
test('measures memory and orbit fps with a 20000-brush map', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(300000);
  test.skip(testInfo.project.name !== 'chromium', 'reference-browser measurement');
  const bigMap = writeGeneratedBrushMap(20000, projectRoot);
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const heap = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((m) => m.name === 'JSHeapUsedSize')!.value / 1024 / 1024;
  };
  const memBefore = await heap();

  await probeGlRenderer(page);
  await page.locator('[data-testid=map-input]').setInputFiles(bigMap);
  await expect(page.locator('[data-testid=properties-panel]')).toContainText('brushes-20000.map', {
    timeout: 60000,
  });
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  // Force a few GCs through the CDP heap profiler so the measurement is stable.
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const memAfter = await heap();
  const note1 = `memory 20k brushes untextured: JS heap ${(memAfter - memBefore).toFixed(0)} MB delta, ${memAfter.toFixed(0)} MB total`;
  testInfo.annotations.push({ type: 'measurement', description: note1 });
  console.log('P5.6 MEASUREMENT:', note1);
  expect(memAfter - memBefore).toBeLessThan(600); // sanity bound, target is 300

  // Orbit the 3D view continuously with a real mouse drag and count frames.
  const start = await joole(page);
  const orbit = start.view3d;
  await page.mouse.move(orbit.x, orbit.y);
  await page.mouse.down({ button: 'right' });
  const t0 = Date.now();
  let x = orbit.x;
  let y = orbit.y;
  while (Date.now() - t0 < 3000) {
    x += 14;
    y += 4;
    await page.mouse.move(x, y);
  }
  await page.mouse.up({ button: 'right' });
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());
  const end = await joole(page);
  const fps = ((end.frames - start.frames) / 3).toFixed(1);
  const note2 = `orbit fps 20k brushes (${glNote}): ${fps}`;
  testInfo.annotations.push({ type: 'measurement', description: note2 });
  console.log('P5.6 MEASUREMENT:', note2);
});

test('measures drag latency on the 5000-brush map', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  test.skip(testInfo.project.name !== 'chromium', 'reference-browser measurement');
  const mapFile = writeGeneratedBrushMap(5000, projectRoot);
  await page.goto('/');
  await page.locator('[data-testid=game-directory-input]').setInputFiles(gameDir);
  await expect(page.locator('[data-testid=texture-browser]')).toBeVisible();
  await probeGlRenderer(page);
  await page.locator('[data-testid=map-input]').setInputFiles(mapFile);
  await page.evaluate(() => (window as unknown as JooleWindow).joole!.whenIdle());

  const views = await joole(page);
  // Select a brush near the centre of the top view. The exact centre of the
  // generated lattice is a degenerate hit/miss point that pixel rounding
  // decides differently across environments, so scan a few nearby offsets —
  // the boxes cover most of each lattice period, so one of them hits.
  const offsets: Array<[number, number]> = [
    [0, 0],
    [24, 0],
    [-24, 0],
    [0, 24],
    [0, -24],
    [24, 24],
    [-24, -24],
    [48, 0],
    [0, 48],
    [48, 48],
  ];
  let sx = views.top.x;
  let sy = views.top.y;
  let picked = false;
  for (const [dx, dy] of offsets) {
    await page.mouse.click(views.top.x + dx, views.top.y + dy);
    const n = await page.evaluate(
      () => (window as unknown as JooleWindow).joole!.selection().length,
    );
    if (n > 0) {
      sx = views.top.x + dx;
      sy = views.top.y + dy;
      picked = true;
      break;
    }
  }
  expect(picked, 'no brush hit at any scanned offset').toBe(true);

  // Measure single-step input-to-frame latency: real move, then wait in-page
  // for the frame counter to advance and time that interval inside the page.
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const samples: number[] = [];
  for (let i = 1; i <= 12; i++) {
    const armed = page.evaluate(async () => {
      const j = (window as unknown as JooleWindow).joole!;
      const before = j.stats().frames;
      const start = performance.now();
      return await new Promise<number>((resolve) => {
        const tick = () => {
          if (j.stats().frames > before) resolve(performance.now() - start);
          else requestAnimationFrame(tick);
        };
        // Arm the waiter, then the test's mouse.move lands in the next event.
        setTimeout(tick, 0);
        setTimeout(() => resolve(-1), 3000);
      });
    });
    await page.mouse.move(sx + i * 8, sy + i * 8);
    const latency = await armed;
    if (latency >= 0) samples.push(latency);
  }
  await page.mouse.up();
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)] ?? -1;
  const p90 = samples[Math.floor(samples.length * 0.9)] ?? -1;
  const note = `drag 5k brushes input-to-frame: median ${median.toFixed(2)} ms, p90 ${p90.toFixed(2)} ms (${samples.length}/12 samples, ${glNote})`;
  testInfo.annotations.push({ type: 'measurement', description: note });
  console.log('P5.6 MEASUREMENT:', note);
  expect(samples.length).toBeGreaterThan(4);
});
