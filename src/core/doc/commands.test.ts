import { describe, expect, it } from 'vitest';
import type { BrushNode, EntityNode, GroupNode } from '@core/types/index';
import { addNodePatch, removeNodePatch, reparentNodePatch, replaceNodePatch } from './commands';
import { applyPatch } from './patch';
import { testDocument } from './__tests__/helpers';

function brush(id: string): BrushNode {
  const existing = testDocument().nodes.get('b1') as BrushNode;
  return { ...existing, id };
}

describe('document command patch helpers', () => {
  it('addNodePatch inserts a node into a parent at the requested index', () => {
    const doc = testDocument();
    const node = brush('new-brush');
    const next = applyPatch(doc, addNodePatch(doc, 'g1', node, 0));
    const group = next.nodes.get('g1') as GroupNode;
    expect(group.children[0]).toBe('new-brush');
    expect(next.parent.get('new-brush')).toBe('g1');
    expect(next.nodes.get('b1')).toBe(doc.nodes.get('b1'));
  });

  it('removeNodePatch removes a subtree and its parent links', () => {
    const doc = testDocument();
    const patch = removeNodePatch(doc, 'g1');
    const next = applyPatch(doc, patch);
    expect(next.nodes.has('g1')).toBe(false);
    expect(next.nodes.has('b2')).toBe(false);
    expect(next.nodes.has('e1')).toBe(false);
    expect(next.parent.has('b2')).toBe(false);
    expect((next.nodes.get('w0') as EntityNode).children).toEqual(['b1']);
  });

  it('replaceNodePatch replaces only the node object', () => {
    const doc = testDocument();
    const entity = doc.nodes.get('e1') as EntityNode;
    const replacement: EntityNode = { ...entity, props: [...entity.props, ['speed', '100']] };
    const next = applyPatch(doc, replaceNodePatch(doc, 'e1', replacement));
    expect((next.nodes.get('e1') as EntityNode).props).toContainEqual(['speed', '100']);
    expect(next.parent.get('e1')).toBe(doc.parent.get('e1'));
  });

  it('reparentNodePatch updates both containers and the parent map', () => {
    const doc = testDocument();
    const next = applyPatch(doc, reparentNodePatch(doc, 'b1', 'g1', 1));
    expect((next.nodes.get('w0') as EntityNode).children).toEqual(['g1']);
    expect((next.nodes.get('g1') as GroupNode).children).toEqual(['b2', 'b1', 'e1']);
    expect(next.parent.get('b1')).toBe('g1');
  });

  it('reparentNodePatch can reorder within the same parent', () => {
    const doc = testDocument();
    const next = applyPatch(doc, reparentNodePatch(doc, 'e1', 'g1', 0));
    expect((next.nodes.get('g1') as GroupNode).children).toEqual(['e1', 'b2']);
  });

  it('rejects operations that would corrupt the tree', () => {
    const doc = testDocument();
    expect(() => removeNodePatch(doc, 'w0')).toThrow('worldspawn');
    expect(() => reparentNodePatch(doc, 'g1', 'e1')).toThrow('descendant');
    expect(() => reparentNodePatch(doc, 'b1', 'b2')).toThrow('children');
    expect(() => addNodePatch(doc, 'missing', brush('x'))).toThrow('parent');
    const entity = doc.nodes.get('e1') as EntityNode;
    expect(() => replaceNodePatch(doc, 'e1', { ...entity, children: ['b1'] })).toThrow('children');
    expect(() => replaceNodePatch(doc, 'e1', { ...brush('e1'), id: 'e1' })).toThrow(
      'from entity to brush',
    );
  });
});
