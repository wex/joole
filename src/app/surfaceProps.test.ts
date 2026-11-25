import { describe, expect, it } from 'vitest';
import { SURF_LIGHT, SURF_SKY, CONTENTS_WATER, CONTENTS_DETAIL } from '@game/q2/index';
import { addNodePatch, applyPatch, createEmptyDocument, invertPatch } from '@core/doc/index';
import type { BrushNode, MapDocument } from '@core/types/index';
import { makeBox } from '../core/geom/__tests__/helpers';
import { editSurfacePatch, readSurfaceState, toggleBitPatch } from './surfaceProps';

function documentWithBox(): { doc: MapDocument; brush: BrushNode } {
  const brush = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'target' };
  let doc = createEmptyDocument();
  doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, brush));
  return { doc, brush };
}

const faces = [{ brush: 'target', face: 0 }];

describe('surface properties', () => {
  it('reads a uniform off state initially', () => {
    const { doc } = documentWithBox();
    const state = readSurfaceState(doc, faces, [SURF_LIGHT, SURF_SKY], [CONTENTS_WATER]);
    expect(state.flags.get(SURF_LIGHT)).toBe('off');
    expect(state.contents.get(CONTENTS_WATER)).toBe('off');
    expect(state.value).toBe(0);
  });

  it('toggle turns a bit on for every face, then off again, undoably', () => {
    const { doc } = documentWithBox();
    const on = toggleBitPatch(doc, faces, 'flags', SURF_SKY)!;
    let edited = applyPatch(doc, on);
    expect((edited.nodes.get('target') as BrushNode).faces[0]!.tex.flags & SURF_SKY).toBe(SURF_SKY);
    expect((edited.nodes.get('target') as BrushNode).faces[0]!.tex.attribsInFile).toBe(true);
    const off = toggleBitPatch(edited, faces, 'flags', SURF_SKY)!;
    edited = applyPatch(edited, off);
    expect((edited.nodes.get('target') as BrushNode).faces[0]!.tex.flags & SURF_SKY).toBe(0);
    const undone = applyPatch(applyPatch(doc, on), invertPatch(on));
    expect((undone.nodes.get('target') as BrushNode).faces[0]!.tex.flags).toBe(0);
  });

  it('reports mixed when faces differ and toggle unifies to on', () => {
    const { doc } = documentWithBox();
    const one = toggleBitPatch(doc, [{ brush: 'target', face: 0 }], 'flags', SURF_LIGHT)!;
    const edited = applyPatch(doc, one);
    const all = Array.from({ length: 6 }, (_, face) => ({ brush: 'target', face }));
    const state = readSurfaceState(edited, all, [SURF_LIGHT], []);
    expect(state.flags.get(SURF_LIGHT)).toBe('mixed');
    const unify = toggleBitPatch(edited, all, 'flags', SURF_LIGHT)!;
    const unified = applyPatch(edited, unify);
    for (const face of (unified.nodes.get('target') as BrushNode).faces) {
      expect(face.tex.flags & SURF_LIGHT).toBe(SURF_LIGHT);
    }
  });

  it('edits value and contents with attribsInFile marking', () => {
    const { doc } = documentWithBox();
    const patch = editSurfacePatch(doc, faces, (tex) => ({
      ...tex,
      contents: tex.contents | CONTENTS_DETAIL,
      value: 300,
    }))!;
    const edited = applyPatch(doc, patch);
    const tex = (edited.nodes.get('target') as BrushNode).faces[0]!.tex;
    expect(tex.contents & CONTENTS_DETAIL).toBe(CONTENTS_DETAIL);
    expect(tex.value).toBe(300);
    expect(tex.attribsInFile).toBe(true);
    // Untouched faces keep their original attribsInFile state.
    expect((edited.nodes.get('target') as BrushNode).faces[1]!.tex.attribsInFile).toBe(false);
  });

  it('reads a mixed value across differing faces', () => {
    const { doc } = documentWithBox();
    const patch = editSurfacePatch(doc, faces, (tex) => ({ ...tex, value: 100 }))!;
    const edited = applyPatch(doc, patch);
    const all = Array.from({ length: 6 }, (_, face) => ({ brush: 'target', face }));
    expect(readSurfaceState(edited, all, [], []).value).toBe('mixed');
    expect(readSurfaceState(edited, faces, [], []).value).toBe(100);
  });
});
