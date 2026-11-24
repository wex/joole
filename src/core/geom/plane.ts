import type { Plane, Vec3 } from '@core/types/index';
import { cross, dot, normalize, sub } from './vec3';

/**
 * Plane construction from three points, matching PlaneFromPoints in
 * ext/Quake-2-Tools/bsp/qbsp3/map.c: normal = (p0 − p1) × (p2 − p1),
 * normalised, and d = p0 · n. Returns null when the points are collinear
 * and the normal has zero length ("plane with no normal" in qbsp3).
 */
export function planeFromPoints(p0: Vec3, p1: Vec3, p2: Vec3): Plane | null {
  const t1 = sub(p0, p1);
  const t2 = sub(p2, p1);
  const n = normalize(cross(t1, t2));
  if (n[0] === 0 && n[1] === 0 && n[2] === 0) {
    return null;
  }
  return { n, d: dot(p0, n) };
}

/** Signed distance of a point from the plane, positive in front. */
export function planeDistance(plane: Plane, p: Vec3): number {
  return dot(p, plane.n) - plane.d;
}
