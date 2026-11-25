import { describe, expect, it } from 'vitest';
import { parseMap } from '@core/formats/index';
import { analyzeBrush, validateBrush } from '@core/geom/index';
import { generateBrushMap } from './generatedMap';

describe('generateBrushMap', () => {
  it('is deterministic and generates parseable boxes', () => {
    const first = generateBrushMap(12);
    expect(first).toBe(generateBrushMap(12));
    const doc = parseMap(first);
    const brushes = [...doc.nodes.values()].filter((node) => node.kind === 'brush');
    expect(brushes).toHaveLength(12);
    const boxes = brushes.map((brush) => {
      const analysis = analyzeBrush(brush);
      expect(brush.faces).toHaveLength(6);
      expect(validateBrush(analysis)).toEqual({ valid: true, reasons: [] });
      expect(analysis.volume).toBeCloseTo(96 ** 3, 6);
      return analysis.aabb!;
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        expect(
          [0, 1, 2].some((axis) => a.max[axis]! <= b.min[axis]! || b.max[axis]! <= a.min[axis]!),
        ).toBe(true);
      }
    }
  });

  it('generates the requested count in one worldspawn entity', () => {
    const text = generateBrushMap(5000);
    expect(text.match(/"classname" "worldspawn"/g) ?? []).toHaveLength(1);
    expect(text.match(/\n\{\n/g) ?? []).toHaveLength(5000);
  });

  it('rejects invalid counts', () => {
    expect(() => generateBrushMap(0)).toThrow(RangeError);
    expect(() => generateBrushMap(1.5)).toThrow(RangeError);
  });
});
