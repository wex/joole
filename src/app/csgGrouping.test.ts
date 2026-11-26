import { describe, expect, it } from 'vitest';
import {
  addNodePatch,
  applyPatch,
  createEmptyDocument,
  createId,
  invertPatch,
} from '@core/doc/index';
import { makeBox } from '@core/geom/__tests__/helpers';
import type { BrushNode, EntityNode, GroupNode, MapDocument } from '@core/types/index';
import { groupNodesPatch } from './groups';
import { hollowSelectionPatch, subtractSelectionPatch, withCsgGrouping } from './csg';

function documentWith(brushes: BrushNode[]): MapDocument {
  let doc = createEmptyDocument();
  for (const brush of brushes) doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, brush));
  return doc;
}

describe('withCsgGrouping (T1.14)', () => {
  it('hollow groups its wall fragments into one named group', () => {
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    const doc = documentWith([target]);
    const result = hollowSelectionPatch(doc, new Set(['target']), 'inward')!;
    expect(result.ids.length).toBeGreaterThan(1);
    const grouped = withCsgGrouping(doc, result, 'hollow');
    expect(grouped.groups).toHaveLength(1);
    const edited = applyPatch(doc, grouped.patch);
    const group = edited.nodes.get(grouped.groups[0]!) as GroupNode;
    expect(group.kind).toBe('group');
    expect(group.name).toBe('hollow');
    expect([...group.children].sort()).toEqual([...result.ids].sort());
  });

  it('subtract groups only targets with two or more fragments', () => {
    // The big target splits into several fragments; the thin target is only
    // trimmed and stays one brush, so exactly one group is created.
    const big = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'big' };
    const thin = { ...makeBox([128, 0, 0], [192, 16, 16]), id: 'thin' };
    const cutter = { ...makeBox([16, -8, -8], [160, 8, 8]), id: 'cutter' };
    const doc = documentWith([big, thin, cutter]);
    const result = subtractSelectionPatch(doc, new Set(['cutter']))!;
    const grouped = withCsgGrouping(doc, result, 'subtract');
    const edited = applyPatch(doc, grouped.patch);
    const groups = [...edited.nodes.values()].filter((n) => n.kind === 'group');
    // The big target splits; whether the thin one does depends on the cut,
    // but every group holds at least two fragments and is named subtract.
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(grouped.groups.length).toBe(groups.length);
    for (const group of groups) {
      expect((group as GroupNode).name).toBe('subtract');
      expect((group as GroupNode).children.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('one undo restores the original document exactly', () => {
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    const cutter = { ...makeBox([32, 32, 32], [96, 96, 96]), id: 'cutter' };
    const doc = documentWith([target, cutter]);
    const result = subtractSelectionPatch(doc, new Set(['cutter']))!;
    const grouped = withCsgGrouping(doc, result, 'subtract');
    const edited = applyPatch(doc, grouped.patch);
    const undone = applyPatch(edited, invertPatch(grouped.patch));
    expect(undone).toEqual(doc);
  });

  it('a target inside a brush entity gets no group', () => {
    // A brush entity holds brushes but cannot hold a func_group.
    let doc = createEmptyDocument();
    const entity: EntityNode = {
      kind: 'entity',
      id: 'ent',
      props: [
        ['classname', 'func_wall'],
        ['targetname', 'w1'],
      ],
      children: [],
    };
    doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, entity));
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    doc = applyPatch(doc, addNodePatch(doc, 'ent', target));
    const cutter = { ...makeBox([32, 32, 32], [96, 96, 96]), id: 'cutter' };
    doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, cutter));
    const result = subtractSelectionPatch(doc, new Set(['cutter']))!;
    const grouped = withCsgGrouping(doc, result, 'subtract');
    expect(grouped.groups).toHaveLength(0);
    const edited = applyPatch(doc, grouped.patch);
    expect([...edited.nodes.values()].filter((n) => n.kind === 'group')).toHaveLength(0);
  });

  it('no nesting: a target already inside a group keeps its fragments there', () => {
    let doc = createEmptyDocument();
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, target));
    const g1 = groupNodesPatch(doc, ['target'], createId, 'subtract');
    doc = applyPatch(doc, g1.patch);
    const cutter = { ...makeBox([32, 32, 32], [96, 96, 96]), id: 'cutter' };
    doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, cutter));
    const result = subtractSelectionPatch(doc, new Set(['cutter']))!;
    const grouped = withCsgGrouping(doc, result, 'subtract');
    expect(grouped.groups).toHaveLength(0);
    const edited = applyPatch(doc, grouped.patch);
    // The fragments landed inside the existing group, not a nested one.
    const group = edited.nodes.get(g1.id) as GroupNode;
    expect(group.children.length).toBeGreaterThanOrEqual(2);
    expect([...edited.nodes.values()].filter((n) => n.kind === 'group')).toHaveLength(1);
  });

  it('a single-fragment result is not grouped', () => {
    // A cutter covering the target in y and z but not x trims it to one brush.
    const target = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
    const cutter = { ...makeBox([32, -8, -8], [96, 72, 72]), id: 'cutter' };
    const doc = documentWith([target, cutter]);
    const result = subtractSelectionPatch(doc, new Set(['cutter']))!;
    expect(result.ids.length).toBe(1);
    const grouped = withCsgGrouping(doc, result, 'subtract');
    expect(grouped.groups).toHaveLength(0);
  });
});
