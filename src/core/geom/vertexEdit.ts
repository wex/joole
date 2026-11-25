import type { BrushNode, FaceTexture, Result, Vec3 } from '@core/types/index';
import { analyzeBrush, validateBrush } from './brush';
import { planeFromPoints } from './plane';
import { add, distance } from './vec3';
import { POINT_EPS } from './constants';

export type VertexEditError = 'invalid-target' | 'degenerate-edit' | 'rejected';

export interface VertexEditResult {
  readonly brush: BrushNode;
}

function mergePlanes(
  faces: { points: [Vec3, Vec3, Vec3]; tex: FaceTexture }[],
): { points: [Vec3, Vec3, Vec3]; tex: FaceTexture }[] {
  // Drop exact duplicate planes within POINT_EPS: splitting can produce a
  // triangle coplanar with its parent when a vertex moves along the face.
  const out: { points: [Vec3, Vec3, Vec3]; tex: FaceTexture }[] = [];
  for (const face of faces) {
    const plane = planeFromPoints(...face.points);
    if (!plane) continue;
    const duplicate = out.some((kept) => {
      const other = planeFromPoints(...kept.points);
      if (!other) return false;
      const dot = plane.n[0] * other.n[0] + plane.n[1] * other.n[1] + plane.n[2] * other.n[2];
      return Math.abs(dot - 1) <= 1e-6 && Math.abs(plane.d - other.d) <= POINT_EPS;
    });
    if (!duplicate) out.push(face);
  }
  return out;
}

/**
 * Moves the derived vertices at `positions` by `delta` and recomputes the
 * planes of every touching face, after Qoole's `BreakPlanes` semantics
 * translated to the plane-first model:
 *
 * - a face none of whose vertices move is unchanged;
 * - a face all of whose vertices move keeps its plane, translated by `delta`;
 * - a triangular face with some moving vertices is recomputed through the
 *   moved points, because a triangle always stays planar;
 * - a larger face keeps its original plane (the unmoved bulk) and gains one
 *   new triangular plane per moving vertex through the vertex's neighbours,
 *   so a non-planar result folds along the triangle edges instead.
 *
 * The candidate is validated as a brush; a degenerate or empty result is
 * rejected and the caller keeps the original brush. An accepted edit always
 * yields a valid convex brush, because half-space intersections are convex
 * by construction.
 */
export function moveVertices(
  brush: BrushNode,
  positions: readonly Vec3[],
  delta: Vec3,
): Result<BrushNode, VertexEditError> {
  const analysis = analyzeBrush(brush);
  if (!validateBrush(analysis).valid) return { ok: false, error: 'invalid-target' };

  const movedIndex = (point: Vec3): number =>
    positions.findIndex((pos) => distance(pos, point) <= POINT_EPS);
  const movedPos = new Map<number, Vec3>();
  for (const pos of positions) movedPos.set(movedIndex(pos), add(pos, delta));

  const faces: { points: [Vec3, Vec3, Vec3]; tex: FaceTexture }[] = [];
  for (let i = 0; i < brush.faces.length; i++) {
    const face = brush.faces[i]!;
    const loop = analysis.polygons[i];
    if (!loop) {
      faces.push({ points: face.points, tex: face.tex });
      continue;
    }
    const moveAt = loop.map((point) => movedIndex(point));
    const movingCount = moveAt.filter((index) => index >= 0).length;
    if (movingCount === 0) {
      faces.push({ points: face.points, tex: face.tex });
      continue;
    }
    const pointAfter = (k: number): Vec3 => {
      const mi = moveAt[k]!;
      return mi >= 0 ? movedPos.get(mi)! : loop[k]!;
    };
    if (movingCount === loop.length) {
      faces.push({
        points: [
          add(face.points[0], delta),
          add(face.points[1], delta),
          add(face.points[2], delta),
        ],
        tex: face.tex,
      });
      continue;
    }
    if (loop.length === 3) {
      const points: [Vec3, Vec3, Vec3] = [pointAfter(0), pointAfter(1), pointAfter(2)];
      if (!planeFromPoints(...points)) return { ok: false, error: 'degenerate-edit' };
      faces.push({ points, tex: face.tex });
      continue;
    }
    // BreakPlanes, sequential as in Qoole: each moving vertex is extracted
    // into a triangle through its current neighbours, in the order the moved
    // positions were given. Extraction stops when the residual loop becomes
    // a triangle; a residual triangle with moving vertices is recomputed
    // through the moved points, replacing the original plane, while an
    // unmoved residual keeps the original plane exactly.
    const resLoop: Vec3[] = loop.map((point) => [...point] as Vec3);
    const resMoving: boolean[] = loop.map((point) => movedIndex(point) >= 0);
    const extras: [Vec3, Vec3, Vec3][] = [];
    for (const pos of positions) {
      const k = resLoop.findIndex((point) => distance(pos, point) <= POINT_EPS);
      if (k < 0 || resLoop.length <= 3) continue;
      const after = (index: number): Vec3 => {
        const wrapped = (index + resLoop.length) % resLoop.length;
        return resMoving[wrapped] ? add(resLoop[wrapped]!, delta) : resLoop[wrapped]!;
      };
      const tri: [Vec3, Vec3, Vec3] = [after(k - 1), after(k), after(k + 1)];
      if (!planeFromPoints(...tri)) return { ok: false, error: 'degenerate-edit' };
      extras.push(tri);
      resLoop.splice(k, 1);
      resMoving.splice(k, 1);
    }
    if (resLoop.length === 3 && resMoving.some(Boolean)) {
      const tri: [Vec3, Vec3, Vec3] = [
        resMoving[0] ? add(resLoop[0]!, delta) : resLoop[0]!,
        resMoving[1] ? add(resLoop[1]!, delta) : resLoop[1]!,
        resMoving[2] ? add(resLoop[2]!, delta) : resLoop[2]!,
      ];
      if (!planeFromPoints(...tri)) return { ok: false, error: 'degenerate-edit' };
      faces.push({ points: tri, tex: face.tex });
    } else {
      faces.push({ points: face.points, tex: face.tex });
    }
    for (const tri of extras) faces.push({ points: tri, tex: face.tex });
  }

  const merged = mergePlanes(faces);
  const next: BrushNode = {
    ...brush,
    faces: merged.map((face) => ({ points: face.points, tex: face.tex })),
  };
  if (!validateBrush(analyzeBrush(next)).valid) return { ok: false, error: 'rejected' };
  return { ok: true, value: next };
}
