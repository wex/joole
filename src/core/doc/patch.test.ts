import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { BrushNode, EntityNode, Id, MapDocument, MapNode, Patch } from '@core/types/index';
import { applyPatch, invertPatch } from './patch';
import { testDocument } from './__tests__/helpers';

function docFromFixture(): MapDocument {
  return testDocument();
}

describe('applyPatch', () => {
  it('replaces nodes immutably, sharing the rest', () => {
    const doc = docFromFixture();
    const entity = [...doc.nodes.values()].find(
      (n) => n.kind === 'entity' && n.id !== doc.worldspawn,
    ) as EntityNode;
    const modified: EntityNode = { ...entity, props: [...entity.props, ['speed', '200']] };
    const patch: Patch = {
      before: new Map([[entity.id, entity]]),
      after: new Map([[entity.id, modified]]),
      parentBefore: new Map(),
      parentAfter: new Map(),
    };
    const next = applyPatch(doc, patch);
    expect(next.nodes.get(entity.id)).not.toBe(doc.nodes.get(entity.id));
    expect((next.nodes.get(entity.id) as EntityNode).props).toContainEqual(['speed', '200']);
    // unchanged nodes are shared
    const brush = [...doc.nodes.values()].find((n) => n.kind === 'brush')!;
    expect(next.nodes.get(brush.id)).toBe(doc.nodes.get(brush.id));
    // the input is untouched
    expect((doc.nodes.get(entity.id) as EntityNode).props).not.toContainEqual(['speed', '200']);
  });

  it('removes nodes on null and updates the parent map', () => {
    const doc = docFromFixture();
    const brush = [...doc.nodes.values()].find((n) => n.kind === 'brush') as BrushNode;
    const parentId = doc.parent.get(brush.id)!;
    const parentNode = doc.nodes.get(parentId) as EntityNode | GroupNodeLike;
    const shrunk = { ...parentNode, children: parentNode.children.filter((c) => c !== brush.id) };
    const patch: Patch = {
      before: new Map([
        [brush.id, brush],
        [parentId, parentNode as MapNode],
      ]),
      after: new Map<Id, MapNode | null>([
        [brush.id, null],
        [parentId, shrunk as MapNode],
      ]),
      parentBefore: new Map([[brush.id, parentId]]),
      parentAfter: new Map([[brush.id, null]]),
    };
    const next = applyPatch(doc, patch);
    expect(next.nodes.has(brush.id)).toBe(false);
    expect(next.parent.has(brush.id)).toBe(false);
  });
});

type GroupNodeLike = { children: string[] };

describe('fast-check inversion property', () => {
  it('applyPatch(invert(p)) after applyPatch(p) returns the original', () => {
    const doc = docFromFixture();
    const ids = [...doc.nodes.keys()];
    const indexArb = fc.nat({ max: ids.length - 1 });
    fc.assert(
      fc.property(
        fc.array(indexArb, { minLength: 1, maxLength: 4 }),
        fc.boolean(),
        (indices, remove) => {
          const before = new Map<Id, MapNode | null>();
          const after = new Map<Id, MapNode | null>();
          for (const i of new Set(indices)) {
            const id = ids[i]!;
            const node = doc.nodes.get(id)!;
            before.set(id, node);
            if (remove) {
              after.set(id, null);
            } else if (node.kind === 'entity') {
              after.set(id, { ...node, props: [...node.props, ['x', 'y']] });
            } else {
              after.set(id, { ...node });
            }
          }
          const patch: Patch = {
            before,
            after,
            parentBefore: new Map(),
            parentAfter: new Map(),
          };
          const forward = applyPatch(doc, patch);
          const back = applyPatch(forward, invertPatch(patch));
          expect(back.nodes).toEqual(doc.nodes);
          expect(back.parent).toEqual(doc.parent);
        },
      ),
      { numRuns: 50 },
    );
  });
});
