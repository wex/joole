import { describe, expect, it } from 'vitest';
import type { EntityNode, GroupNode, MapNode } from '@core/types/index';
import {
  allBrushesOf,
  ancestorsOf,
  brushesOf,
  buildDocument,
  childrenOf,
  createEmptyDocument,
} from './document';
import { testDocument } from './__tests__/helpers';

describe('buildDocument and queries', () => {
  it('builds a consistent document', () => {
    const doc = testDocument();
    expect(doc.parent.get('b1')).toBe('w0');
    expect(doc.parent.get('b2')).toBe('g1');
    expect(doc.parent.get('e1')).toBe('g1');
  });

  it('createEmptyDocument has only a worldspawn', () => {
    const doc = createEmptyDocument();
    expect(doc.nodes.size).toBe(1);
    expect(doc.nodes.get(doc.worldspawn)?.kind).toBe('entity');
  });

  it('childrenOf returns direct children in order', () => {
    const doc = testDocument();
    const worldChildren = childrenOf(doc, doc.worldspawn);
    expect(worldChildren.length).toBeGreaterThan(0);
    expect(worldChildren.some((n) => n.kind === 'group')).toBe(true);
  });

  it('ancestorsOf walks up to the worldspawn', () => {
    const doc = testDocument();
    const brush = [...doc.nodes.values()].find((n) => n.kind === 'brush')!;
    const chain = ancestorsOf(doc, brush.id);
    expect(chain.length).toBeGreaterThan(0);
    expect(chain[chain.length - 1]!.id).toBe(doc.worldspawn);
  });

  it('brushesOf returns only direct brush children', () => {
    const doc = testDocument();
    const group = [...doc.nodes.values()].find((n) => n.kind === 'group')!;
    const direct = brushesOf(doc, group.id);
    expect(direct.length).toBe(1);
    expect(direct[0]!.kind).toBe('brush');
  });

  it('allBrushesOf finds nested brushes', () => {
    const doc = testDocument();
    expect(allBrushesOf(doc, doc.worldspawn).length).toBe(2);
  });

  it('buildDocument rejects unreachable nodes', () => {
    const doc = createEmptyDocument();
    const orphan: GroupNode = { kind: 'group', id: 'orphan', name: '', props: [], children: [] };
    const nodes = new Map<string, MapNode>(doc.nodes);
    nodes.set(orphan.id, orphan);
    expect(() => buildDocument(doc.worldspawn, nodes)).toThrow('not reachable');
  });

  it('buildDocument rejects missing children', () => {
    const world: EntityNode = {
      kind: 'entity',
      id: 'w',
      props: [['classname', 'worldspawn']],
      children: ['missing'],
    };
    expect(() => buildDocument('w', new Map([['w', world]]))).toThrow('missing child');
  });
});
