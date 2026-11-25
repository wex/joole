import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { runQbsp3Oracle } from '../compiler/runQbsp3';

const fixtureDir = path.dirname(fileURLToPath(new URL('../fixtures/room.map', import.meta.url)));
const gameDir = path.join(fixtureDir, 'game');

type Vec3 = [number, number, number];

async function worldScreen(page: Page, point: Vec3) {
  return page.evaluate(
    ({ point }) => {
      const joole = (
        window as unknown as {
          joole: {
            camera(view: string): { axis: 'xy' | 'xz' | 'yz'; center: Vec3; zoom: number };
            viewRects(): Record<string, { x: number; y: number; width: number; height: number }>;
          };
        }
      ).joole;
      const camera = joole.camera('top');
      const rect = joole.viewRects().top!;
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      return {
        x:
          canvas.left +
          rect.x / ratio +
          (point[0] - camera.center[0]) * (camera.zoom / ratio) +
          rect.width / ratio / 2,
        y:
          canvas.top +
          rect.y / ratio -
          (point[1] - camera.center[1]) * (camera.zoom / ratio) +
          rect.height / ratio / 2,
      };
    },
    { point },
  );
}

/** Reads the texinfo lump of a Quake 2 bsp: flags, value and texture name per entry. */
function texinfoOf(bsp: Uint8Array): { flags: number; value: number; texture: string }[] {
  const view = new DataView(bsp.buffer, bsp.byteOffset, bsp.byteLength);
  // BSP header: magic + version, then lumps as (offset, length) pairs; texinfo is lump 5 in Quake 2.
  const lumpOffset = view.getInt32(8 + 5 * 8, true);
  const lumpLength = view.getInt32(8 + 5 * 8 + 4, true);
  const out = [];
  for (let at = lumpOffset; at + 76 <= lumpOffset + lumpLength; at += 76) {
    const flags = view.getInt32(at + 32, true);
    const value = view.getInt32(at + 36, true);
    let texture = '';
    for (let i = 0; i < 32; i++) {
      const c = view.getUint8(at + 40 + i);
      if (c === 0) break;
      texture += String.fromCharCode(c);
    }
    out.push({ flags, value, texture });
  }
  return out;
}

test('surface flag edits appear in the exported map and the compiled bsp', async ({ page }) => {
  // The save-file picker cannot be driven in a headless browser; the test
  // exercises the download fallback like the other export tests.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await expect(page.locator('[data-testid=editor-shell]')).toBeVisible();
  await page.locator('[data-testid=game-directory-input]').setInputFiles(gameDir);
  await expect(page.locator('[data-testid=texture-browser]')).toBeVisible();

  // Draw a brush; it stays selected.
  await page.getByRole('button', { name: 'Brush (B)' }).click();
  const a = await worldScreen(page, [0, 0, 0]);
  const b = await worldScreen(page, [64, 64, 0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();

  // The properties panel shows the surface checkboxes for the selection.
  const flags = page.locator('[data-testid=surface-flags]');
  await expect(flags).toBeVisible();
  await flags.getByText('SKY', { exact: true }).click();
  await page.locator('[data-testid=content-flags]').getByText('DETAIL', { exact: true }).click();
  await page.locator('[data-testid=surface-value]').fill('300');
  await page.locator('[data-testid=surface-value]').blur();

  // The object preview shows the single selection texture.
  await expect(page.locator('[data-testid=object-preview]')).toContainText('e2u1/mine10_1');

  // Export and inspect the attribs in the .map text.
  await page.getByRole('button', { name: 'File' }).click();
  const mapDownload = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export .map…' }).click();
  const exported = await mapDownload;
  const mapText = await readFile((await exported.path())!, 'utf8');
  // SURF_SKY 0x4 combined per face; CONTENTS_DETAIL 0x8000000 = 134217728.
  expect(mapText).toContain('134217728');
  // The value 300 closes each face line.
  expect(mapText).toMatch(/ 4 300$/m);

  // The compiled bsp carries the flags and the value in texinfo.
  const qbsp = await runQbsp3Oracle(mapText, 'surface-test', ['e2u1/mine10_1']);
  const texinfo = texinfoOf(new Uint8Array(qbsp.bsp));
  expect(texinfo.length).toBeGreaterThan(0);
  for (const info of texinfo) {
    expect(info.flags & 0x4).toBe(0x4);
    expect(info.value).toBe(300);
  }
});
