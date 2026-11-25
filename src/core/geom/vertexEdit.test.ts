import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { analyzeBrush, extractWireframe, validateBrush } from './brush';
import { moveVertices } from './vertexEdit';
import { makeBox } from './__tests__/helpers';
import type { Vec3 } from '@core/types/index';

function cornerOf(box = makeBox([0, 0, 0], [64, 64, 64])): Vec3[] {
  const analysis = analyzeBrush(box);
  return extractWireframe(analysis.polygons).vertices;
}

describe('moveVertices', () => {
  it('moves a cube corner inwards: valid, smaller volume, triangle planes inherit texture', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const before = analyzeBrush(box).volume;
    const result = moveVertices(box, [[0, 0, 0]], [16, 16, 16]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = analyzeBrush(result.value);
    expect(validateBrush(analysis).valid).toBe(true);
    expect(analysis.volume).toBeLessThan(before);
    expect(result.value.faces.length).toBeGreaterThan(box.faces.length);
    for (const face of result.value.faces) {
      expect(face.tex.name).toBe(box.faces[0]!.tex.name);
    }
  });

  it('accepts moving a corner outwards into a valid chamfered shape', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const result = moveVertices(box, [[64, 64, 64]], [96, 64, 64]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateBrush(analyzeBrush(result.value)).valid).toBe(true);
  });

  it('rejects a degenerate move that collapses the vertex onto its neighbour', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const result = moveVertices(box, [[0, 0, 0]], [64, 0, 0]);
    expect(result.ok).toBe(false);
  });

  it('rejects a move that turns the brush inside out', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const result = moveVertices(box, [[0, 0, 0]], [128, 128, 128]);
    expect(result.ok).toBe(false);
  });

  it('rejects edits on an invalid brush', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const broken = { ...box, faces: box.faces.slice(0, 3) };
    expect(moveVertices(broken, [[0, 0, 0]], [8, 0, 0]).ok).toBe(false);
  });

  it('moves an edge by moving both endpoints, preserving planarity of side faces', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const result = moveVertices(
      box,
      [
        [0, 0, 64],
        [64, 0, 64],
      ],
      [0, 0, 32],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = analyzeBrush(result.value);
    expect(validateBrush(analysis).valid).toBe(true);
    expect(analysis.volume).toBeGreaterThan(analyzeBrush(box).volume);
  });

  it('moves a whole face by translating its plane', () => {
    const box = makeBox([0, 0, 0], [64, 64, 64]);
    const result = moveVertices(
      box,
      [
        [0, 0, 64],
        [64, 0, 64],
        [64, 64, 64],
        [0, 64, 64],
      ],
      [0, 0, 32],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = analyzeBrush(result.value);
    expect(validateBrush(analysis).valid).toBe(true);
    expect(analysis.volume).toBeCloseTo(64 * 64 * 96, 4);
    // The box stretched only upwards: same footprint.
    expect(analysis.aabb?.min[0]).toBeCloseTo(0, 4);
    expect(analysis.aabb?.max[2]).toBeCloseTo(96, 4);
  });

  it('fast-check: every accepted edit yields a valid brush', () => {
    const arb = fc.record({
      corner: fc.constantFrom(0, 1, 2, 3, 4, 5, 6, 7),
      dx: fc.integer({ min: -24, max: 24 }),
      dy: fc.integer({ min: -24, max: 24 }),
      dz: fc.integer({ min: -24, max: 24 }),
    });
    fc.assert(
      fc.property(arb, ({ corner, dx, dy, dz }) => {
        const box = makeBox([0, 0, 0], [64, 64, 64]);
        const v = cornerOf(box)[corner]!;
        const result = moveVertices(box, [v], [dx, dy, dz]);
        if (result.ok) {
          expect(validateBrush(analyzeBrush(result.value)).valid).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
