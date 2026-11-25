import type { BrushNode, Face, FaceTexture, Plane, Result, Vec3 } from '@core/types/index';
import { analyzeBrush, validateBrush } from './brush';
import { PLANE_EPS, POINT_EPS } from './constants';
import { planeFromPoints } from './plane';
import { baseWindingForPlane } from './winding';
import { cross, distance, dot, length, normalize, sub } from './vec3';

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

export type ClipSide = 'front' | 'back' | 'both';

/** Clips a brush to one side of a plane. `front` keeps the positive-normal side. */
export function clipBrush(
  brush: BrushNode,
  plane: Plane,
  tex: FaceTexture,
  side: 'front' | 'back',
): Result<BrushNode | null, CsgError> {
  if (!validateBrush(analyzeBrush(brush)).valid) return { ok: false, error: 'invalid-target' };
  const clipped = intersectHalfspace(brush, side === 'front' ? reversePlane(plane) : plane, tex);
  return { ok: true, value: clipped };
}

/**
 * Builds the clipping plane defined by two points in a 2D view plus that
 * view's depth axis. The positive side is determined by the line direction;
 * Tab in the Clip tool can always select the other side.
 */
export function clipPlaneFromPoints(
  first: Vec3,
  second: Vec3,
  view: 'xy' | 'xz' | 'yz',
): Plane | null {
  const depth = view === 'xy' ? 2 : view === 'yz' ? 0 : 1;
  const along = sub(second, first);
  const depthVector: Vec3 = [0, 0, 0];
  depthVector[depth] = 1;
  const n = normalize(cross(along, depthVector));
  if (length(n) <= PLANE_EPS) return null;
  return { n, d: dot(first, n) };
}

export type HollowDirection = 'inward' | 'outward';

function offsetBrushPlanes(brush: BrushNode, amount: number): BrushNode {
  return {
    ...brush,
    faces: brush.faces.map((face) => {
      const plane = planeFromPoints(...face.points);
      if (!plane)
        return {
          ...face,
          points: face.points.map((point) => [...point] as Vec3) as Face['points'],
        };
      return {
        tex: { ...face.tex },
        points: face.points.map((point) => [
          point[0] + plane.n[0]! * amount,
          point[1] + plane.n[1]! * amount,
          point[2] + plane.n[2]! * amount,
        ]) as Face['points'],
      };
    }),
  };
}

/**
 * Creates a shell by subtraction. Inward hollowing removes a copy shrunk by
 * the thickness; outward hollowing removes the original from an expanded copy.
 */
export function hollowBrush(
  brush: BrushNode,
  thickness = 8,
  direction: HollowDirection = 'inward',
): Result<BrushNode[], CsgError> {
  if (!Number.isFinite(thickness) || thickness <= 0) return { ok: false, error: 'invalid-target' };
  if (!validateBrush(analyzeBrush(brush)).valid) return { ok: false, error: 'invalid-target' };
  return direction === 'inward'
    ? subtractBrush(brush, offsetBrushPlanes(brush, -thickness))
    : subtractBrush(offsetBrushPlanes(brush, thickness), brush);
}

/**
 * Intersects convex brushes by merging their plane sets. Faces made redundant
 * by the intersection are dropped. Returns null-valued output as an error when
 * the intersection is empty.
 */
export function intersectBrushes(brushes: readonly BrushNode[]): Result<BrushNode, CsgError> {
  if (brushes.length === 0) return { ok: false, error: 'invalid-target' };
  for (const brush of brushes) {
    if (!validateBrush(analyzeBrush(brush)).valid) return { ok: false, error: 'invalid-target' };
  }
  const first = brushes[0]!;
  const seen: Plane[] = [];
  const faces: Face[] = [];
  for (const brush of brushes) {
    for (const face of brush.faces) {
      const plane = planeFromPoints(...face.points);
      if (!plane) return { ok: false, error: 'invalid-target' };
      if (seen.some((existing) => samePlane(existing, plane))) continue;
      seen.push(plane);
      faces.push({
        points: face.points.map((point) => [...point] as Vec3) as Face['points'],
        tex: { ...face.tex },
      });
    }
  }
  const merged: BrushNode = { ...first, faces };
  const tight = tightBrush(merged);
  if (!tight) return { ok: false, error: 'invalid-result' };
  return { ok: true, value: tight };
}

/** Used by volume tests: every point is classified as outside when it is in front of at least one cutter plane. */
export function insideConvexPlanes(point: Vec3, planes: readonly Plane[]): boolean {
  return planes.every((plane) => dot(point, plane.n) - plane.d < -PLANE_EPS);
}
