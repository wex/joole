import type { BrushNode, Face, FaceTexture, Plane, Result, Vec3 } from '@core/types/index';
import { analyzeBrush, validateBrush } from './brush';
import { PLANE_EPS, POINT_EPS } from './constants';
import { planeFromPoints } from './plane';
import { baseWindingForPlane } from './winding';
import { cross, distance, dot, length, sub } from './vec3';

export type CsgError = 'invalid-target' | 'invalid-cutter' | 'invalid-result';

function faceFromPlane(plane: Plane, tex: FaceTexture): Face {
  const winding = baseWindingForPlane(plane);
  return { points: [winding[0]!, winding[1]!, winding[2]!], tex: { ...tex } };
}

function reversePlane(plane: Plane): Plane {
  return { n: [-plane.n[0], -plane.n[1], -plane.n[2]], d: -plane.d };
}

function samePlane(a: Plane, b: Plane): boolean {
  return distance(a.n, b.n) <= PLANE_EPS && Math.abs(a.d - b.d) <= PLANE_EPS;
}

function nonCollinearTriple(polygon: Vec3[]): [Vec3, Vec3, Vec3] | null {
  for (let i = 0; i < polygon.length; i++) {
    for (let j = i + 1; j < polygon.length; j++) {
      for (let k = j + 1; k < polygon.length; k++) {
        const a = polygon[i]!;
        const b = polygon[j]!;
        const c = polygon[k]!;
        const normal = cross(sub(a, b), sub(c, b));
        if (length(normal) > POINT_EPS * POINT_EPS) {
          return [[...a] as Vec3, [...b] as Vec3, [...c] as Vec3];
        }
      }
    }
  }
  return null;
}

/**
 * Rewrites every face definition using vertices of its derived polygon and
 * drops faces that became redundant. Returns null for empty geometry.
 */
function tightBrush(brush: BrushNode): BrushNode | null {
  const analysis = analyzeBrush(brush);
  if (analysis.volume <= PLANE_EPS) return null;
  const faces: Face[] = [];
  for (let i = 0; i < brush.faces.length; i++) {
    const polygon = analysis.polygons[i];
    if (!polygon) continue;
    const triple = nonCollinearTriple(polygon);
    if (!triple || !planeFromPoints(...triple)) continue;
    faces.push({ points: triple, tex: { ...brush.faces[i]!.tex } });
  }
  if (faces.length < 4) return null;
  const tight: BrushNode = { ...brush, faces };
  const tightened = analyzeBrush(tight);
  return validateBrush(tightened).valid ? tight : null;
}

/** Intersects a brush with the half-space behind `plane`; the cut face receives `tex`. */
function intersectHalfspace(brush: BrushNode, plane: Plane, tex: FaceTexture): BrushNode | null {
  const planes = brush.faces.map((face) => planeFromPoints(...face.points));
  if (planes.some((existing) => existing && samePlane(existing, plane))) {
    return tightBrush(brush);
  }
  return tightBrush({ ...brush, faces: [...brush.faces, faceFromPlane(plane, tex)] });
}

/**
 * Subtracts `cutter` from `target` using the spec's plane-splitting CSG
 * algorithm. The returned fragments partition target minus cutter; faces
 * created by cutter planes inherit that cutter face's texture parameters.
 */
export function subtractBrush(target: BrushNode, cutter: BrushNode): Result<BrushNode[], CsgError> {
  if (!validateBrush(analyzeBrush(target)).valid) return { ok: false, error: 'invalid-target' };
  const cutterAnalysis = analyzeBrush(cutter);
  if (!validateBrush(cutterAnalysis).valid) return { ok: false, error: 'invalid-cutter' };

  const output: BrushNode[] = [];
  let inside: BrushNode | null = target;
  for (let i = 0; i < cutter.faces.length && inside; i++) {
    const plane = cutterAnalysis.planes[i];
    if (!plane) return { ok: false, error: 'invalid-cutter' };
    const tex = cutter.faces[i]!.tex;
    const outside = intersectHalfspace(inside, reversePlane(plane), tex);
    if (outside) output.push(outside);
    inside = intersectHalfspace(inside, plane, tex);
  }

  if (output.some((brush) => !validateBrush(analyzeBrush(brush)).valid)) {
    return { ok: false, error: 'invalid-result' };
  }
  return { ok: true, value: output };
}

/** Used by volume tests: every point is classified as outside when it is in front of at least one cutter plane. */
export function insideConvexPlanes(point: Vec3, planes: readonly Plane[]): boolean {
  return planes.every((plane) => dot(point, plane.n) - plane.d < -PLANE_EPS);
}
