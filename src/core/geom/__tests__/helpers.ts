import type { BrushNode, Face, FaceTexture, Plane, Vec3 } from '@core/types/index';
import { expect } from 'vitest';
import { baseWindingForPlane } from '../winding';

export function testTex(): FaceTexture {
  return {
    name: 'e2u1/mine10_1',
    offset: [0, 0],
    rotation: 0,
    scale: [1, 1],
    contents: 0,
    flags: 0,
    value: 0,
    attribsInFile: false,
  };
}

/** A face whose three points lie on the plane in correct winding order. */
export function faceFromPlane(plane: Plane): Face {
  const winding = baseWindingForPlane(plane);
  return {
    points: [winding[0]!, winding[1]!, winding[2]!],
    tex: testTex(),
  };
}

export function brushFromPlanes(planes: Plane[]): BrushNode {
  return { kind: 'brush', id: 'test', faces: planes.map(faceFromPlane) };
}

/** Axis-aligned box, outward normals, exactly as qbsp3 expects. */
export function makeBox(min: Vec3, max: Vec3): BrushNode {
  return brushFromPlanes([
    { n: [1, 0, 0], d: max[0] },
    { n: [-1, 0, 0], d: -min[0] },
    { n: [0, 1, 0], d: max[1] },
    { n: [0, -1, 0], d: -min[1] },
    { n: [0, 0, 1], d: max[2] },
    { n: [0, 0, -1], d: -min[2] },
  ]);
}

/** Compares vectors exactly, except that -0 and +0 are the same number. */
export function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual.map((x) => x + 0)).toEqual(expected);
}
