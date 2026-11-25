import { describe, expect, it } from 'vitest';
import { glRect, layoutViews } from './layout';

describe('layoutViews', () => {
  it('lays out 3D, Top, Front and Side in a 2 × 2 grid with a gap', () => {
    const rects = layoutViews(805, 605, null, 5);
    expect(rects.get('3d')).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(rects.get('top')).toEqual({ x: 405, y: 0, width: 400, height: 300 });
    expect(rects.get('front')).toEqual({ x: 0, y: 305, width: 400, height: 300 });
    expect(rects.get('side')).toEqual({ x: 405, y: 305, width: 400, height: 300 });
  });

  it('gives the odd pixel to the right column and the bottom row', () => {
    const rects = layoutViews(101, 51, null, 4);
    expect(rects.get('3d')!.width + 4 + rects.get('top')!.width).toBe(101);
    expect(rects.get('top')!.width).toBe(rects.get('3d')!.width + 1);
    expect(rects.get('3d')!.height + 4 + rects.get('front')!.height).toBe(51);
  });

  it('a maximised view fills the canvas and the others are absent', () => {
    const rects = layoutViews(640, 480, 'front', 4);
    expect([...rects.keys()]).toEqual(['front']);
    expect(rects.get('front')).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });

  it('never produces negative sizes for a tiny canvas', () => {
    for (const rect of layoutViews(3, 2, null, 4).values()) {
      expect(rect.width).toBeGreaterThanOrEqual(0);
      expect(rect.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('glRect', () => {
  it('flips the origin to the bottom left', () => {
    expect(glRect({ x: 10, y: 20, width: 100, height: 50 }, 200)).toEqual([10, 130, 100, 50]);
  });
});
