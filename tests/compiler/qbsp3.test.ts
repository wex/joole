import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectCleanQbsp3, runQbsp3Oracle } from './runQbsp3';
import { addNodePatch, applyPatch, createEmptyDocument } from '@core/doc/index';
import { writeMap } from '@core/formats/index';
import { hollowBrush } from '@core/geom/index';
import { makeBox } from '@core/geom/__tests__/helpers';
import type { BrushNode } from '@core/types/index';

describe('qbsp3 wasm oracle', () => {
  it('compiles the sealed room fixture without brush warnings or leaks', async () => {
    const result = await runQbsp3Oracle(readFileSync('tests/fixtures/room.map', 'utf8'), 'room', [
      'e2u1/mine10_1',
      'e2u1/mine10_2',
      'e2u1/glass',
      'e1u1/sky1',
      'e1u1/clip',
    ]);
    expect(() => expectCleanQbsp3(result)).not.toThrow();
    expect(result.bsp.byteLength).toBeGreaterThan(1024);
  });
  it('compiles a hollowed brush shell without brush warnings or leaks', async () => {
    const source = makeBox([0, 0, 0], [128, 128, 128]);
    const hollow = hollowBrush(source, 16, 'inward');
    expect(hollow.ok).toBe(true);
    if (!hollow.ok) return;
    let doc = createEmptyDocument();
    for (const [index, piece] of (hollow.value as BrushNode[]).entries()) {
      doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, { ...piece, id: `shell${index}` }));
    }
    doc = applyPatch(
      doc,
      addNodePatch(doc, doc.worldspawn, {
        kind: 'entity',
        id: 'player',
        props: [
          ['classname', 'info_player_start'],
          ['origin', '64 64 64'],
        ],
        children: [],
      }),
    );
    const exported = writeMap(doc, { mode: 'export' });
    expect(exported.warnings).toEqual([]);
    const result = await runQbsp3Oracle(exported.text, 'hollow', ['e2u1/mine10_1']);
    expect(() => expectCleanQbsp3(result)).not.toThrow();
  });
});
