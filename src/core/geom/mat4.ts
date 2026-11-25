import type { Vec3 } from '@core/types/index';

/** Row-major 4×4 matrix, float64. */
export type Mat4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export function mat4Identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Matrix product a·b: applying b first, then a. */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[row * 4 + k]! * b[k * 4 + col]!;
      }
      out[row * 4 + col] = sum;
    }
  }
  return out as unknown as Mat4;
}

/** Applies the matrix to a point with w = 1 and divides by the resulting w. */
export function mat4ApplyPoint(m: Mat4, p: Vec3): Vec3 {
  const x = m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3];
  const y = m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7];
  const z = m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11];
  const w = m[12] * p[0] + m[13] * p[1] + m[14] * p[2] + m[15];
  return [x / w, y / w, z / w];
}

export function mat4Translation(offset: Vec3): Mat4 {
  return [1, 0, 0, offset[0], 0, 1, 0, offset[1], 0, 0, 1, offset[2], 0, 0, 0, 1];
}

export function mat4Scaling(factors: Vec3): Mat4 {
  return [factors[0], 0, 0, 0, 0, factors[1], 0, 0, 0, 0, factors[2], 0, 0, 0, 0, 1];
}

export function mat4RotationX(degrees: number): Mat4 {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}

export function mat4RotationY(degrees: number): Mat4 {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
}

export function mat4RotationZ(degrees: number): Mat4 {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Inverts an affine matrix whose bottom row is [0 0 0 1]. Returns null for a
 * singular linear part. Projective matrices are not needed for brush editing.
 */
export function mat4Invert(m: Mat4): Mat4 | null {
  const a = m[0];
  const b = m[1];
  const c = m[2];
  const d = m[4];
  const e = m[5];
  const f = m[6];
  const g = m[8];
  const h = m[9];
  const i = m[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-15) {
    return null;
  }
  const invDet = 1 / det;
  const ia = (e * i - f * h) * invDet;
  const ib = (c * h - b * i) * invDet;
  const ic = (b * f - c * e) * invDet;
  const id = (f * g - d * i) * invDet;
  const ie = (a * i - c * g) * invDet;
  const if_ = (c * d - a * f) * invDet;
  const ig = (d * h - e * g) * invDet;
  const ih = (b * g - a * h) * invDet;
  const ii = (a * e - b * d) * invDet;
  const tx = m[3];
  const ty = m[7];
  const tz = m[11];
  return [
    ia,
    ib,
    ic,
    -(ia * tx + ib * ty + ic * tz),
    id,
    ie,
    if_,
    -(id * tx + ie * ty + if_ * tz),
    ig,
    ih,
    ii,
    -(ig * tx + ih * ty + ii * tz),
    0,
    0,
    0,
    1,
  ];
}
