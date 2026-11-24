import type { Vec3 } from '@core/types/index';

export function vec3(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function negate(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]];
}

/** a + b * s, VectorMA in mathlib.c. */
export function ma(a: Vec3, b: Vec3, s: number): Vec3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/** Returns the zero vector for a zero-length input, like VectorNormalize. */
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len === 0) {
    return [0, 0, 0];
  }
  return scale(a, 1 / len);
}

export function equalsWithin(a: Vec3, b: Vec3, eps: number): boolean {
  return distance(a, b) <= eps;
}
