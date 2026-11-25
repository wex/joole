import { describe, expect, it } from 'vitest';
import { addNodePatch, applyPatch, createEmptyDocument, invertPatch } from '@core/doc/index';
import type { BrushNode, MapDocument } from '@core/types/index';
import { makeBox } from '../core/geom/__tests__/helpers';
import {
  allFacesOf,
  applyTexturePatch,
  fitTexturePatch,
  justifyTexturePatch,
  resetTexturePatch,
  shiftTexturePatch,
  rotateTexturePatch,
} from './textureOps';

function documentWithBox(): { doc: MapDocument; brush: BrushNode } {
  const brush = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
  let doc = createEmptyDocument();
  doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, brush));
  return { doc, brush };
}

describe('texture operations', () => {
  it('applyTexture sets the name on the target faces only and undo restores', () => {
    const { doc, brush } = documentWithBox();
    const patch = applyTexturePatch(doc, [{ brush: 'target', face: 0 }], 'e1u1/test')!;
    const edited = applyPatch(doc, patch);
    const after = edited.nodes.get('target') as BrushNode;
    expect(after.faces[0]!.tex.name).toBe('e1u1/test');
    expect(after.faces[1]!.tex.name).toBe(brush.faces[1]!.tex.name);
    const undone = applyPatch(edited, invertPatch(patch));
    expect(undone.nodes.get('target')).toEqual(brush);
  });

  it('shift and rotate stay integral', () => {
    const { doc } = documentWithBox();
    const faces = allFacesOf(doc, ['target']);
    const shifted = applyPatch(doc, shiftTexturePatch(doc, faces, 8, -8)!);
    const edited = applyPatch(shifted, rotateTexturePatch(shifted, faces, 90)!);
    for (const face of (edited.nodes.get('target') as BrushNode).faces) {
      expect(face.tex.offset).toEqual([8, -8]);
      expect(face.tex.rotation).toBe(90);
    }
  });

  it('reset restores defaults but keeps the texture name', () => {
    const { doc } = documentWithBox();
    const faces = allFacesOf(doc, ['target']);
    let edited = applyPatch(doc, shiftTexturePatch(doc, faces, 16, 16)!);
    edited = applyPatch(edited, applyTexturePatch(edited, faces, 'e1u1/x')!);
    const reset = resetTexturePatch(edited, faces)!;
    const after = applyPatch(edited, reset);
    for (const face of (after.nodes.get('target') as BrushNode).faces) {
      expect(face.tex.offset).toEqual([0, 0]);
      expect(face.tex.rotation).toBe(0);
      expect(face.tex.scale).toEqual([1, 1]);
      expect(face.tex.name).toBe('e1u1/x');
    }
  });

  it('fit scales the texture to cover the face once', () => {
    const { doc } = documentWithBox();
    const faces = allFacesOf(doc, ['target']);
    const patch = fitTexturePatch(doc, faces, 64, 64)!;
    const edited = applyPatch(doc, patch);
    for (const face of (edited.nodes.get('target') as BrushNode).faces) {
      // A 64-unit face with a 64 texel texture fits at scale 1.
      expect(face.tex.scale[0]).toBeCloseTo(1, 5);
      expect(face.tex.scale[1]).toBeCloseTo(1, 5);
      expect(Number.isInteger(face.tex.offset[0])).toBe(true);
    }
  });

  it('justify aligns the chosen edge in texture space', () => {
    const { doc } = documentWithBox();
    const faces = allFacesOf(doc, ['target']);
    let edited = applyPatch(doc, shiftTexturePatch(doc, faces, 13, 7)!);
    const patch = justifyTexturePatch(edited, faces, 'left', 64, 64)!;
    edited = applyPatch(edited, patch);
    for (const face of (edited.nodes.get('target') as BrushNode).faces) {
      expect(Number.isInteger(face.tex.offset[0])).toBe(true);
    }
  });

  it('returns null for unknown faces', () => {
    const { doc } = documentWithBox();
    expect(applyTexturePatch(doc, [{ brush: 'missing', face: 0 }], 'x')).toBeNull();
    expect(applyTexturePatch(doc, [{ brush: 'target', face: 99 }], 'x')).toBeNull();
  });
});
