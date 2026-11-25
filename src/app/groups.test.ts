import { describe, expect, it } from 'vitest';
import { applyPatch, buildDocument, createId, invertPatch } from '@core/doc/index';
import type { EntityNode, GroupNode } from '@core/types/index';
import { makeBox } from '@core/geom/__tests__/helpers';
import {
  effectiveGroupState,
  groupNodesPatch,
  setGroupFlagPatch,
  subtreeIds,
  ungroupNodesPatch,
} from './groups';

function docWith(ids: string[]) {
  const nodes = new Map();
  const world: EntityNode = {
    kind: 'entity',
    id: 'world',
    props: [['classname', 'worldspawn']],
    children: ids,
  };
  nodes.set('world', world);
  for (const id of ids) nodes.set(id, { ...makeBox([0, 0, 0], [64, 64, 64]), id });
  return buildDocument('world', nodes);
}

describe('groupNodesPatch', () => {
  it('groups nodes under a new group in one undoable patch', () => {
    const doc = docWith(['b1', 'b2', 'b3']);
    const { patch, id } = groupNodesPatch(doc, ['b1', 'b2'], createId);
    const next = applyPatch(doc, patch);
    const group = next.nodes.get(id) as GroupNode;
    expect(group.kind).toBe('group');
    expect(group.children).toEqual(['b1', 'b2']);
    // The group is appended and the brushes move out of the flat list.
    expect((next.nodes.get('world') as EntityNode).children).toEqual(['b3', id]);
    // Inverse restores exactly.
    const reverted = applyPatch(next, invertPatch(patch));
    expect(reverted.nodes.has(id)).toBe(false);
    expect((reverted.nodes.get('world') as EntityNode).children).toEqual(['b1', 'b2', 'b3']);
  });

  it('rejects empty selections and mixed parents', () => {
    const doc = docWith(['b1']);
    expect(() => groupNodesPatch(doc, [], createId)).toThrow('nothing selected');
  });
});

describe('ungroupNodesPatch', () => {
  it('dissolves the group, moving children to its parent', () => {
    const doc = docWith(['b1', 'b2']);
    const grouped = applyPatch(doc, groupNodesPatch(doc, ['b1', 'b2'], createId).patch);
    const groupId = [...grouped.nodes.values()].find((n) => n.kind === 'group')!.id;
    const next = applyPatch(grouped, ungroupNodesPatch(grouped, groupId));
    expect(next.nodes.has(groupId)).toBe(false);
    expect((next.nodes.get('world') as EntityNode).children.sort()).toEqual(['b1', 'b2']);
    expect(next.parent.get('b1')).toBe('world');
  });
});

describe('group flags and effective state', () => {
  it('hidden and locked propagate down the tree', () => {
    const doc = docWith(['b1']);
    const grouped = applyPatch(doc, groupNodesPatch(doc, ['b1'], createId).patch);
    const groupId = [...grouped.nodes.values()].find((n) => n.kind === 'group')!.id;
    const hidden = applyPatch(grouped, setGroupFlagPatch(grouped, groupId, 'hidden', true));
    expect(effectiveGroupState(hidden, 'b1')).toEqual({ hidden: true, locked: false });
    const locked = applyPatch(hidden, setGroupFlagPatch(hidden, groupId, 'locked', true));
    expect(effectiveGroupState(locked, 'b1')).toEqual({ hidden: true, locked: true });
    const unhidden = applyPatch(locked, setGroupFlagPatch(locked, groupId, 'hidden', false));
    expect(effectiveGroupState(unhidden, 'b1').hidden).toBe(false);
    expect((unhidden.nodes.get(groupId) as GroupNode).hidden).toBeUndefined();
  });

  it('subtreeIds walks the whole tree', () => {
    const doc = docWith(['b1', 'b2']);
    expect(subtreeIds(doc, 'world').sort()).toEqual(['b1', 'b2', 'world']);
    expect(subtreeIds(doc, 'b1')).toEqual(['b1']);
  });
});
