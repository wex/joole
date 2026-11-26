import { cross, dot, length, ma, normalize, scale } from '@core/geom/index';
import type { Vec3 } from '@core/types/index';
import {
  forwardFromAngles,
  frameOrtho,
  framePerspective,
  MAX_PITCH,
  orthoBasis,
  VIEW_AXES,
  VIEW_ORDER,
  type Aabb,
  type Camera,
  type OrthoCamera,
  type PerspectiveCamera,
  type ViewId,
  type ViewRect,
} from '@render/index';

export type OrthoCameraState = OrthoCamera;
export type PerspectiveCameraState = PerspectiveCamera;

export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/** Qoole's zoom limits, interpreted as CSS pixels per world unit. */
export const MIN_ORTHO_ZOOM_CSS = 0.025;
export const MAX_ORTHO_ZOOM_CSS = 10;
/** Qoole's one-notch wheel step: zoom × 1.32. */
export const WHEEL_ZOOM_STEP = 1.32;
export const FLY_SPEED_UNITS_PER_SECOND = 256;
export const MOUSE_LOOK_DEGREES_PER_PIXEL = 0.15;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function axisCoordinates(
  axis: OrthoCamera['axis'],
  horizontal: number,
  vertical: number,
): [number, number] {
  switch (axis) {
    case 'xy':
      return [horizontal, vertical];
    case 'xz':
      return [horizontal, vertical];
    case 'yz':
      return [horizontal, vertical];
  }
}

/** Pan a 2D view by a pointer delta in CSS pixels, grabbing the world. */
export function panOrtho(
  camera: OrthoCamera,
  dxCss: number,
  dyCss: number,
  devicePixelRatio: number,
): OrthoCamera {
  const { right, up } = orthoBasis(camera.axis);
  const dx = (dxCss * devicePixelRatio) / camera.zoom;
  const dy = (dyCss * devicePixelRatio) / camera.zoom;
  return {
    ...camera,
    center: ma(ma(camera.center, right, -dx), up, dy),
  };
}

/**
 * Zoom a 2D view around the cursor. point and viewport are in CSS pixels;
 * OrthoCamera.zoom is in device pixels per world unit, as the renderer
 * expects. The limits are device-independent so high-DPI displays keep the
 * same usable range.
 */
export function zoomOrthoAt(
  camera: OrthoCamera,
  point: ViewportPoint,
  viewport: ViewportSize,
  devicePixelRatio: number,
  factor: number,
): OrthoCamera {
  const zoom = clamp(
    camera.zoom * factor,
    MIN_ORTHO_ZOOM_CSS * devicePixelRatio,
    MAX_ORTHO_ZOOM_CSS * devicePixelRatio,
  );
  const { right, up } = orthoBasis(camera.axis);
  const beforeX = ((point.x - viewport.width / 2) * devicePixelRatio) / camera.zoom;
  const beforeY = (-(point.y - viewport.height / 2) * devicePixelRatio) / camera.zoom;
  const afterX = ((point.x - viewport.width / 2) * devicePixelRatio) / zoom;
  const afterY = (-(point.y - viewport.height / 2) * devicePixelRatio) / zoom;
  return {
    ...camera,
    zoom,
    center: ma(ma(camera.center, right, beforeX - afterX), up, beforeY - afterY),
  };
}

/** The world coordinates under the cursor in a 2D view. */
export function orthoCoordinates(
  camera: OrthoCamera,
  point: ViewportPoint,
  viewport: ViewportSize,
  devicePixelRatio: number,
): { labels: readonly [string, string]; values: readonly [number, number] } {
  const { right, up } = orthoBasis(camera.axis);
  const horizontal =
    dot(camera.center, right) + ((point.x - viewport.width / 2) * devicePixelRatio) / camera.zoom;
  const vertical =
    dot(camera.center, up) - ((point.y - viewport.height / 2) * devicePixelRatio) / camera.zoom;
  const labels = (
    camera.axis === 'xy' ? ['X', 'Y'] : camera.axis === 'xz' ? ['X', 'Z'] : ['Y', 'Z']
  ) as readonly [string, string];
  return { labels, values: axisCoordinates(camera.axis, horizontal, vertical) };
}

/** The world point on the camera-centred plane of a 2D view. */
export function orthoWorldPoint(
  camera: OrthoCamera,
  point: ViewportPoint,
  viewport: ViewportSize,
  devicePixelRatio: number,
): Vec3 {
  const { right, up } = orthoBasis(camera.axis);
  const horizontal =
    dot(camera.center, right) + ((point.x - viewport.width / 2) * devicePixelRatio) / camera.zoom;
  const vertical =
    dot(camera.center, up) - ((point.y - viewport.height / 2) * devicePixelRatio) / camera.zoom;
  return ma(
    ma(camera.center, right, horizontal - dot(camera.center, right)),
    up,
    vertical - dot(camera.center, up),
  );
}

/** The world-space picking ray direction through a point of the perspective view. */
export function perspectiveRayDirection(
  camera: PerspectiveCamera,
  point: ViewportPoint,
  viewport: ViewportSize,
): Vec3 {
  const forward = forwardFromAngles(camera.yaw, camera.pitch);
  const right = normalize(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  const aspect = viewport.width / Math.max(1, viewport.height);
  const x = (point.x / Math.max(1, viewport.width)) * 2 - 1;
  const y = 1 - (point.y / Math.max(1, viewport.height)) * 2;
  const tanY = Math.tan(((camera.fovY * Math.PI) / 180) * 0.5);
  return normalize(ma(ma(ma(forward, right, x * tanY * aspect), up, y * tanY), [0, 0, 0], 0));
}

/** Mouse look for the fly camera. Positive movementX turns right. */
export function lookPerspective(
  camera: PerspectiveCamera,
  movementX: number,
  movementY: number,
  sensitivity = MOUSE_LOOK_DEGREES_PER_PIXEL,
): PerspectiveCamera {
  return {
    ...camera,
    yaw: camera.yaw - movementX * sensitivity,
    pitch: clamp(camera.pitch - movementY * sensitivity, -MAX_PITCH, MAX_PITCH),
  };
}

/**
 * The mouse wheel moves the fly camera along its forward axis, in steps
 * that follow the zoom step of the orthographic views. Positive distance
 * moves forward.
 */
export function dollyPerspective(camera: PerspectiveCamera, distance: number): PerspectiveCamera {
  if (distance === 0) {
    return camera;
  }
  const forward = forwardFromAngles(camera.yaw, camera.pitch);
  return { ...camera, position: ma(camera.position, forward, distance) };
}

/** Fly movement for one frame, with diagonal movement normalised. */
export function movePerspective(
  camera: PerspectiveCamera,
  keys: ReadonlySet<string>,
  seconds: number,
  speed = FLY_SPEED_UNITS_PER_SECOND,
): PerspectiveCamera {
  if (keys.size === 0 || seconds <= 0) {
    return camera;
  }
  const forward = forwardFromAngles(camera.yaw, camera.pitch);
  const right = normalize(cross(forward, [0, 0, 1]));
  let direction: Vec3 = [0, 0, 0];
  if (keys.has('w')) {
    direction = ma(direction, forward, 1);
  }
  if (keys.has('s')) {
    direction = ma(direction, forward, -1);
  }
  if (keys.has('d')) {
    direction = ma(direction, right, 1);
  }
  if (keys.has('a')) {
    direction = ma(direction, right, -1);
  }
  if (length(direction) === 0) {
    return camera;
  }
  const step = scale(normalize(direction), speed * seconds);
  return { ...camera, position: ma(camera.position, step, 1) };
}

function defaultCameras(): Record<ViewId, Camera> {
  return {
    '3d': framePerspective(null, 1),
    top: frameOrtho('xy', null, 1, 1),
    front: frameOrtho('xz', null, 1, 1),
    side: frameOrtho('yz', null, 1, 1),
  };
}

/**
 * The camera state owner. It lives in the UI layer and emits immutable camera
 * data; main.ts connects the callback to Renderer.setCamera. No Solid state is
 * needed for the high-frequency pointer path, so a drag cannot lose movement
 * to queued reactive flushes.
 */
export class CameraController {
  private readonly cameras: Record<ViewId, Camera> = defaultCameras();

  constructor(private readonly onChange: (view: ViewId, camera: Camera) => void) {
    for (const view of VIEW_ORDER) {
      this.onChange(view, this.cameras[view]);
    }
  }

  get(view: ViewId): Camera {
    return this.cameras[view];
  }

  setCamera(view: ViewId, camera: Camera): void {
    this.cameras[view] = camera;
    this.onChange(view, camera);
  }

  /** Frames the document bounds in every visible view. */
  frame(bounds: Aabb | null, rects: ReadonlyMap<ViewId, ViewRect>): void {
    for (const view of VIEW_ORDER) {
      const rect = rects.get(view);
      if (!rect) {
        continue;
      }
      if (view === '3d') {
        this.setCamera(view, framePerspective(bounds, rect.width / Math.max(1, rect.height)));
      } else {
        this.setCamera(view, frameOrtho(VIEW_AXES[view], bounds, rect.width, rect.height));
      }
    }
  }
}
