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
