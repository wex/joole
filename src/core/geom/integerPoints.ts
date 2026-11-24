import type { BrushNode, Vec3 } from '@core/types/index';
import { analyzeBrush, validateBrush } from './brush';
import { planeFromPoints } from './plane';
import { dot } from './vec3';
import { POINT_EPS } from './constants';

export interface IntegerConversion {
  /** The converted brush, or the input brush unchanged when conversion failed. */
  brush: BrushNode;
  /** False when the brush was already integer or conversion failed. */
  converted: boolean;
  warnings: string[];
}

function isIntegerPoints(points: readonly (readonly number[])[]): boolean {
  return points.every((p) => p.every((c) => Number.isInteger(c)));
}

function roundPoint(p: Vec3): Vec3 {
  return [Math.round(p[0]), Math.round(p[1]), Math.round(p[2])];
}

/**
 * Converts a brush's face points to integers for .map export, following
 * the spec's Integer plane points rule: each face's polygon vertices are
 * rounded, the non-collinear triple whose plane deviates least from the
 * original is chosen in the original winding order, and the rebuilt brush
 * must stay valid. A brush whose conversion breaks is returned unchanged
 * with a warning naming it; a conversion that merely moves vertices by
 * more than POINT_EPS is used anyway, since it is strictly closer than
 * the truncation the original qbsp3 would apply, and the warning is
 * raised for the user as the spec requires (verified reading on 24.11.2026).
 */
export function convertBrushToIntegerPoints(brush: BrushNode): IntegerConversion {
  const warnings: string[] = [];
  if (brush.faces.every((face) => isIntegerPoints(face.points))) {
    return { brush, converted: false, warnings };
  }

  const original = analyzeBrush(brush);
  if (!validateBrush(original).valid) {
    warnings.push(`brush ${brush.id}: not converted, the brush is invalid`);
    return { brush, converted: false, warnings };
  }

  const newFaces: BrushNode['faces'] = [];
  for (const [faceIndex, face] of brush.faces.entries()) {
    const polygon = original.polygons[faceIndex];
    const plane = original.planes[faceIndex];
    if (!polygon || !plane) {
      warnings.push(`brush ${brush.id}: not converted, the brush is invalid`);
      return { brush, converted: false, warnings };
    }
    const rounded = polygon.map(roundPoint);
    // pick the triple whose plane deviates least from the original,
    // measured as the worst distance of the polygon's original vertices
    // to the candidate plane
    let best: { points: [Vec3, Vec3, Vec3]; deviation: number } | null = null;
    for (let i = 0; i < rounded.length; i++) {
      for (let j = i + 1; j < rounded.length; j++) {
        for (let k = j + 1; k < rounded.length; k++) {
          const a = rounded[i]!;
          const b = rounded[j]!;
          const c = rounded[k]!;
          let triple: [Vec3, Vec3, Vec3] = [a, b, c];
          let candidate = planeFromPoints(...triple);
          if (!candidate) {
            continue;
          }
          // keep the original winding order: the normal must point outwards
          if (dot(candidate.n, plane.n) < 0) {
            triple = [a, c, b];
            candidate = planeFromPoints(...triple);
            if (!candidate) {
              continue;
            }
          }
          let deviation = 0;
          for (const v of polygon) {
            deviation = Math.max(deviation, Math.abs(dot(v, candidate.n) - candidate.d));
          }
          if (!best || deviation < best.deviation) {
            best = { points: triple, deviation };
          }
        }
      }
    }
    if (!best) {
      warnings.push(`brush ${brush.id}: not converted, face ${faceIndex} has no integer plane`);
      return { brush, converted: false, warnings };
    }
    newFaces.push({ points: best.points, tex: face.tex });
  }

  const rebuilt: BrushNode = { ...brush, faces: newFaces };
  const analysis = analyzeBrush(rebuilt);
  if (!validateBrush(analysis).valid) {
    warnings.push(`brush ${brush.id}: not converted, the integer brush is invalid`);
    return { brush, converted: false, warnings };
  }

  // bidirectional nearest-neighbour distance of the polygon vertices
  function verticesOf(polygons: (Vec3[] | null)[]): Vec3[] {
    return polygons.filter((p): p is Vec3[] => p !== null).flat();
  }
  function nearest(p: Vec3, others: Vec3[]): number {
    let min = Infinity;
    for (const q of others) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      min = Math.min(min, d);
    }
    return min;
  }
  const before = verticesOf(original.polygons);
  const after = verticesOf(analysis.polygons);
  let moved = 0;
  for (const v of before) {
    moved = Math.max(moved, nearest(v, after));
  }
  for (const v of after) {
    moved = Math.max(moved, nearest(v, before));
  }
  // a valid integer conversion is always used: it is strictly closer to
  // the original than the truncation the original qbsp3 would apply to
  // decimal points. Moving more than POINT_EPS only raises the warning
  // the spec requires before export.
  if (moved > POINT_EPS) {
    warnings.push(`brush ${brush.id}: vertices move by ${moved.toFixed(4)} in integer conversion`);
  }

  return { brush: rebuilt, converted: true, warnings };
}
