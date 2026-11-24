import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMap } from './mapParse';
import { writeMap } from './mapWrite';
import type { MapDocument } from '@core/types/index';

const mapsDir = process.env.JOOLE_MAPS_DIR;

function summarize(doc: MapDocument): unknown {
  // structural summary independent of generated ids
  const out: unknown[] = [];
  for (const node of doc.nodes.values()) {
    if (node.kind === 'brush') {
      out.push({ kind: node.kind, faces: node.faces });
    } else if (node.kind === 'entity') {
      out.push({ kind: node.kind, props: node.props, childCount: node.children.length });
    } else {
      out.push({ kind: node.kind, name: node.name, props: node.props });
    }
  }
  return out;
}

// skipped unless JOOLE_MAPS_DIR points at id's released map sources
describe.skipIf(!mapsDir)("id's released map sources", () => {
  it('every .map round-trips: identical data, stable text', () => {
    const files = readdirSync(mapsDir!).filter((f) => f.toLowerCase().endsWith('.map'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(join(mapsDir!, file), 'utf8');
      const first = parseMap(text);
      const written1 = writeMap(first, { mode: 'export' });
      const second = parseMap(written1);
      const written2 = writeMap(second, { mode: 'export' });
      // the text is stable after the first normalising write
      expect(written2).toBe(written1);
      // the data structure is identical apart from generated ids
      expect(summarize(second)).toEqual(summarize(first));
    }
  });
});
