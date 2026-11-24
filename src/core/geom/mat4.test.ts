import { describe, expect, it } from 'vitest';
import {
  mat4ApplyPoint,
  mat4Identity,
  mat4Multiply,
  mat4RotationX,
  mat4RotationY,
  mat4RotationZ,
  mat4Scaling,
  mat4Translation,
} from './mat4';

describe('mat4', () => {
  it('identity leaves a point unchanged', () => {
    expect(mat4ApplyPoint(mat4Identity(), [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('translates', () => {
    expect(mat4ApplyPoint(mat4Translation([10, 20, 30]), [1, 2, 3])).toEqual([11, 22, 33]);
  });

  it('scales', () => {
    expect(mat4ApplyPoint(mat4Scaling([2, 3, 4]), [1, 1, 1])).toEqual([2, 3, 4]);
  });

  it('rotates about z counterclockwise in the xy plane', () => {
    const p = mat4ApplyPoint(mat4RotationZ(90), [1, 0, 0]);
    expect(p[0]).toBeCloseTo(0, 10);
    expect(p[1]).toBeCloseTo(1, 10);
    expect(p[2]).toBeCloseTo(0, 10);
  });

  it('rotates about x and y', () => {
    const px = mat4ApplyPoint(mat4RotationX(90), [0, 1, 0]);
    expect(px[1]).toBeCloseTo(0, 10);
    expect(px[2]).toBeCloseTo(1, 10);
    const py = mat4ApplyPoint(mat4RotationY(90), [0, 0, 1]);
    expect(py[0]).toBeCloseTo(1, 10);
    expect(py[2]).toBeCloseTo(0, 10);
  });

  it('multiply composes so that b applies first', () => {
    const m = mat4Multiply(mat4Translation([1, 0, 0]), mat4Scaling([2, 2, 2]));
    expect(mat4ApplyPoint(m, [1, 1, 1])).toEqual([3, 2, 2]);
    expect(mat4ApplyPoint(mat4Multiply(mat4Identity(), mat4Identity()), [5, 6, 7])).toEqual([
      5, 6, 7,
    ]);
  });
});
