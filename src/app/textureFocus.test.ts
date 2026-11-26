import { describe, expect, it } from 'vitest';
import { createEmptyDocument, applyPatch, addNodePatch } from '@core/doc/index';
import { makeBox } from '@core/geom/__tests__/helpers';
import type { MapDocument } from '@core/types/index';
import { stepTextureFocus, textureFocus } from './textureFocus';

function docWithBox(): { doc: MapDocument; id: string } {
  const doc = createEmptyDocument();
  const brush = { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'b1' };
  const patch = addNodePatch(doc, doc.worldspawn, brush);
  return { doc: applyPatch(doc, patch), id: 'b1' };
}

describe('textureFocus (T1.6)', () => {
  it('anchors on the single selected brush, starting at the brush', () => {
    const { doc, id } = docWithBox();
    const focus = textureFocus(doc, new Set([id]), []);
    expect(focus.brush).toBe(id);
    expect(focus.length).toBe(7);
    expect(focus.position).toBe(0);
  });

  it('anchors on the face pick brush and tracks the picked face', () => {
    const { doc, id } = docWithBox();
    const focus = textureFocus(doc, new Set(), [{ brush: id, face: 2 }]);
    expect(focus.position).toBe(3);
  });

  it('is unavailable for several brushes or several pick brushes', () => {
    const { doc, id } = docWithBox();
    expect(textureFocus(doc, new Set([id, 'other']), []).brush).toBeNull();
    expect(
      textureFocus(doc, new Set(), [
        { brush: id, face: 0 },
        { brush: 'other', face: 0 },
      ]).brush,
    ).toBeNull();
  });

  it('steps wrap around through brush and faces', () => {
    const { doc, id } = docWithBox();
    // forward from the brush: face 0, 1, …, 5, back to the brush
    let focus = textureFocus(doc, new Set([id]), []);
    const sequence: number[] = [];
    for (let i = 0; i < 7; i++) {
      const target = stepTextureFocus(focus, 1);
      sequence.push(target);
      focus = textureFocus(doc, new Set([id]), target === -1 ? [] : [{ brush: id, face: target }]);
    }
    expect(sequence).toEqual([0, 1, 2, 3, 4, 5, -1]);
    // backward from the brush: the last face
    const first = textureFocus(doc, new Set([id]), []);
    expect(stepTextureFocus(first, -1)).toBe(5);
  });

  it('returns -1 without an anchor', () => {
    const { doc } = docWithBox();
    const focus = textureFocus(doc, new Set(), []);
    expect(stepTextureFocus(focus, 1)).toBe(-1);
  });
});
