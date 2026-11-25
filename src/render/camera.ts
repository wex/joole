import { cross, dot, normalize, sub } from '@core/geom/index';
import type { Mat4 } from '@core/geom/index';
import { mat4Multiply } from '@core/geom/index';
import type { Vec3 } from '@core/types/index';

/** The projection plane of a 2D view. */
export type OrthoAxis = 'xy' | 'xz' | 'yz';

/** A 2D view's camera: the world point at the view's centre and the zoom. */
export interface OrthoCamera {
  readonly kind: 'ortho';
  readonly axis: OrthoAxis;
  readonly center: Vec3;
  /** Device pixels per world unit. */
  readonly zoom: number;
}

/**
 * The 3D view's fly camera. Yaw is measured from +X towards +Y and pitch
 * from the horizontal upwards, both in degrees, as in Quake (Z is up).
 */
export interface PerspectiveCamera {
  readonly kind: 'perspective';
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  /** Vertical field of view in degrees. */
  readonly fovY: number;
  readonly near: number;
  readonly far: number;
}

export type Camera = OrthoCamera | PerspectiveCamera;

export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

/**
 * The screen axes of the 2D views, the Radiant convention (24.11.2026):
 * Top looks down with +X right and +Y up, Front looks along +Y with +X right
 * and +Z up, and Side looks along -X with +Y right and +Z up. In every view
 * right × up points towards the viewer, so no view is mirrored.
 */
export function orthoBasis(axis: OrthoAxis): { right: Vec3; up: Vec3; forward: Vec3 } {
  switch (axis) {
    case 'xy':
      return { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] };
    case 'xz':
      return { right: [1, 0, 0], up: [0, 0, 1], forward: [0, 1, 0] };
    case 'yz':
      return { right: [0, 1, 0], up: [0, 0, 1], forward: [-1, 0, 0] };
  }
}

/** The unit view direction of a yaw and pitch in degrees. */
export function forwardFromAngles(yaw: number, pitch: number): Vec3 {
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p)];
}

/** The largest pitch the fly camera accepts; beyond it, "right" degenerates. */
export const MAX_PITCH = 89;

/** A right-handed view matrix: camera space looks down -Z with +Y up. */
function viewMatrix(eye: Vec3, right: Vec3, up: Vec3, forward: Vec3): Mat4 {
  const back: Vec3 = [-forward[0], -forward[1], -forward[2]];
  return [
    right[0],
    right[1],
    right[2],
    -dot(right, eye),
    up[0],
    up[1],
    up[2],
    -dot(up, eye),
    back[0],
    back[1],
    back[2],
    -dot(back, eye),
    0,
    0,
    0,
    1,
  ];
}

/** The depth range of the 2D views in world units on each side of the centre. */
const ORTHO_DEPTH = 65536;

/** The row-major view-projection matrix of a camera for a viewport size. */
export function viewProjection(camera: Camera, width: number, height: number): Mat4 {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (camera.kind === 'ortho') {
    const { right, up, forward } = orthoBasis(camera.axis);
    const view = viewMatrix(camera.center, right, up, forward);
    const sx = (2 * camera.zoom) / w;
    const sy = (2 * camera.zoom) / h;
    const sz = -1 / ORTHO_DEPTH;
    const projection: Mat4 = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
    return mat4Multiply(projection, view);
  }
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, camera.pitch));
  const forward = forwardFromAngles(camera.yaw, pitch);
  const right = normalize(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  const view = viewMatrix(camera.position, right, up, forward);
  const f = 1 / Math.tan((camera.fovY * Math.PI) / 360);
  const { near, far } = camera;
  const projection: Mat4 = [
    f / (w / h),
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    (2 * far * near) / (near - far),
    0,
    0,
    -1,
    0,
  ];
  return mat4Multiply(projection, view);
}

/** A row-major matrix as the column-major Float32Array WebGL expects. */
export function toGlMatrix(m: Mat4, out = new Float32Array(16)): Float32Array {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[col * 4 + row] = m[row * 4 + col]!;
    }
  }
  return out;
}

/** A clip plane a·x + b·y + c·z + d ≥ 0 for points inside. */
export type FrustumPlane = readonly [number, number, number, number];

/**
 * The six frustum planes of a row-major view-projection matrix (the
 * Gribb–Hartmann extraction for the WebGL clip volume -w ≤ x, y, z ≤ w).
 */
export function frustumPlanes(m: Mat4): FrustumPlane[] {
  const row = (i: number) => [m[i * 4]!, m[i * 4 + 1]!, m[i * 4 + 2]!, m[i * 4 + 3]!] as const;
  const r0 = row(0);
  const r1 = row(1);
  const r2 = row(2);
  const r3 = row(3);
  const combine = (a: readonly number[], b: readonly number[], s: number): FrustumPlane => [
    a[0]! + s * b[0]!,
    a[1]! + s * b[1]!,
    a[2]! + s * b[2]!,
    a[3]! + s * b[3]!,
  ];
  return [
    combine(r3, r0, 1),
    combine(r3, r0, -1),
    combine(r3, r1, 1),
    combine(r3, r1, -1),
    combine(r3, r2, 1),
    combine(r3, r2, -1),
  ];
}

/**
 * Whether a box may be visible: false only when the box lies entirely
 * outside one of the planes (conservative, so it never culls a visible box).
 */
export function aabbInFrustum(planes: readonly FrustumPlane[], box: Aabb): boolean {
  for (const [a, b, c, d] of planes) {
    const x = a >= 0 ? box.max[0] : box.min[0];
    const y = b >= 0 ? box.max[1] : box.min[1];
    const z = c >= 0 ? box.max[2] : box.min[2];
    if (a * x + b * y + c * z + d < 0) {
      return false;
    }
  }
  return true;
}

/** The union of boxes, or null when there are none. */
export function unionAabb(boxes: Iterable<Aabb | null>): Aabb | null {
  let min: [number, number, number] | null = null;
  let max: [number, number, number] | null = null;
  for (const box of boxes) {
    if (!box) {
      continue;
    }
    if (!min || !max) {
      min = [...box.min];
      max = [...box.max];
      continue;
    }
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, box.min[i]!);
      max[i] = Math.max(max[i]!, box.max[i]!);
    }
  }
  return min && max ? { min, max } : null;
}

/** The zoom used when there is nothing to frame. */
export const DEFAULT_ZOOM = 1;

/**
 * A 2D camera that shows the whole box with a margin on every side (a
 * fraction of the box's extent), centred on the box.
 */
export function frameOrtho(
  axis: OrthoAxis,
  box: Aabb | null,
  width: number,
  height: number,
  margin = 0.1,
): OrthoCamera {
  if (!box) {
    return { kind: 'ortho', axis, center: [0, 0, 0], zoom: DEFAULT_ZOOM };
  }
  const { right, up } = orthoBasis(axis);
  const center: Vec3 = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  const extent = sub(box.max, box.min);
  const extentRight = Math.abs(dot(extent, right)) * (1 + 2 * margin);
  const extentUp = Math.abs(dot(extent, up)) * (1 + 2 * margin);
  const zooms = [
    extentRight > 0 ? width / extentRight : Infinity,
    extentUp > 0 ? height / extentUp : Infinity,
  ];
  const zoom = Math.min(...zooms);
  return { kind: 'ortho', axis, center, zoom: Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM };
}

/** The defaults of the fly camera. */
export const DEFAULT_FOV_Y = 60;
export const DEFAULT_NEAR = 1;
export const DEFAULT_FAR = 65536;

/**
 * A 3D camera looking at the box's centre along the given angles, far enough
 * back that the box's bounding sphere fits the narrower field of view.
 */
export function framePerspective(
  box: Aabb | null,
  aspect: number,
  yaw = 45,
  pitch = -30,
  fovY = DEFAULT_FOV_Y,
): PerspectiveCamera {
  const forward = forwardFromAngles(yaw, pitch);
  const base = {
    kind: 'perspective',
    yaw,
    pitch,
    fovY,
    near: DEFAULT_NEAR,
    far: DEFAULT_FAR,
  } as const;
  if (!box) {
    return { ...base, position: [-forward[0] * 256, -forward[1] * 256, -forward[2] * 256] };
  }
  const center: Vec3 = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  const extent = sub(box.max, box.min);
  const radius = Math.max(1, Math.hypot(extent[0], extent[1], extent[2]) / 2);
  const halfY = (fovY * Math.PI) / 360;
  const halfX = Math.atan(Math.tan(halfY) * Math.max(aspect, 1e-6));
  const distance = (radius / Math.sin(Math.min(halfX, halfY))) * 1.05;
  return {
    ...base,
    position: [
      center[0] - forward[0] * distance,
      center[1] - forward[1] * distance,
      center[2] - forward[2] * distance,
    ],
  };
}
