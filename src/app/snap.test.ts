import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { snap, snapAxes, snapDepthExtent } from './snap';

describe('snap', () => {
  it('rounds to the nearest grid multiple', () => {
    expect(snap(0, 8)).toBe(0);
    expect(snap(3, 8)).toBe(0);
    expect(snap(5, 8)).toBe(8);
    expect(snap(-5, 8)).toBe(-8);
    expect(snap(12.5, 1)).toBe(13);
    expect(snap(-12.5, 1)).toBe(-12);
  });

  it('never returns negative zero', () => {
    expect(Object.is(snap(-1, 8), -0)).toBe(false);
    expect(snap(-1, 8)).toBe(0);
  });
});

describe('snapAxes', () => {
  it('snaps only the given axes', () => {
    const out = snapAxes([3, 5, 7], [0, 2], 8);
    expect(out).toEqual([0, 5, 8]);
  });

  it('property: snapped values are grid multiples', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10000, max: 10000, noNaN: true }),
        fc.integer({ min: 0, max: 8 }),
        (value, power) => {
          const grid = 2 ** power;
          const snapped = snap(value, grid);
          expect(Math.abs((snapped / grid) % 1)).toBeCloseTo(0, 9);
        },
      ),
    );
  });
});

describe('snapDepthExtent', () => {
  it('is symmetric 64 at small grid sizes', () => {
    expect(snapDepthExtent(0, 8)).toEqual([-32, 32]);
    expect(snapDepthExtent(0, 16)).toEqual([-32, 32]);
    expect(snapDepthExtent(0, 32)).toEqual([-32, 32]);
    expect(snapDepthExtent(16, 8)).toEqual([-16, 48]);
  });

  it('property: both bounds are grid multiples at least 64 apart', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -4096, max: 4096 }),
        fc.integer({ min: 0, max: 8 }),
        (centerUnits, power) => {
          const grid = 2 ** power;
          const center = centerUnits * grid; // centres are grid-aligned in use
          const [min, max] = snapDepthExtent(center, grid);
          expect(max - min).toBeGreaterThanOrEqual(64);
          expect((min / grid) % 1).toBeCloseTo(0, 9);
          expect((max / grid) % 1).toBeCloseTo(0, 9);
          // The centre stays inside the depth range.
          expect(center).toBeGreaterThanOrEqual(min);
          expect(center).toBeLessThanOrEqual(max);
        },
      ),
    );
  });

  it('large grids still land on the grid', () => {
    const [min64, max64] = snapDepthExtent(0, 64);
    expect(min64 % 64).toBe(0);
    expect(max64 % 64).toBe(0);
    const [min128, max128] = snapDepthExtent(0, 128);
    expect(min128 % 128).toBe(0);
    expect(max128 % 128).toBe(0);
  });
});
