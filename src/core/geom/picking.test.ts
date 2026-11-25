import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { BrushNode, Patch, Vec3 } from '@core/types/index';
import { BrushBvh, OverlapCycler, containsPoint, rayIntersectBrush, type Aabb } from './picking';
import { analyzeBrush } from './brush';
import { makeBox } from './__tests__/helpers';

function brush(id: string, min: Vec3, max: Vec3): BrushNode {
  return { ...makeBox(min, max), id };
}

function box(min: Vec3, max: Vec3): Aabb {
  return { min, max };
}

describe('rayIntersectBrush', () => {
  it('hits a box at the entering face', () => {
    const hit = rayIntersectBrush(brush('a', [0, 0, 0], [64, 64, 64]), [-10, 32, 32], [1, 0, 0]);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(10);
    expect(hit!.point).toEqual([0, 32, 32]);
    expect(hit!.faceIndex).toBe(1);
  });

  it('reports zero distance when the origin is inside and misses parallel outside rays', () => {
    const b = brush('a', [0, 0, 0], [64, 64, 64]);
    expect(rayIntersectBrush(b, [32, 32, 32], [1, 0, 0])!.t).toBe(0);
    expect(rayIntersectBrush(b, [-10, 100, 32], [1, 0, 0])).toBeNull();
    expect(rayIntersectBrush(b, [-10, 32, 32], [-1, 0, 0])).toBeNull();
  });

  it('containsPoint respects the outward half-spaces', () => {
    const b = brush('a', [0, 0, 0], [64, 64, 64]);
    expect(containsPoint(analyzeBrush(b), [32, 32, 32])).toBe(true);
    expect(containsPoint(analyzeBrush(b), [65, 32, 32])).toBe(false);
  });
});

describe('BrushBvh', () => {
  it('inserts, updates, removes and queries brushes by AABB', () => {
    const bvh = new BrushBvh();
    bvh.insert('a', brush('a', [0, 0, 0], [64, 64, 64]));
    bvh.insert('b', brush('b', [128, 0, 0], [192, 64, 64]));
    expect(bvh.queryAabb(box([32, 32, 32], [160, 40, 40])).sort()).toEqual(['a', 'b']);
    bvh.update('b', brush('b', [512, 0, 0], [576, 64, 64]));
    expect(bvh.queryAabb(box([32, 32, 32], [160, 40, 40]))).toEqual(['a']);
    bvh.remove('a');
    expect(bvh.queryAabb(box([0, 0, 0], [1024, 64, 64]))).toEqual(['b']);
  });

  it('updates from patches', () => {
    const bvh = new BrushBvh();
    const a = brush('a', [0, 0, 0], [64, 64, 64]);
    const patch: Patch = {
      before: new Map([['a', null]]),
      after: new Map([['a', a]]),
      parentBefore: new Map(),
      parentAfter: new Map(),
    };
    bvh.applyPatch(patch);
    expect(bvh.queryAabb(box([0, 0, 0], [64, 64, 64]))).toEqual(['a']);
    bvh.applyPatch({
      before: new Map([['a', a]]),
      after: new Map([['a', null]]),
      parentBefore: new Map(),
      parentAfter: new Map(),
    });
    expect(bvh.queryAabb(box([0, 0, 0], [64, 64, 64]))).toEqual([]);
  });

  it('returns ray hits in front-to-back order', () => {
    const bvh = new BrushBvh();
    bvh.insert('near', brush('near', [0, 0, 0], [64, 64, 64]));
    bvh.insert('far', brush('far', [128, 0, 0], [192, 64, 64]));
    const hits = bvh.rayHits([-10, 32, 32], [1, 0, 0]);
    expect(hits.map((hit) => hit.id)).toEqual(['near', 'far']);
    expect(hits[0]!.t).toBeLessThan(hits[1]!.t);
  });

  it('prefers the nearest edge within tolerance and otherwise returns containing brushes', () => {
    const bvh = new BrushBvh();
    bvh.insert('a', brush('a', [0, 0, 0], [64, 64, 64]));
    const edge = bvh.pick2D([2, 32, 128], 'xy', 4);
    expect(edge[0]).toMatchObject({ id: 'a', kind: 'edge' });
    const inside = bvh.pick2D([32, 32, 128], 'xy', 4);
    expect(inside[0]).toMatchObject({ id: 'a', kind: 'inside' });
    expect(bvh.pick2D([128, 128, 128], 'xy', 4)).toEqual([]);
  });

  it('fast-check: BVH AABB queries match brute force', () => {
    const arb = fc.array(
      fc.record({
        x: fc.integer({ min: -512, max: 512 }),
        y: fc.integer({ min: -512, max: 512 }),
        z: fc.integer({ min: -512, max: 512 }),
        size: fc.integer({ min: 1, max: 96 }),
      }),
      { minLength: 1, maxLength: 40 },
    );
    fc.assert(
      fc.property(arb, fc.integer({ min: 0, max: 39 }), (specs, pick) => {
        const bvh = new BrushBvh();
        const entries = specs.map((spec, i) => {
          const min: Vec3 = [spec.x, spec.y, spec.z];
          const max: Vec3 = [spec.x + spec.size, spec.y + spec.size, spec.z + spec.size];
          const b = brush(`b${i}`, min, max);
          bvh.insert(b.id, b);
          return { id: b.id, min, max };
        });
        const chosen = entries[pick % entries.length]!;
        const query = box(
          [chosen.min[0] - 4, chosen.min[1] - 4, chosen.min[2] - 4],
          [chosen.max[0] + 4, chosen.max[1] + 4, chosen.max[2] + 4],
        );
        const brute = entries
          .filter(
            (entry) =>
              entry.min[0] <= query.max[0] &&
              entry.max[0] >= query.min[0] &&
              entry.min[1] <= query.max[1] &&
              entry.max[1] >= query.min[1] &&
              entry.min[2] <= query.max[2] &&
              entry.max[2] >= query.min[2],
          )
          .map((entry) => entry.id)
          .sort();
        expect(bvh.queryAabb(query).sort()).toEqual(brute);
      }),
      { numRuns: 50 },
    );
  });
});

describe('OverlapCycler', () => {
  it('cycles repeated clicks at the same location and resets elsewhere', () => {
    const cycler = new OverlapCycler();
    const hits = ['a', 'b', 'c'];
    expect(cycler.choose(hits, '10:20')).toBe('a');
    expect(cycler.choose(hits, '10:20')).toBe('b');
    expect(cycler.choose(hits, '10:20')).toBe('c');
    expect(cycler.choose(hits, '10:20')).toBe('a');
    expect(cycler.choose(hits, '11:20')).toBe('a');
  });
});
