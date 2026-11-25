import type { BrushNode, Result, Vec3 } from '@core/types/index';
import { analyzeBrush, validateBrush } from './brush';
import { mat4ApplyPoint, type Mat4 } from './mat4';

export type TransformError = 'invalid-brush';

function transformed(
  brush: BrushNode,
  transformPoint: (point: Vec3) => Vec3,
): Result<BrushNode, TransformError> {
  const next: BrushNode = {
    ...brush,
    faces: brush.faces.map((face) => ({
      ...face,
      points: [
        transformPoint(face.points[0]),
        transformPoint(face.points[1]),
        transformPoint(face.points[2]),
      ],
    })),
  };
  return validateBrush(analyzeBrush(next)).valid
    ? { ok: true, value: next }
    : { ok: false, error: 'invalid-brush' };
}

function noNegZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * Applies an affine matrix to every face point. Texture parameters are
 * deliberately unchanged until texture lock arrives in P3.7.
 */
export function transformBrush(brush: BrushNode, matrix: Mat4): Result<BrushNode, TransformError> {
  return transformed(brush, (point) => mat4ApplyPoint(matrix, point));
}

/** Explicit Snap to grid: rounds every face point and validates the result. */
export function snapBrushToGrid(brush: BrushNode, grid: number): Result<BrushNode, TransformError> {
  return transformed(brush, (point) => [
    Math.round(point[0] / grid) * grid,
    Math.round(point[1] / grid) * grid,
    Math.round(point[2] / grid) * grid,
  ]);
}

/**
 * Mirrors the brush across the axis-aligned plane `x[axis] = center`. Unlike a
 * negative scale matrix, this swaps two face points so the winding — and thus
 * the outward normals — stays correct.
 */
export function flipBrush(
  brush: BrushNode,
  axis: 0 | 1 | 2,
  center = 0,
): Result<BrushNode, TransformError> {
  const next: BrushNode = {
    ...brush,
    faces: brush.faces.map((face) => {
      const flip = (point: Vec3): Vec3 => {
        const out = [...point] as Vec3;
        out[axis] = noNegZero(2 * center - out[axis]);
        return out;
      };
      return {
        ...face,
        points: [flip(face.points[0]), flip(face.points[2]), flip(face.points[1])],
      };
    }),
  };
  return validateBrush(analyzeBrush(next)).valid
    ? { ok: true, value: next }
    : { ok: false, error: 'invalid-brush' };
}

/**
 * Rotates the brush exactly 90° counterclockwise about the Z axis through
 * `center`. The exact permutation keeps integer plane points integral, unlike
 * a trigonometric rotation matrix.
 */
export function rotate90Brush(
  brush: BrushNode,
  center: readonly [number, number],
): Result<BrushNode, TransformError> {
  const [cx, cy] = center;
  return transformed(brush, (point) => [cx - (point[1] - cy), cy + (point[0] - cx), point[2]]);
}
