import { describe, expect, it } from 'vitest';
import { planeDistance, planeFromPoints } from './plane';
import { expectVec } from './__tests__/helpers';

describe('planeFromPoints', () => {
  it('computes normal = (p0 − p1) × (p2 − p1) and d = p0 · n', () => {
    // hand-computed: t1 = (0,-64,0), t2 = (64,0,0), cross = (0,0,4096)
    const plane = planeFromPoints([0, 0, 64], [0, 64, 64], [64, 64, 64]);
    expect(plane).not.toBeNull();
    expectVec(plane!.n, [0, 0, 1]);
    expect(plane!.d).toBe(64);
  });

  it('reverses the normal when the point order is reversed', () => {
    const plane = planeFromPoints([64, 64, 64], [0, 64, 64], [0, 0, 64]);
    expectVec(plane!.n, [0, 0, -1]);
    expect(plane!.d).toBe(-64);
  });

  it('normalises non-axis planes', () => {
    const plane = planeFromPoints([0, 0, 0], [1, 0, 1], [0, 1, 1]);
    const len = Math.hypot(...plane!.n);
    expect(len).toBeCloseTo(1, 10);
  });

  it('returns null for collinear points', () => {
    expect(planeFromPoints([0, 0, 0], [1, 1, 1], [2, 2, 2])).toBeNull();
    expect(planeFromPoints([0, 0, 0], [0, 0, 0], [0, 0, 0])).toBeNull();
  });

  it('planeDistance is positive in front, negative behind', () => {
    expect(planeDistance({ n: [0, 0, 1], d: 64 }, [0, 0, 100])).toBeCloseTo(36);
    expect(planeDistance({ n: [0, 0, 1], d: 64 }, [0, 0, 0])).toBeCloseTo(-64);
  });
});
