import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertWalToRgba } from './walRgba';

const tinyWal = new Uint8Array(readFileSync('tests/fixtures/tiny.wal'));
const colormapPcx = new Uint8Array(
  readFileSync('tests/fixtures/colormap.pcx').buffer as ArrayBuffer,
);
// The fixture palette: the pcx reader's rule applied here directly.
const palette = colormapPcx.subarray(colormapPcx.byteLength - 768);

describe('convertWalToRgba', () => {
  it('converts mip 0 to RGBA8 with palette colours and opaque alpha', () => {
    const result = convertWalToRgba(tinyWal, palette);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.rgba.byteLength).toBe(4 * 4 * 4);
    // tiny.wal mip 0 holds the indices 0..15 in order.
    for (let i = 0; i < 16; i++) {
      expect(result.rgba[i * 4]).toBe(palette[i * 3]);
      expect(result.rgba[i * 4 + 1]).toBe(palette[i * 3 + 1]);
      expect(result.rgba[i * 4 + 2]).toBe(palette[i * 3 + 2]);
      expect(result.rgba[i * 4 + 3]).toBe(255);
    }
  });

  it('treats index 255 as an opaque colour, not transparency', () => {
    const wal = tinyWal.slice();
    wal[100] = 255;
    const result = convertWalToRgba(wal, palette);
    expect(result.rgba[3]).toBe(255);
    expect(result.rgba[0]).toBe(palette[255 * 3]);
  });

  it('rejects a short palette', () => {
    expect(() => convertWalToRgba(tinyWal, palette.subarray(0, 767))).toThrow(RangeError);
  });

  it('converts a 512-texture batch quickly (Done-when proxy measurement)', () => {
    // 512 typical 256x256 textures in one thread; the worker pool keeps even
    // a fraction of this off the UI thread.
    const big = new Uint8Array(100 + 256 * 256 + 256 * 64 + 256 * 16 + 256 * 4);
    const view = new DataView(big.buffer);
    view.setUint32(32, 256, true);
    view.setUint32(36, 256, true);
    view.setUint32(40, 100, true);
    const started = performance.now();
    let total = 0;
    for (let i = 0; i < 512; i++) {
      total += convertWalToRgba(big, palette).rgba.byteLength;
    }
    const elapsed = performance.now() - started;
    expect(total).toBe(512 * 256 * 256 * 4);
    // Generous ceiling for CI machines; typical hardware is far below 1 s.
    expect(elapsed).toBeLessThan(2000);
    console.log(`512-texture batch: ${elapsed.toFixed(0)} ms single-threaded`);
  });
});
