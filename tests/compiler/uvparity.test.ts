import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeBrush } from '@core/geom/index';
import { texAxes } from '@core/geom/texAxes';
import { parseMap } from '@core/formats/index';
import type { BrushNode } from '@core/types/index';
import { runQbsp3Oracle } from './runQbsp3';

interface TexinfoEntry {
  readonly vecs: readonly [readonly number[], readonly number[]];
  readonly flags: number;
  readonly value: number;
  readonly texture: string;
}

/** Parses the texinfo lump (lump 5) of a Quake 2 bsp: 76 bytes per entry. */
function texinfoOf(bsp: Uint8Array): TexinfoEntry[] {
  const view = new DataView(bsp.buffer, bsp.byteOffset, bsp.byteLength);
  const lumpOffset = view.getInt32(8 + 5 * 8, true);
  const lumpLength = view.getInt32(8 + 5 * 8 + 4, true);
  const out: TexinfoEntry[] = [];
  for (let at = lumpOffset; at + 76 <= lumpOffset + lumpLength; at += 76) {
    const s: number[] = [];
    const t: number[] = [];
    for (let i = 0; i < 4; i++) {
      s.push(view.getFloat32(at + i * 4, true));
      t.push(view.getFloat32(at + 16 + i * 4, true));
    }
    const flags = view.getInt32(at + 32, true);
    const value = view.getInt32(at + 36, true);
    let texture = '';
    for (let i = 0; i < 32; i++) {
      const c = view.getUint8(at + 40 + i);
      if (c === 0) break;
      texture += String.fromCharCode(c);
    }
    out.push({ vecs: [s, t], flags, value, texture });
  }
  return out;
}

interface ExpectedEntry {
  readonly vecs: readonly [readonly number[], readonly number[]];
  readonly texture: string;
  readonly faceLabel: string;
}

const EPS = 1e-3;

function vecClose(a: readonly number[], b: readonly number[]): boolean {
  return a.every((v, i) => Math.abs(v - b[i]!) <= EPS + EPS * Math.abs(b[i]!));
}

function matches(expected: ExpectedEntry, actual: TexinfoEntry): boolean {
  return (
    expected.texture === actual.texture &&
    vecClose(expected.vecs[0], actual.vecs[0]) &&
    vecClose(expected.vecs[1], actual.vecs[1])
  );
}

describe('editor and game UV parity', () => {
  it('texAxes matches the texinfo vecs qbsp3 writes for every face', async () => {
    const mapText = readFileSync('tests/fixtures/uvparity.map', 'utf8');
    const doc = parseMap(mapText);

    // The expected entries: texAxes of every face of every brush, computed
    // from the same planes the parser derives. The truncation of decimal
    // offsets and rotations happens inside texAxes, exactly as qbsp3's atoi.
    const expected: ExpectedEntry[] = [];
    for (const [id, node] of doc.nodes) {
      if (node.kind !== 'brush') continue;
      const brush = node as BrushNode;
      const analysis = analyzeBrush(brush);
      brush.faces.forEach((face, faceIndex) => {
        const plane = analysis.planes[faceIndex];
        if (!plane) throw new Error(`face ${faceIndex} of ${id} has no plane`);
        const axes = texAxes(plane, face.tex);
        expected.push({
          texture: face.tex.name,
          vecs: [
            [axes.s[0], axes.s[1], axes.s[2], axes.shiftS],
            [axes.t[0], axes.t[1], axes.t[2], axes.shiftT],
          ],
          faceLabel: `${id} face ${faceIndex} (${face.tex.name} rot ${face.tex.rotation})`,
        });
      });
    }
    expect(expected.length).toBeGreaterThan(20);

    const qbsp = await runQbsp3Oracle(mapText, 'uvparity', ['e2u1/mine10_1']);
    expect(qbsp.bsp.byteLength).toBeGreaterThan(256);
    const actual = texinfoOf(new Uint8Array(qbsp.bsp));
    expect(actual.length).toBeGreaterThan(0);

    // Every compiled texinfo entry must match at least one source face, and
    // every source face must be represented by at least one entry. qbsp3
    // deduplicates exact entries, so this is a set comparison in both
    // directions rather than a count comparison.
    const unmatchedActual = actual.filter(
      (entry) => !expected.some((candidate) => matches(candidate, entry)),
    );
    const unmatchedExpected = expected.filter(
      (candidate) => !actual.some((entry) => matches(candidate, entry)),
    );
    expect(
      unmatchedActual,
      `unmatched texinfo entries: ${JSON.stringify(unmatchedActual)}`,
    ).toEqual([]);
    expect(
      unmatchedExpected.map((entry) => entry.faceLabel),
      'every source face must appear in the bsp texinfo',
    ).toEqual([]);
  }, 30000);
});
