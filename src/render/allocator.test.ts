import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { RangeAllocator } from './allocator';

describe('RangeAllocator', () => {
  it('allocates first fit and reports the high-water mark', () => {
    const a = new RangeAllocator(100);
    expect(a.alloc(10)).toBe(0);
    expect(a.alloc(20)).toBe(10);
    expect(a.highWater).toBe(30);
    expect(a.used).toBe(30);
  });

  it('reuses a freed hole and merges neighbouring free ranges', () => {
    const a = new RangeAllocator(100);
    a.alloc(10);
    a.alloc(10);
    a.alloc(10);
    a.release(0, 10);
    a.release(10, 10);
    expect(a.alloc(20)).toBe(0);
    a.release(20, 10);
    expect(a.highWater).toBe(20);
  });

  it('returns null when nothing fits, and grow makes room', () => {
    const a = new RangeAllocator(16);
    expect(a.alloc(10)).toBe(0);
    expect(a.alloc(10)).toBeNull();
    a.grow(32);
    expect(a.capacity).toBe(32);
    expect(a.alloc(10)).toBe(10);
  });

  it('rejects double frees and ranges outside the capacity', () => {
    const a = new RangeAllocator(16);
    a.alloc(8);
    a.release(0, 8);
    expect(() => a.release(0, 8)).toThrow(RangeError);
    expect(() => a.release(10, 10)).toThrow(RangeError);
  });

  it('property: live ranges never overlap and stay within the capacity', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.boolean(), fc.integer({ min: 1, max: 40 }), fc.nat()), {
          maxLength: 80,
        }),
        (ops) => {
          const a = new RangeAllocator(64);
          const live: [number, number][] = [];
          for (const [allocate, count, pick] of ops) {
            if (allocate || live.length === 0) {
              let offset = a.alloc(count);
              if (offset === null) {
                a.grow(a.capacity * 2 + count);
                offset = a.alloc(count);
              }
              live.push([offset!, count]);
            } else {
              const [range] = live.splice(pick % live.length, 1);
              a.release(range![0], range![1]);
            }
            const sorted = [...live].sort((x, y) => x[0] - y[0]);
            for (let i = 0; i < sorted.length; i++) {
              const [offset, count] = sorted[i]!;
              expect(offset + count).toBeLessThanOrEqual(a.capacity);
              expect(offset + count).toBeLessThanOrEqual(a.highWater);
              if (i > 0) {
                expect(offset).toBeGreaterThanOrEqual(sorted[i - 1]![0] + sorted[i - 1]![1]);
              }
            }
            expect(a.used).toBe(live.reduce((sum, [, count]) => sum + count, 0));
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
