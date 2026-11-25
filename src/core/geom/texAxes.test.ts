import { describe, expect, it } from 'vitest';
import { texAxes, uvForPoint } from './texAxes';
import { expectVec } from './__tests__/helpers';

/**
 * The expected values are worked out by hand from textures.c: the base axis
 * table, the strict-greater-than best-axis choice, the rotation in the
 * (sv, tv) plane and the division by scale.
 */
function axes(
  normal: [number, number, number],
  tex: Partial<{ offset: [number, number]; rotation: number; scale: [number, number] }> = {},
) {
  return texAxes(
    { n: normal, d: 0 },
    {
      offset: tex.offset ?? [0, 0],
      rotation: tex.rotation ?? 0,
      scale: tex.scale ?? [1, 1],
    },
  );
}

describe('texAxes', () => {
  it('floor normal picks the floor base axis', () => {
    const result = axes([0, 0, 1]);
    expectVec(result.s, [1, 0, 0]);
    expectVec(result.t, [0, -1, 0]);
  });

  it('ceiling normal picks the ceiling base axis with the same vectors', () => {
    const result = axes([0, 0, -1]);
    expectVec(result.s, [1, 0, 0]);
    expectVec(result.t, [0, -1, 0]);
  });

  it('west wall normal picks the west wall base axis', () => {
    const result = axes([1, 0, 0]);
    expectVec(result.s, [0, 1, 0]);
    expectVec(result.t, [0, 0, -1]);
  });

  it('east, south and north walls pick their own axes', () => {
    expectVec(axes([-1, 0, 0]).s, [0, 1, 0]);
    expectVec(axes([0, 1, 0]).s, [1, 0, 0]);
    expectVec(axes([0, -1, 0]).s, [1, 0, 0]);
  });

  it('a diagonal normal picks the dominant axis by the largest dot', () => {
    // Mostly horizontal, slightly tilted: still a floor.
    const result = axes([0.1, 0.1, 0.98]);
    expectVec(result.s, [1, 0, 0]);
    expectVec(result.t, [0, -1, 0]);
  });

  it('rotation 90 rotates the axes in the (sv, tv) plane exactly', () => {
    // Hand-computed from the C: floor base, sinv 1 cosv 0 turns
    // vecs[0] (1,0,0) into (0,1,0) and vecs[1] (0,-1,0) into (1,0,0).
    const result = axes([0, 0, 1], { rotation: 90 });
    expectVec(result.s, [0, 1, 0]);
    expectVec(result.t, [1, 0, 0]);
  });

  it('rotation 180 and 270 use the exact special cases', () => {
    const r180 = axes([0, 0, 1], { rotation: 180 });
    expectVec(r180.s, [-1, 0, 0]);
    expectVec(r180.t, [0, 1, 0]);
    const r270 = axes([0, 0, 1], { rotation: 270 });
    expectVec(r270.s, [0, -1, 0]);
    expectVec(r270.t, [-1, 0, 0]);
  });

  it('rotation 45 uses sin and cos of the angle', () => {
    const c = Math.SQRT1_2;
    const result = axes([0, 0, 1], { rotation: 45 });
    // vecs[0] (1,0,0) -> (c, s, 0), vecs[1] (0,-1,0) -> (s, -c, 0).
    expect(result.s[0]).toBeCloseTo(c, 12);
    expect(result.s[1]).toBeCloseTo(c, 12);
    expect(result.s[2]).toBeCloseTo(0, 12);
    expect(result.t[0]).toBeCloseTo(c, 12);
    expect(result.t[1]).toBeCloseTo(-c, 12);
  });

  it('divides the axes by the scale values', () => {
    const result = axes([0, 0, 1], { scale: [2, 0.5] });
    expectVec(result.s, [0.5, 0, 0]);
    expectVec(result.t, [0, -2, 0]);
  });

  it('a zero scale means one, as in the C', () => {
    const result = axes([0, 0, 1], { scale: [0, 0] });
    expectVec(result.s, [1, 0, 0]);
    expectVec(result.t, [0, -1, 0]);
  });

  it('truncates rotation decimals the way atoi does', () => {
    // 45.9 degrees becomes exactly the 45-degree rotation.
    const truncated = axes([0, 0, 1], { rotation: 45.9 });
    const plain = axes([0, 0, 1], { rotation: 45 });
    expectVec(truncated.s, plain.s as [number, number, number]);
    // Negative rotations truncate towards zero: -90.9 becomes -90.
    const neg = axes([0, 0, 1], { rotation: -90.9 });
    const negExact = axes([0, 0, 1], { rotation: -90 });
    expectVec(neg.s, negExact.s as [number, number, number]);
  });

  it('truncates offsets towards zero as the shifts', () => {
    const result = axes([0, 0, 1], { offset: [3.7, -2.7] });
    expect(result.shiftS).toBe(3);
    expect(result.shiftT).toBe(-2);
  });
});

describe('uvForPoint', () => {
  it('computes texture coordinates in the 0..1 texture space', () => {
    // Floor, no rotation: u = x / width, v = -y / height.
    const uv = uvForPoint([64, 32, 0], axes([0, 0, 1]), 64, 64);
    expect(uv[0]).toBeCloseTo(1, 12);
    expect(uv[1]).toBeCloseTo(-0.5, 12);
  });

  it('adds the truncated shifts before the division', () => {
    const uv = uvForPoint([0, 0, 0], axes([0, 0, 1], { offset: [32, 0] }), 64, 64);
    expect(uv[0]).toBeCloseTo(0.5, 12);
  });
});
