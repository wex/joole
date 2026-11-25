import { describe, expect, it } from 'vitest';
import { addNodePatch, applyPatch, createEmptyDocument, invertPatch } from '@core/doc/index';
import { analyzeBrush } from '@core/geom/index';
import { makeBox } from '@core/geom/__tests__/helpers';
import type { BrushNode, MapDocument } from '@core/types/index';
import { subtractSelectionPatch } from './csg';

function documentWith(brushes: BrushNode[]): MapDocument {
  let doc = createEmptyDocument();
  for (const brush of brushes) doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, brush));
  return doc;
}

describe('subtractSelectionPatch', () => {
  it('treats selected brushes as cutters and cuts overlapping unselected brushes', () => {
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    const untouched = { ...makeBox([256, 0, 0], [320, 64, 64]), id: 'untouched' };
    const cutter = { ...makeBox([32, 32, 32], [96, 96, 96]), id: 'cutter' };
    const doc = documentWith([target, untouched, cutter]);
    const result = subtractSelectionPatch(doc, new Set(['cutter']));
    expect(result).not.toBeNull();
    const edited = applyPatch(doc, result!.patch);
    expect(edited.nodes.has('cutter')).toBe(true);
    expect(edited.nodes.get('untouched')).toBe(untouched);
    expect(result!.targets).toBe(1);
    expect(result!.ids.length).toBeGreaterThan(1);
    const volume = result!.ids.reduce(
      (sum, id) => sum + analyzeBrush(edited.nodes.get(id) as BrushNode).volume,
      0,
    );
    expect(volume).toBeCloseTo(64 ** 3 - 32 ** 3, 3);
  });

  it('removes a fully contained target and preserves parent child order', () => {
    const before = { ...makeBox([96, 0, 0], [104, 8, 8]), id: 'before' };
    const target = { ...makeBox([16, 16, 16], [32, 32, 32]), id: 'target' };
    const after = { ...makeBox([128, 0, 0], [136, 8, 8]), id: 'after' };
    const cutter = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'cutter' };
    const doc = documentWith([before, target, after, cutter]);
    const result = subtractSelectionPatch(doc, new Set(['cutter']))!;
    const edited = applyPatch(doc, result.patch);
    expect(edited.nodes.has('target')).toBe(false);
    const world = edited.nodes.get(edited.worldspawn);
    expect(world?.kind).toBe('entity');
    if (world?.kind === 'entity') expect(world.children).toEqual(['before', 'after', 'cutter']);
  });

  it('undo restores the original document', () => {
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    const cutter = { ...makeBox([32, 32, 32], [96, 96, 96]), id: 'cutter' };
    const doc = documentWith([target, cutter]);
    const result = subtractSelectionPatch(doc, new Set(['cutter']))!;
    const edited = applyPatch(doc, result.patch);
    const undone = applyPatch(edited, invertPatch(result.patch));
    expect(undone.nodes.get('target')).toEqual(target);
    const world = undone.nodes.get(undone.worldspawn);
    if (world?.kind === 'entity') expect(world.children).toEqual(['target', 'cutter']);
  });

  it('returns null without cutters or overlapping targets', () => {
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    const cutter = { ...makeBox([128, 0, 0], [192, 64, 64]), id: 'cutter' };
    const doc = documentWith([target, cutter]);
    expect(subtractSelectionPatch(doc, new Set())).toBeNull();
    expect(subtractSelectionPatch(doc, new Set(['cutter']))).toBeNull();
  });
});

describe('intersectSelectionPatch', () => {
  it('replaces selected brushes with their intersection as one undoable patch', async () => {
    const { intersectSelectionPatch } = await import('./csg');
    const a = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'a' };
    const b = { ...makeBox([32, 0, 0], [96, 64, 64]), id: 'b' };
    const doc = documentWith([a, b]);
    const result = intersectSelectionPatch(doc, new Set(['a', 'b']))!;
    const edited = applyPatch(doc, result.patch);
    expect(edited.nodes.has('b')).toBe(false);
    const intersection = edited.nodes.get('a') as BrushNode;
    expect(analyzeBrush(intersection).volume).toBeCloseTo(32 * 64 * 64, 5);
    const undone = applyPatch(edited, invertPatch(result.patch));
    expect(undone.nodes.get('a')).toEqual(a);
    expect(undone.nodes.get('b')).toEqual(b);
  });
});

describe('hollowSelectionPatch', () => {
  it('replaces one selected brush with shell fragments and undo restores it', async () => {
    const { hollowSelectionPatch } = await import('./csg');
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    const doc = documentWith([target]);
    const result = hollowSelectionPatch(doc, new Set(['target']), 'inward')!;
    const edited = applyPatch(doc, result.patch);
    expect(result.ids.length).toBeGreaterThan(1);
    const volume = result.ids.reduce(
      (sum, id) => sum + analyzeBrush(edited.nodes.get(id) as BrushNode).volume,
      0,
    );
    expect(volume).toBeCloseTo(64 ** 3 - 48 ** 3, 3);
    const undone = applyPatch(edited, invertPatch(result.patch));
    expect(undone.nodes.get('target')).toEqual(target);
  });
});

describe('clipSelectionPatch', () => {
  it('clips a selected brush to the front side and undo restores it', async () => {
    const { clipSelectionPatch } = await import('./csg');
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    const doc = documentWith([target]);
    const result = clipSelectionPatch(doc, new Set(['target']), { n: [1, 0, 0], d: 32 }, 'front')!;
    const edited = applyPatch(doc, result.patch);
    const clipped = edited.nodes.get('target') as BrushNode;
    expect(analyzeBrush(clipped).aabb?.min[0]).toBeCloseTo(32, 5);
    expect(result.ids).toEqual(['target']);
    const undone = applyPatch(edited, invertPatch(result.patch));
    expect(undone.nodes.get('target')).toEqual(target);
  });

  it('both sides produce two sibling fragments', async () => {
    const { clipSelectionPatch } = await import('./csg');
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    const doc = documentWith([target]);
    const result = clipSelectionPatch(doc, new Set(['target']), { n: [1, 0, 0], d: 32 }, 'both')!;
    expect(result.ids).toHaveLength(2);
    const edited = applyPatch(doc, result.patch);
    const volume = result.ids.reduce(
      (sum, id) => sum + analyzeBrush(edited.nodes.get(id) as BrushNode).volume,
      0,
    );
    expect(volume).toBeCloseTo(64 ** 3, 4);
  });
});
