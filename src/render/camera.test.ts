import { describe, expect, it } from 'vitest';
import type { Mat4 } from '@core/geom/index';
import type { Vec3 } from '@core/types/index';
import {
  aabbInFrustum,
  frameOrtho,
  framePerspective,
  frustumPlanes,
  orthoBasis,
  toGlMatrix,
  unionAabb,
  viewProjection,
  type OrthoAxis,
  type PerspectiveCamera,
} from './camera';

function clip(m: Mat4, p: Vec3): [number, number, number, number] {
  const r = (i: number) =>
    m[i * 4]! * p[0] + m[i * 4 + 1]! * p[1] + m[i * 4 + 2]! * p[2] + m[i * 4 + 3]!;
  return [r(0), r(1), r(2), r(3)];
}

function ndc(m: Mat4, p: Vec3): [number, number, number] {
  const [x, y, z, w] = clip(m, p);
  return [x / w, y / w, z / w];
}

const perspective: PerspectiveCamera = {
  kind: 'perspective',
  position: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  fovY: 90,
  near: 1,
  far: 4096,
};

describe('2D view projections', () => {
  const cases: [OrthoAxis, Vec3, Vec3][] = [
    ['xy', [1, 0, 0], [0, 1, 0]],
    ['xz', [1, 0, 0], [0, 0, 1]],
    ['yz', [0, 1, 0], [0, 0, 1]],
  ];
  for (const [axis, right, up] of cases) {
    it(`${axis}: the centre is in the middle, right is +x, up is +y, zoom is pixels per unit`, () => {
      const center: Vec3 = [10, 20, 30];
      const m = viewProjection({ kind: 'ortho', axis, center, zoom: 2 }, 200, 100);
      const c = ndc(m, center);
      expect(c[0]).toBeCloseTo(0, 12);
      expect(c[1]).toBeCloseTo(0, 12);
      // 50 units right at 2 px per unit is 100 px: the right edge of a 200 px view.
      const r = ndc(m, [
        center[0] + 50 * right[0],
        center[1] + 50 * right[1],
        center[2] + 50 * right[2],
      ]);
      expect(r[0]).toBeCloseTo(1, 12);
      const u = ndc(m, [center[0] + 25 * up[0], center[1] + 25 * up[1], center[2] + 25 * up[2]]);
      expect(u[1]).toBeCloseTo(1, 12);
    });

    it(`${axis}: is not mirrored (right × up points towards the viewer)`, () => {
      const { right: r, up: u, forward: f } = orthoBasis(axis);
      const toward = [
        r[1] * u[2] - r[2] * u[1],
        r[2] * u[0] - r[0] * u[2],
        r[0] * u[1] - r[1] * u[0],
      ];
      expect(toward).toEqual([-f[0] + 0, -f[1] + 0, -f[2] + 0]);
    });
  }
});

describe('perspective projection', () => {
  it('a point straight ahead lands in the middle, within the depth range', () => {
    const m = viewProjection(perspective, 100, 100);
    const p = ndc(m, [100, 0, 0]);
    expect(p[0]).toBeCloseTo(0, 12);
    expect(p[1]).toBeCloseTo(0, 12);
    expect(p[2]).toBeGreaterThan(-1);
    expect(p[2]).toBeLessThan(1);
  });

  it('+Y is to the left and +Z is up when looking along +X', () => {
    const m = viewProjection(perspective, 100, 100);
    expect(ndc(m, [100, 10, 0])[0]).toBeLessThan(0);
    expect(ndc(m, [100, 0, 10])[1]).toBeGreaterThan(0);
  });

  it('a point behind the camera has a negative w', () => {
    expect(clip(viewProjection(perspective, 100, 100), [-100, 0, 0])[3]).toBeLessThan(0);
  });

  it('the near and far planes map to -1 and 1', () => {
    const m = viewProjection(perspective, 100, 100);
    expect(ndc(m, [1, 0, 0])[2]).toBeCloseTo(-1, 9);
    expect(ndc(m, [4096, 0, 0])[2]).toBeCloseTo(1, 9);
  });
});

describe('toGlMatrix', () => {
  it('transposes the row-major matrix into column-major order', () => {
    const m = Array.from({ length: 16 }, (_, i) => i) as unknown as Mat4;
    const gl = toGlMatrix(m);
    expect(gl[1]).toBe(4);
    expect(gl[4]).toBe(1);
    expect(gl[12]).toBe(3);
  });
});

describe('frustum culling', () => {
  const planes = frustumPlanes(viewProjection(perspective, 100, 100));
  const box = (center: Vec3, half = 8) => ({
    min: [center[0] - half, center[1] - half, center[2] - half] as Vec3,
    max: [center[0] + half, center[1] + half, center[2] + half] as Vec3,
  });

  it('keeps a box ahead and culls boxes behind, beside and beyond the far plane', () => {
    expect(aabbInFrustum(planes, box([100, 0, 0]))).toBe(true);
    expect(aabbInFrustum(planes, box([-100, 0, 0]))).toBe(false);
    expect(aabbInFrustum(planes, box([100, 500, 0]))).toBe(false);
    expect(aabbInFrustum(planes, box([10000, 0, 0]))).toBe(false);
  });

  it('keeps a box that straddles a plane', () => {
    expect(aabbInFrustum(planes, box([100, 105, 0], 10))).toBe(true);
    expect(aabbInFrustum(planes, box([0, 0, 0], 50))).toBe(true);
  });
});

describe('framing', () => {
  const bounds = { min: [0, 0, 0] as Vec3, max: [256, 128, 64] as Vec3 };

  it('unionAabb merges boxes and ignores nulls', () => {
    expect(unionAabb([null, bounds, { min: [-8, 0, 0], max: [0, 0, 512] }])).toEqual({
      min: [-8, 0, 0],
      max: [256, 128, 512],
    });
    expect(unionAabb([null])).toBeNull();
  });

  it('frameOrtho shows the whole box with the margin', () => {
    const camera = frameOrtho('xy', bounds, 400, 400, 0.1);
    expect(camera.center).toEqual([128, 64, 32]);
    // The x extent decides: 256 units plus 20 % in 400 px.
    expect(camera.zoom).toBeCloseTo(400 / (256 * 1.2), 12);
    expect(frameOrtho('yz', null, 400, 400).zoom).toBe(1);
  });

  it('framePerspective sees every corner of the box', () => {
    const camera = framePerspective(bounds, 16 / 9);
    const m = viewProjection(camera, 1600, 900);
    for (let i = 0; i < 8; i++) {
      const corner: Vec3 = [i & 1 ? 256 : 0, i & 2 ? 128 : 0, i & 4 ? 64 : 0];
      const p = ndc(m, corner);
      expect(Math.abs(p[0])).toBeLessThan(1);
      expect(Math.abs(p[1])).toBeLessThan(1);
      expect(Math.abs(p[2])).toBeLessThan(1);
    }
  });
});

describe('Space framing (T15.5)', () => {
  it('frames a box at half the view with frameOrtho margin 0.5', () => {
    const camera = frameOrtho('xy', { min: [0, 0, -8], max: [64, 64, 8] }, 256, 128, 0.5);
    expect(camera.center.slice(0, 2)).toEqual([32, 32]);
    // Height limits: the 128-unit margin-adjusted extent in 128 px is zoom 1,
    // and the 64-unit box then covers exactly half of the view height.
    expect(camera.zoom).toBeCloseTo(1, 6);
    expect((64 * camera.zoom) / 128).toBeCloseTo(0.5, 6);
  });

  it('the perspective distance is inverse to the fill', () => {
    const box = {
      min: [0, 0, 0] as [number, number, number],
      max: [64, 64, 64] as [number, number, number],
    };
    const near = framePerspective(box, 1, 45, -30, 60, 1);
    const far = framePerspective(box, 1, 45, -30, 60, 0.5);
    const dist = (c: { position: readonly number[] }) =>
      Math.hypot(c.position[0]! - 32, c.position[1]! - 32, c.position[2]! - 32);
    expect(dist(far)).toBeCloseTo(dist(near) * 2, 3);
  });
});
