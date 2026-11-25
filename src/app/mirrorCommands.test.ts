import { describe, expect, it } from 'vitest';
import { addNodePatch, applyPatch, createEmptyDocument, invertPatch } from '@core/doc/index';
import { analyzeBrush, validateBrush } from '@core/geom/index';
import type { BrushNode, MapDocument } from '@core/types/index';
import { makeBox } from '../core/geom/__tests__/helpers';
import { createFlipCommand, createRotate90Command, mirrorSelectionPatch } from './mirrorCommands';

function brush(
  id: string,
  min: [number, number, number],
  max: [number, number, number],
): BrushNode {
  return { ...makeBox(min, max), id };
}

function documentWith(brushes: BrushNode[]): MapDocument {
  let doc = createEmptyDocument();
  for (const b of brushes) doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, b));
  return doc;
}

describe('createFlipCommand', () => {
  it('flips a brush in place across the selection center and undo restores it', () => {
    const target = brush('a', [0, 0, 0], [64, 32, 16]);
    const doc = documentWith([target]);
    const command = createFlipCommand(['a'], 0);
    const patch = command.run(doc);
    const edited = applyPatch(doc, patch);
    const flipped = edited.nodes.get('a') as BrushNode;
    expect(validateBrush(analyzeBrush(flipped)).valid).toBe(true);
    expectVecEqual(analyzeBrush(flipped).aabb!.min, [0, 0, 0]);
    expect(analyzeBrush(flipped).volume).toBeCloseTo(64 * 32 * 16, 5);
    const undone = applyPatch(edited, invertPatch(patch));
    expect(undone.nodes.get('a')).toEqual(target);
  });

  it('moves an asymmetric brush to the other side of the selection center', () => {
    const doc = documentWith([
      brush('a', [0, 0, 0], [64, 32, 16]),
      brush('b', [64, 0, 0], [96, 32, 16]),
    ]);
    const command = createFlipCommand(['a', 'b'], 0);
    const edited = applyPatch(doc, command.run(doc));
    // Center of combined bounds x: 48. a spans 0..64 -> 32..96.
    expectVecEqual(analyzeBrush(edited.nodes.get('a') as BrushNode).aabb!.min, [32, 0, 0]);
    expectVecEqual(analyzeBrush(edited.nodes.get('a') as BrushNode).aabb!.max, [96, 32, 16]);
  });
});

describe('createRotate90Command', () => {
  it('rotates exactly about the selection center keeping integer points', () => {
    const doc = documentWith([brush('a', [0, 0, 0], [64, 32, 16])]);
    const command = createRotate90Command(['a']);
    const edited = applyPatch(doc, command.run(doc));
    const rotated = edited.nodes.get('a') as BrushNode;
    expect(validateBrush(analyzeBrush(rotated)).valid).toBe(true);
    // Center (32, 16): x range 0..64 becomes y range, width 64 around cy=16 -> -16..48.
    expectVecEqual(analyzeBrush(rotated).aabb!.min, [16, -16, 0]);
    expectVecEqual(analyzeBrush(rotated).aabb!.max, [48, 48, 16]);
    for (const face of rotated.faces) {
      for (const point of face.points) {
        for (const c of point) expect(Number.isInteger(c)).toBe(true);
      }
    }
  });
});

describe('mirrorSelectionPatch', () => {
  it('duplicates the selection and flips the copies, leaving the originals intact', () => {
    const target = brush('a', [0, 0, 0], [64, 32, 16]);
    const doc = documentWith([target]);
    const result = mirrorSelectionPatch(doc, new Set(['a']), 0)!;
    expect(result.targets).toBe(1);
    expect(result.ids).toHaveLength(1);
    const edited = applyPatch(doc, result.patch);
    expect(edited.nodes.get('a')).toEqual(target);
    const copy = edited.nodes.get(result.ids[0]!) as BrushNode;
    expect(validateBrush(analyzeBrush(copy)).valid).toBe(true);
    const worldspawn = edited.nodes.get(edited.worldspawn)!;
    expect('children' in worldspawn ? worldspawn.children : []).toHaveLength(2);
    const undone = applyPatch(edited, invertPatch(result.patch));
    expect(undone.nodes.get(result.ids[0]!)).toBeUndefined();
    const restoredRoot = undone.nodes.get(edited.worldspawn)!;
    expect('children' in restoredRoot ? restoredRoot.children : []).toHaveLength(1);
  });

  it('returns null without a selected brush', () => {
    expect(mirrorSelectionPatch(createEmptyDocument(), new Set(), 0)).toBeNull();
  });
});

function expectVecEqual(actual: readonly number[], expected: readonly number[]): void {
  for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i]!, 6);
}
