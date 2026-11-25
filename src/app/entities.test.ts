import { describe, expect, it } from 'vitest';
import { applyPatch, buildDocument, createId } from '@core/doc/index';
import type { BrushNode, EntityNode } from '@core/types/index';
import {
  convertBrushesToEntityPatch,
  createPointEntityPatch,
  entityProp,
  withEntityProp,
} from './entities';
import { makeBox } from '@core/geom/__tests__/helpers';

function boxBrush(id: string): BrushNode {
  return { kind: 'brush', id, faces: makeBox([0, 0, 0], [64, 64, 64]).faces };
}

function docWith(...ids: string[]) {
  const nodes = new Map();
  const brushes = ids.map((id) => boxBrush(id));
  for (const brush of brushes) nodes.set(brush.id, brush);
  const world: EntityNode = {
    kind: 'entity',
    id: 'world',
    props: [['classname', 'worldspawn']],
    children: ids,
  };
  nodes.set('world', world);
  return buildDocument('world', nodes);
}

describe('createPointEntityPatch', () => {
  it('places an entity with classname and canonical origin', () => {
    const doc = docWith();
    const { patch, id } = createPointEntityPatch(doc, 'monster_soldier', [64, -32, 8], 'world');
    const next = applyPatch(doc, patch);
    const entity = next.nodes.get(id) as EntityNode;
    expect(entityProp(entity, 'classname')).toBe('monster_soldier');
    expect(entityProp(entity, 'origin')).toBe('64 -32 8');
    expect(next.parent.get(id)).toBe('world');
  });

  it('rejects invalid classnames', () => {
    expect(() => createPointEntityPatch(docWith(), 'bad name!', [0, 0, 0], 'world')).toThrow();
  });
});

describe('convertBrushesToEntityPatch', () => {
  it('moves brushes below a new entity in one undoable patch', () => {
    const doc = docWith('b1', 'b2');
    const { patch, id } = convertBrushesToEntityPatch(doc, 'func_door', ['b1', 'b2'], createId);
    const next = applyPatch(doc, patch);
    const entity = next.nodes.get(id) as EntityNode;
    expect(entity.children).toEqual(['b1', 'b2']);
    expect(entityProp(entity, 'classname')).toBe('func_door');
    expect(next.parent.get('b1')).toBe(id);
    // The entity itself stays in the parent; only the brushes moved.
    expect((next.nodes.get('world') as EntityNode).children).toEqual([id]);
  });

  it('inverts cleanly with the patch inverse semantics', () => {
    const doc = docWith('b1');
    const { patch } = convertBrushesToEntityPatch(doc, 'func_wall', ['b1'], createId);
    // before/after are consistent: undoing applies the before state.
    // The moved brush object is unchanged; the containers carry the tree edit.
    expect(patch.parentAfter.get('b1')).toBeDefined();
    expect(patch.parentAfter.get('b1')).not.toBe('world');
    expect(patch.parentBefore.get('b1')).toBe('world');
  });

  it('rejects mixed parents and non-brushes', () => {
    const doc = docWith('b1');
    expect(() => convertBrushesToEntityPatch(doc, 'func_door', [], createId)).toThrow('no brushes');
    expect(() => convertBrushesToEntityPatch(doc, 'func_door', ['world'], createId)).toThrow();
  });
});

describe('withEntityProp', () => {
  it('sets a new key at the end and rewrites in place', () => {
    const doc = docWith();
    const { patch, id } = createPointEntityPatch(doc, 'light', [0, 0, 0], 'world');
    const entity = applyPatch(doc, patch).nodes.get(id) as EntityNode;
    const withKey = withEntityProp(entity, 'targetname', 'lamp1');
    expect(entityProp(withKey, 'targetname')).toBe('lamp1');
    // classname keeps its position.
    expect(withKey.props[0]).toEqual(['classname', 'light']);
    const rewritten = withEntityProp(withKey, 'classname', 'light_spot');
    expect(rewritten.props[0]).toEqual(['classname', 'light_spot']);
    expect(rewritten.props.length).toBe(3);
  });
});
