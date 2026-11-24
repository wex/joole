import { describe, expect, it } from 'vitest';
import {
  add,
  cross,
  distance,
  dot,
  equalsWithin,
  length,
  ma,
  negate,
  normalize,
  scale,
  sub,
  vec3,
} from './vec3';

describe('vec3', () => {
  it('adds and subtracts componentwise', () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(sub([4, 5, 6], [1, 2, 3])).toEqual([3, 3, 3]);
  });

  it('scales and negates', () => {
    expect(scale([1, -2, 3], 2)).toEqual([2, -4, 6]);
    expect(negate([1, -2, 3])).toEqual([-1, 2, -3]);
    expect(ma([1, 1, 1], [1, 0, 0], 5)).toEqual([6, 1, 1]);
  });

  it('dot and cross follow the right-hand rule', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(cross([0, 1, 0], [1, 0, 0])).toEqual([0, 0, -1]);
  });

  it('length, distance and normalize', () => {
    expect(length([3, 4, 0])).toBe(5);
    expect(distance([1, 0, 0], [1, 0, 3])).toBe(3);
    expect(normalize([0, 0, 5])).toEqual([0, 0, 1]);
  });

  it('normalize returns the zero vector for zero length, like VectorNormalize', () => {
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('vec3 constructs a tuple', () => {
    expect(vec3(1, 2, 3)).toEqual([1, 2, 3]);
  });

  it('equalsWithin compares within a tolerance', () => {
    expect(equalsWithin([0, 0, 0], [0, 0, 0.0005], 0.001)).toBe(true);
    expect(equalsWithin([0, 0, 0], [0, 0, 0.002], 0.001)).toBe(false);
  });
});
