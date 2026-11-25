import type { FaceTexture, Plane, Vec3 } from '../types/index';

/**
 * The qbsp3 texture axis computation, ported exactly from
 * ext/Quake-2-Tools/bsp/qbsp3/textures.c (TextureAxisFromPlane and the vector
 * calculations of TexinfoForBrushTexture), verified against the C on
 * 24.11.2026.
 *
 * The result is in texel space: the texture coordinate of a world point p is
 * (dot(p, s) + shiftS) / textureWidth, and likewise for t. The division by
 * the texture's dimensions is the renderer's business, because the axes are
 * also used by texture lock, which works in texels.
 *
 * qbsp3 reads the offset and rotation values of a .map with atoi, so their
 * decimals are truncated. The editor shows what the game shows, so the
 * truncation is repeated here towards zero, as atoi does (spec, Texture
 * offset and rotation). The scale values are read with atof and keep their
 * decimals.
 */
export interface TexAxes {
  /** The s axis in world units per texel before the width division. */
  readonly s: Vec3;
  readonly t: Vec3;
  readonly shiftS: number;
  readonly shiftT: number;
}

/**
 * The six base orientations of textures.c: floor, ceiling, west, east,
 * south and north wall, each as the plane normal, the x vector and the y
 * vector of the unrotated texture space.
 */
const BASE_AXIS: readonly (readonly [number, number, number])[] = [
  [0, 0, 1],
  [1, 0, 0],
  [0, -1, 0], // floor
  [0, 0, -1],
  [1, 0, 0],
  [0, -1, 0], // ceiling
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, -1], // west wall
  [-1, 0, 0],
  [0, 1, 0],
  [0, 0, -1], // east wall
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, -1], // south wall
  [0, -1, 0],
  [1, 0, 0],
  [0, 0, -1], // north wall
];

function dot3(a: Vec3, b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export interface BaseOrientation {
  /** Index 0..5 in the qbsp3 base axis table. */
  readonly index: number;
  /** The unrotated s base vector, a signed unit axis. */
  readonly bs: Vec3;
  /** The unrotated t base vector, a signed unit axis. */
  readonly bt: Vec3;
  /** bs[sv]·bt[tv], the sign coupling of qbsp3's in-plane rotation. */
  readonly sigma: number;
}

/** The base orientation qbsp3 chooses for a plane normal, with its frame vectors. */
export function baseOrientationForNormal(n: Vec3): BaseOrientation {
  let best = 0;
  let bestAxis = 0;
  for (let i = 0; i < 6; i++) {
    const d = dot3(n, BASE_AXIS[i * 3]!);
    if (d > best) {
      best = d;
      bestAxis = i;
    }
  }
  const bs = [...BASE_AXIS[bestAxis * 3 + 1]!] as Vec3;
  const bt = [...BASE_AXIS[bestAxis * 3 + 2]!] as Vec3;
  const sv = bs[0] !== 0 ? 0 : bs[1] !== 0 ? 1 : 2;
  const tv = bt[0] !== 0 ? 0 : bt[1] !== 0 ? 1 : 2;
  return { index: bestAxis, bs, bt, sigma: bs[sv]! * bt[tv]! };
}

/** The texture axes of a face, exactly as qbsp3 computes them. */
export function texAxes(
  plane: Plane,
  tex: Pick<FaceTexture, 'offset' | 'rotation' | 'scale'>,
): TexAxes {
  // TextureAxisFromPlane: the base orientation whose normal has the largest
  // dot product with the plane normal. The strict comparison keeps the
  // first orientation on ties, exactly like the C.
  let best = 0;
  let bestAxis = 0;
  for (let i = 0; i < 6; i++) {
    const d = dot3(plane.n, BASE_AXIS[i * 3]!);
    if (d > best) {
      best = d;
      bestAxis = i;
    }
  }
  const vecs: [number, number, number][] = [
    [...BASE_AXIS[bestAxis * 3 + 1]!],
    [...BASE_AXIS[bestAxis * 3 + 2]!],
  ];

  const rotate = Math.trunc(tex.rotation);
  let sinv: number;
  let cosv: number;
  if (rotate === 0) {
    sinv = 0;
    cosv = 1;
  } else if (rotate === 90) {
    sinv = 1;
    cosv = 0;
  } else if (rotate === 180) {
    sinv = 0;
    cosv = -1;
  } else if (rotate === 270) {
    sinv = -1;
    cosv = 0;
  } else {
    const ang = (rotate / 180) * Math.PI;
    sinv = Math.sin(ang);
    cosv = Math.cos(ang);
  }

  // The indices of the nonzero component of each base axis vector.
  const sv = vecs[0]![0] !== 0 ? 0 : vecs[0]![1] !== 0 ? 1 : 2;
  const tv = vecs[1]![0] !== 0 ? 0 : vecs[1]![1] !== 0 ? 1 : 2;

  for (let i = 0; i < 2; i++) {
    const vec = vecs[i]!;
    const ns = cosv * vec[sv]! - sinv * vec[tv]!;
    const nt = sinv * vec[sv]! + cosv * vec[tv]!;
    vec[sv] = ns;
    vec[tv] = nt;
  }

  const scaleS = tex.scale[0] === 0 ? 1 : tex.scale[0];
  const scaleT = tex.scale[1] === 0 ? 1 : tex.scale[1];
  const s: Vec3 = [vecs[0]![0]! / scaleS, vecs[0]![1]! / scaleS, vecs[0]![2]! / scaleS];
  const t: Vec3 = [vecs[1]![0]! / scaleT, vecs[1]![1]! / scaleT, vecs[1]![2]! / scaleT];

  // The origin shift of TexinfoForBrushTexture is zero in the editor: the
  // editor's coordinates are world coordinates without entity origins.
  return { s, t, shiftS: Math.trunc(tex.offset[0]), shiftT: Math.trunc(tex.offset[1]) };
}

/** The texture coordinates of a world point, uv in texture space 0..1. */
export function uvForPoint(
  point: Vec3,
  axes: TexAxes,
  textureWidth: number,
  textureHeight: number,
): readonly [number, number] {
  return [
    (point[0] * axes.s[0] + point[1] * axes.s[1] + point[2] * axes.s[2] + axes.shiftS) /
      textureWidth,
    (point[0] * axes.t[0] + point[1] * axes.t[1] + point[2] * axes.t[2] + axes.shiftT) /
      textureHeight,
  ];
}
