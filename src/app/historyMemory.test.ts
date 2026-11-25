import { describe, expect, it } from 'vitest';
import type { BrushNode, EntityNode, Patch } from '@core/types/index';
import { estimateNodeBytes, estimatePatchBytes, HISTORY_MEMORY_CONSTANTS } from './historyMemory';
import { testDocument } from '../core/doc/__tests__/helpers';

describe('history memory estimate', () => {
  it('uses the documented structural formula', () => {
    const doc = testDocument();
    const brush = doc.nodes.get('b1') as BrushNode;
    const expected =
      HISTORY_MEMORY_CONSTANTS.nodeOverheadBytes +
      brush.faces.length * HISTORY_MEMORY_CONSTANTS.brushFaceBytes +
      brush.faces.length *
        (HISTORY_MEMORY_CONSTANTS.stringBaseBytes +
          brush.faces[0]!.tex.name.length * HISTORY_MEMORY_CONSTANTS.stringBytesPerChar);
    expect(estimateNodeBytes(brush)).toBe(expected);

    const entity = doc.nodes.get('e1') as EntityNode;
    expect(estimateNodeBytes(entity)).toBeGreaterThan(HISTORY_MEMORY_CONSTANTS.nodeOverheadBytes);
  });

  it('does not charge node versions still shared with the current document', () => {
    const doc = testDocument();
    const entity = doc.nodes.get('e1') as EntityNode;
    const changed = { ...entity, props: [...entity.props, ['x', 'y']] } as EntityNode;
    const patch: Patch = {
      before: new Map([[entity.id, entity]]),
      after: new Map([[entity.id, changed]]),
      parentBefore: new Map(),
      parentAfter: new Map(),
    };
    expect(estimatePatchBytes(patch, doc)).toBe(estimateNodeBytes(changed));
  });

  it('charges distinct unshared versions once per patch', () => {
    const doc = testDocument();
    const entity = doc.nodes.get('e1') as EntityNode;
    const changed = { ...entity, props: [...entity.props, ['x', 'y']] } as EntityNode;
    const patch: Patch = {
      before: new Map([[entity.id, changed]]),
      after: new Map([[entity.id, changed]]),
      parentBefore: new Map(),
      parentAfter: new Map(),
    };
    expect(estimatePatchBytes(patch, doc)).toBe(estimateNodeBytes(changed));
  });
});
