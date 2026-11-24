import type { Plane, Vec3 } from '@core/types/index';
import { BASE_WINDING_SIZE, PLANE_EPS } from './constants';
import { add, cross, dot, ma, normalize, scale, sub } from './vec3';

/**
 * A large square on the plane, after BaseWindingForPlane in
 * ext/Quake-2-Tools/common/polylib.c. The point order is clockwise when
 * viewed from the front (normal side), the Quake winding convention.
 */
export function baseWindingForPlane(plane: Plane): Vec3[] {
  const { n: normal, d: dist } = plane;

  // find the major axis
  let max = -1;
  let x = -1;
  for (let i = 0; i < 3; i++) {
    const v = Math.abs(normal[i]!);
    if (v > max) {
      x = i;
      max = v;
    }
  }

  let vup: Vec3 = [0, 0, 0];
  switch (x) {
    case 0:
    case 1:
      vup[2] = 1;
      break;
    default:
      vup[0] = 1;
      break;
  }

  vup = normalize(ma(vup, normal, -dot(vup, normal)));

  const org = scale(normal, dist);
  const vright = cross(vup, normal);

  vup = scale(vup, BASE_WINDING_SIZE);
  const vr = scale(vright, BASE_WINDING_SIZE);

  // project a really big axis-aligned box onto the plane
  return [
    add(sub(org, vr), vup),
    add(add(org, vr), vup),
    sub(add(org, vr), vup),
    sub(sub(org, vr), vup),
  ];
}

export interface SplitWinding {
  /** The fragment in front of the plane, or null when empty. */
  front: Vec3[] | null;
  /** The fragment behind the plane, or null when empty. */
  back: Vec3[] | null;
}

const SIDE_FRONT = 0;
const SIDE_BACK = 1;
const SIDE_ON = 2;

/**
 * Splits a winding by a plane, after ClipWindingEpsilon in
 * ext/Quake-2-Tools/common/polylib.c. Points within epsilon of the plane
 * are kept on both fragments, exactly as SIDE_ON points are in polylib.
 */
export function splitWinding(
  points: Vec3[],
  plane: Plane,
  epsilon: number = PLANE_EPS,
): SplitWinding {
  const count = points.length;
  const dists = new Array<number>(count + 1);
  const sides = new Array<number>(count + 1);
  const counts = [0, 0, 0];

  for (let i = 0; i < count; i++) {
    const dist = dot(points[i]!, plane.n) - plane.d;
    dists[i] = dist;
    if (dist > epsilon) {
      sides[i] = SIDE_FRONT;
    } else if (dist < -epsilon) {
      sides[i] = SIDE_BACK;
    } else {
      sides[i] = SIDE_ON;
    }
    counts[sides[i]!]!++;
  }
  sides[count] = sides[0]!;
  dists[count] = dists[0]!;

  const copy = () => points.map((p) => [...p] as Vec3);
  if (counts[SIDE_FRONT] === 0) {
    return { front: null, back: copy() };
  }
  if (counts[SIDE_BACK] === 0) {
    return { front: copy(), back: null };
  }

  const front: Vec3[] = [];
  const back: Vec3[] = [];

  for (let i = 0; i < count; i++) {
    const p1 = points[i]!;
    const side = sides[i]!;

    if (side === SIDE_ON) {
      front.push([...p1]);
      back.push([...p1]);
      continue;
    }
    if (side === SIDE_FRONT) {
      front.push([...p1]);
    } else {
      back.push([...p1]);
    }

    const nextSide = sides[i + 1]!;
    if (nextSide === SIDE_ON || nextSide === side) {
      continue;
    }

    // generate a split point
    const p2 = points[(i + 1) % count]!;
    const t = dists[i]! / (dists[i]! - dists[i + 1]!);
    const mid: Vec3 = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      // avoid round-off error when possible
      if (plane.n[j] === 1) {
        mid[j] = plane.d;
      } else if (plane.n[j] === -1) {
        mid[j] = -plane.d;
      } else {
        mid[j] = p1[j]! + t * (p2[j]! - p1[j]!);
      }
    }
    front.push([...mid]);
    back.push([...mid]);
  }

  return { front, back };
}
