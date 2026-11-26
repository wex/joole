import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@core/types/index';
import { VIEW_ORDER, type Camera, type OrthoCamera, type ViewId } from '@render/index';
import {
  dollyPerspective,
  CameraController,
  lookPerspective,
  MAX_ORTHO_ZOOM_CSS,
  movePerspective,
  orthoCoordinates,
  panOrtho,
  zoomOrthoAt,
  type PerspectiveCameraState,
} from './cameras';

function expectVecClose(actual: Vec3, expected: Vec3, precision = 6): void {
  for (let i = 0; i < 3; i++) {
    expect(actual[i]).toBeCloseTo(expected[i]!, precision);
  }
}

describe('orthographic camera navigation', () => {
  it('pans the world with the cursor', () => {
    const camera: OrthoCamera = { kind: 'ortho', axis: 'xy', center: [0, 0, 0], zoom: 2 };
    const panned = panOrtho(camera, 20, 10, 1);
    expectVecClose(panned.center, [-10, 5, 0]);
  });

  it('zooms around the cursor instead of the view centre', () => {
    const camera: OrthoCamera = { kind: 'ortho', axis: 'xy', center: [10, 20, 0], zoom: 2 };
    const viewport = { width: 200, height: 100 };
    const cursor = { x: 160, y: 20 };
    const before = orthoCoordinates(camera, cursor, viewport, 1).values;
    const zoomed = zoomOrthoAt(camera, cursor, viewport, 1, 1.5);
    const after = orthoCoordinates(zoomed, cursor, viewport, 1).values;

    expect(zoomed.zoom).toBeCloseTo(3);
    expect(after[0]).toBeCloseTo(before[0]!);
    expect(after[1]).toBeCloseTo(before[1]!);
    expectVecClose(zoomed.center, [20, 25, 0]);
  });

  it('clamps the zoom in device-independent units', () => {
    const camera: OrthoCamera = { kind: 'ortho', axis: 'xz', center: [0, 0, 0], zoom: 19 };
    const zoomed = zoomOrthoAt(camera, { x: 50, y: 50 }, { width: 100, height: 100 }, 2, 2);
    expect(zoomed.zoom).toBe(MAX_ORTHO_ZOOM_CSS * 2);
  });

  it('reports the axis coordinates of each 2D view', () => {
    const camera: OrthoCamera = { kind: 'ortho', axis: 'yz', center: [1, 2, 3], zoom: 2 };
    const coords = orthoCoordinates(camera, { x: 60, y: 40 }, { width: 100, height: 100 }, 1);
    expect(coords.labels).toEqual(['Y', 'Z']);
    expect(coords.values[0]).toBeCloseTo(7);
    expect(coords.values[1]).toBeCloseTo(8);
  });
});

describe('perspective camera navigation', () => {
  const camera: PerspectiveCameraState = {
    kind: 'perspective',
    position: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    fovY: 60,
    near: 1,
    far: 65536,
  };

  it('turns right with the mouse and clamps pitch', () => {
    const turned = lookPerspective(camera, 100, -1000, 0.15);
    expect(turned.yaw).toBeCloseTo(-15);
    expect(turned.pitch).toBe(89);
    const down = lookPerspective(camera, -100, 1000, 0.15);
    expect(down.yaw).toBeCloseTo(15);
    expect(down.pitch).toBe(-89);
  });

  it('moves forward and right in the view directions', () => {
    const forward = movePerspective(camera, new Set(['w']), 0.5, 256);
    expectVecClose(forward.position, [128, 0, 0]);
    const right = movePerspective(camera, new Set(['d']), 0.5, 256);
    expectVecClose(right.position, [0, -128, 0]);
  });

  it('normalises diagonal movement so it is not faster', () => {
    const moved = movePerspective(camera, new Set(['w', 'd']), 1, 256);
    expect(Math.hypot(...moved.position)).toBeCloseTo(256);
  });
});

describe('CameraController', () => {
  it('passes camera state to the renderer as data', () => {
    const changes: [ViewId, Camera][] = [];
    const controller = new CameraController((view, camera) => changes.push([view, camera]));
    changes.length = 0;
    const camera = controller.get('top');
    if (camera.kind !== 'ortho') {
      throw new Error('top is not ortho');
    }
    controller.setCamera('top', { ...camera, zoom: 4 });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[0]).toBe('top');
    expect(controller.get('top')).toMatchObject({ zoom: 4 });
  });

  it('frames every visible view', () => {
    const changes: ViewId[] = [];
    const controller = new CameraController((view) => changes.push(view));
    changes.length = 0;
    controller.frame(
      { min: [-64, -64, 0], max: [64, 64, 128] },
      new Map([
        ['3d', { x: 0, y: 0, width: 400, height: 300 }],
        ['top', { x: 0, y: 0, width: 400, height: 300 }],
        ['front', { x: 0, y: 0, width: 400, height: 300 }],
        ['side', { x: 0, y: 0, width: 400, height: 300 }],
      ]),
    );
    expect(changes).toEqual([...VIEW_ORDER]);
    expect(controller.get('top').kind).toBe('ortho');
    expect(controller.get('3d').kind).toBe('perspective');
  });
});

describe('dollyPerspective (T1.5)', () => {
  it('moves along the forward axis, positive forward', () => {
    const camera = {
      kind: 'perspective' as const,
      position: [0, 0, 0] as Vec3,
      yaw: 0,
      pitch: 0,
      fovY: 90,
      near: 1,
      far: 65536,
    };
    const moved = dollyPerspective(camera, 64);
    const d = Math.hypot(moved.position[0], moved.position[1], moved.position[2]);
    expect(d).toBeCloseTo(64, 6);
    const back = dollyPerspective(camera, -64);
    expect(back.position[0]).toBeCloseTo(-moved.position[0], 6);
    expect(dollyPerspective(camera, 0)).toBe(camera);
  });
});
