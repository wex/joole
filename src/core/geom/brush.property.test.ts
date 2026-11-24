import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Plane, Vec3 } from '@core/types/index';
import { analyzeBrush } from './brush';
import { brushFromPlanes } from './__tests__/helpers';
import { cross, dot, normalize, sub } from './vec3';
import { PLANE_EPS } from './constants';

// Mirrored random plane pairs always form a bounded convex polytope
// around the origin (normals generically span R3).
const planePairArb = fc
  .tuple(
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: 0.5, max: 4, noNaN: true }),
  )
  .filter(([x, y, z]) => Math.hypot(x, y, z) > 0.2)
  .map(([x, y, z, d]): [Plane, Plane] => {
    const n = normalize([x, y, z]) as Vec3;
    return [
      { n, d },
      { n: [-n[0], -n[1], -n[2]], d },
    ];
  });

// An axis-aligned box sliced by random plane pairs. The box planes
// guarantee a bounded region: only then is every polygon vertex a true
// polyhedron vertex incident to at least three planes. A slab-only random
// hull can be unbounded (fast-check counterexample on 24.11.2026), and an
// unbounded brush's polygons end at the finite base winding boundary.
const hullArb = fc
  .tuple(
    fc.tuple(
      fc.double({ min: 8, max: 64, noNaN: true }),
      fc.double({ min: 8, max: 64, noNaN: true }),
      fc.double({ min: 8, max: 64, noNaN: true }),
    ),
    fc.array(planePairArb, { minLength: 1, maxLength: 3 }),
  )
  .map(([[sx, sy, sz], pairs]): Plane[] => {
    const box: Plane[] = [
      { n: [1, 0, 0], d: sx },
      { n: [-1, 0, 0], d: sx },
      { n: [0, 1, 0], d: sy },
      { n: [0, -1, 0], d: sy },
      { n: [0, 0, 1], d: sz },
      { n: [0, 0, -1], d: sz },
    ];
    return [...box, ...pairs.flat()];
  });

describe('random convex hull properties', () => {
  it('polygons are planar and convex, and vertices lie on at least 3 planes', () => {
    fc.assert(
      fc.property(hullArb, (planes) => {
        const analysis = analyzeBrush(brushFromPlanes(planes));
        expect(analysis.volume).toBeGreaterThan(0);

        for (const [i, polygon] of analysis.polygons.entries()) {
          if (!polygon) {
            continue;
          }
          const plane = planes[i]!;

          // planar: every vertex lies on the face's own plane
          for (const p of polygon) {
            expect(Math.abs(dot(p, plane.n) - plane.d)).toBeLessThan(PLANE_EPS);
          }

          // every vertex lies on at least 3 planes of the input
          for (const p of polygon) {
            const incident = planes.filter(
              (pl) => Math.abs(dot(p, pl.n) - pl.d) <= PLANE_EPS,
            ).length;
            expect(incident).toBeGreaterThanOrEqual(3);
          }

          // convex: consecutive edge turns are consistent in orientation
          const signs: number[] = [];
          for (let k = 0; k < polygon.length; k++) {
            const a = polygon[k]!;
            const b = polygon[(k + 1) % polygon.length]!;
            const c = polygon[(k + 2) % polygon.length]!;
            const turn = dot(cross(sub(b, a), sub(c, b)), plane.n);
            signs.push(turn);
          }
          const allPositive = signs.every((s) => s >= -1e-8);
          const allNegative = signs.every((s) => s <= 1e-8);
          expect(allPositive || allNegative).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  });
});
