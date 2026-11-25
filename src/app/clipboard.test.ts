import { describe, expect, it } from 'vitest';
import { addNodePatch, applyPatch, createEmptyDocument } from '@core/doc/index';
import { analyzeBrush } from '@core/geom/index';
import { makeBox } from '../core/geom/__tests__/helpers';
import { mapTextToPastePatch, selectionToMapText } from './clipboard';

describe('clipboard map snippets', () => {
  it('round-trips a selected brush at full precision with a fresh id', () => {
    let doc = createEmptyDocument();
    const brush = { ...makeBox([0, 0, 0], [64.125, 64, 64]), id: 'source' };
    doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, brush));
    const text = selectionToMapText(doc, new Set(['source']));
    expect(text).toContain('64.125');

    const pasted = mapTextToPastePatch(doc, text!, [8, 0, 0]);
    expect(pasted.patch).not.toBeNull();
    expect(pasted.ids).toHaveLength(1);
    expect(pasted.ids[0]).not.toBe('source');
    const out = applyPatch(doc, pasted.patch!);
    const copy = out.nodes.get(pasted.ids[0]!);
    expect(copy?.kind).toBe('brush');
    if (copy?.kind === 'brush') {
      expect(analyzeBrush(copy).aabb?.min.map((x) => x + 0)).toEqual([8, 0, 0]);
      expect(analyzeBrush(copy).aabb?.max[0]).toBeCloseTo(72.125, 6);
    }
  });
});
