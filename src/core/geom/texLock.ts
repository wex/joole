import type { BrushNode, FaceTexture, Plane, Result, Vec3 } from '@core/types/index';
import { analyzeBrush, validateBrush } from './brush';
import { planeFromPoints } from './plane';
import { baseOrientationForNormal, texAxes } from './texAxes';
import { mat4ApplyPoint, mat4Invert, type Mat4 } from './mat4';
import { dot } from './vec3';
import type { TransformError } from './transform';

export interface TextureLockSolve {
  readonly tex: FaceTexture;
  /** Worst texture displacement over the face's vertices, in texels. */
  readonly errorTexels: number;
}

/** Inverse-transpose application of the linear part of `inv` to a direction vector. */
function applyInverseTranspose(inv: Mat4, v: Vec3): Vec3 {
  return [
    inv[0]! * v[0] + inv[4]! * v[1] + inv[8]! * v[2],
    inv[1]! * v[0] + inv[5]! * v[1] + inv[9]! * v[2],
    inv[2]! * v[0] + inv[6]! * v[1] + inv[10]! * v[2],
  ];
}

/**
 * Solves new qbsp3 texture parameters after a transform, following the
 * approach of Qoole's `FaceTex::Transform` adapted to qbsp3's parameter form
 * (spec, Texture lock): the old axes are transformed with the inverse
 * transpose of the matrix so that texture coordinates of corresponding
 * points stay constant, then rotation and scale are solved in the new base
 * frame and offsets from the face's reference point. Rotation and offsets
 * are quantised to integers, because qbsp3 truncates them and the editor's
 * own operations always produce integers. The residual is the texture lock
 * error, measured in texels over the given sample points.
 */
export function solveTextureLock(
  oldPlane: Plane,
  tex: FaceTexture,
  matrix: Mat4,
  newPlane: Plane,
  samples: readonly Vec3[],
): TextureLockSolve {
  const inv = mat4Invert(matrix);
  const oldAxes = texAxes(oldPlane, tex);
  if (!inv) {
    return { tex, errorTexels: Infinity };
  }
  const sT = applyInverseTranspose(inv, oldAxes.s);
  const tT = applyInverseTranspose(inv, oldAxes.t);

  const frame = baseOrientationForNormal(newPlane.n);
  const sigma = frame.sigma;
  const u1 = dot(sT, frame.bs);
  const u2 = dot(sT, frame.bt);
  const w1 = dot(tT, frame.bs);
  const w2 = dot(tT, frame.bt);
  const sMag = Math.hypot(u1, u2);
  const tMag = Math.hypot(w1, w2);

  const rotationRad = Math.atan2(sigma * u2, u1);
  const rotation =
    sMag < 1e-12 ? Math.trunc(tex.rotation) : Math.round((rotationRad * 180) / Math.PI);
  const scaleS = sMag < 1e-12 ? tex.scale[0] : 1 / sMag;
  // The handedness correction of Qoole's DeriveCoordSys: the rotation form
  // fixes the direction of t up to sign, and a negative scale flips it back.
  const sinv = Math.sin(rotationRad);
  const cosv = Math.cos(rotationRad);
  const aimT = -sigma * sinv * w1 + cosv * w2;
  const scaleT = tMag < 1e-12 ? tex.scale[1] : (aimT < 0 ? -1 : 1) / tMag;

  // First pass with unquantised offsets: the shifts that anchor the texture
  // exactly at the centroid of the samples, then quantised to integers.
  const centroid: Vec3 = [0, 0, 0];
  for (const p of samples) {
    centroid[0] += p[0] / Math.max(1, samples.length);
    centroid[1] += p[1] / Math.max(1, samples.length);
    centroid[2] += p[2] / Math.max(1, samples.length);
  }
  const centroidNew = mat4ApplyPoint(matrix, centroid);

  const candidate: FaceTexture = { ...tex, rotation, scale: [scaleS, scaleT] };
  const achieved = texAxes(newPlane, candidate);
  const shiftS = dot(centroid, oldAxes.s) + oldAxes.shiftS - dot(centroidNew, achieved.s);
  const shiftT = dot(centroid, oldAxes.t) + oldAxes.shiftT - dot(centroidNew, achieved.t);

  const solved: FaceTexture = {
    ...candidate,
    offset: [Math.round(shiftS), Math.round(shiftT)],
  };
  const final = texAxes(newPlane, solved);

  // The error: ideal locked coordinates versus achieved, in texels.
  let errorTexels = 0;
  for (const p of samples) {
    const pNew = mat4ApplyPoint(matrix, p);
    const du = dot(p, oldAxes.s) + oldAxes.shiftS - (dot(pNew, final.s) + final.shiftS);
    const dv = dot(p, oldAxes.t) + oldAxes.shiftT - (dot(pNew, final.t) + final.shiftT);
    errorTexels = Math.max(errorTexels, Math.hypot(du, dv));
  }
  return { tex: solved, errorTexels };
}

export interface TextureLockTransform {
  readonly brush: BrushNode;
  readonly maxErrorTexels: number;
  /** Indices of faces whose error exceeds the 0.5-texel limit. */
  readonly flaggedFaces: readonly number[];
}

/** The texture lock error limit of the spec, in texels. */
export const TEXTURE_LOCK_ERROR_LIMIT = 0.5;

/**
 * transformBrush with texture lock: every face's texture parameters are
 * solved so the texture sticks to the surface. Faces over the error limit
 * are reported for the warning.
 */
export function transformBrushTextureLock(
  brush: BrushNode,
  matrix: Mat4,
): Result<TextureLockTransform, TransformError> {
  const analysis = analyzeBrush(brush);
  const faces = brush.faces.map((face, i) => {
    const oldPlane = planeFromPoints(...face.points);
    const points: [Vec3, Vec3, Vec3] = [
      mat4ApplyPoint(matrix, face.points[0]),
      mat4ApplyPoint(matrix, face.points[1]),
      mat4ApplyPoint(matrix, face.points[2]),
    ];
    const newPlane = planeFromPoints(...points);
    if (!oldPlane || !newPlane) {
      return { points, tex: face.tex, error: 0 };
    }
    const samples = analysis.polygons[i] ?? [oldPlane.n.map((x) => x * oldPlane.d) as Vec3];
    const solved = solveTextureLock(oldPlane, face.tex, matrix, newPlane, samples);
    return { points, tex: solved.tex, error: solved.errorTexels };
  });
  const next: BrushNode = {
    ...brush,
    faces: faces.map((face) => ({ points: face.points, tex: face.tex })),
  };
  if (!validateBrush(analyzeBrush(next)).valid) {
    return { ok: false, error: 'invalid-brush' };
  }
  const flaggedFaces: number[] = [];
  let maxErrorTexels = 0;
  faces.forEach((face, i) => {
    maxErrorTexels = Math.max(maxErrorTexels, face.error);
    if (face.error > TEXTURE_LOCK_ERROR_LIMIT) {
      flaggedFaces.push(i);
    }
  });
  return { ok: true, value: { brush: next, maxErrorTexels, flaggedFaces } };
}
