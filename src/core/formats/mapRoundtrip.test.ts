import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMap } from './mapParse';
import { writeMap, formatNumber } from './mapWrite';
import type { MapDocument, MapNode } from '@core/types/index';
import { analyzeBrush, validateBrush } from '@core/geom/index';

function normalize(doc: MapDocument): unknown {
  // ids of entities and brushes are generated per parse, so structural
  // comparison replaces every id with a deterministic traversal index
  const order = new Map<string, number>();
  let counter = 0;
  function visit(id: string): void {
    if (order.has(id)) {
      return;
    }
    order.set(id, counter++);
    const node = doc.nodes.get(id);
    if (node && node.kind !== 'brush') {
      for (const child of node.children) {
        visit(child);
      }
    }
  }
  visit(doc.worldspawn);
  function normNode(node: MapNode): unknown {
    const base = { kind: node.kind, id: order.get(node.id) };
    if (node.kind === 'brush') {
      return { ...base, faces: node.faces };
    }
    if (node.kind === 'entity') {
      return {
        ...base,
        props: node.props,
        children: node.children.map((c) => normNode(doc.nodes.get(c)!)),
      };
    }
    return {
      ...base,
      name: node.name,
      props: node.props,
      locked: node.locked,
      hidden: node.hidden,
      children: node.children.map((c) => normNode(doc.nodes.get(c)!)),
    };
  }
  return normNode(doc.nodes.get(doc.worldspawn)!);
}

describe('round-trip on the canonical fixture', () => {
  const text = readFileSync('tests/fixtures/simple.map', 'utf8');

  it('written text is identical to the canonical input', () => {
    const doc = parseMap(text);
    expect(writeMap(doc, { mode: 'export' }).text).toBe(text);
  });

  it('read-write-read produces identical data', () => {
    const first = parseMap(text);
    const second = parseMap(writeMap(first, { mode: 'export' }).text);
    expect(normalize(second)).toEqual(normalize(first));
  });

  it('clipboard mode round-trips the same way', () => {
    const doc = parseMap(text);
    expect(writeMap(doc, { mode: 'clipboard' }).text).toBe(text);
  });
});

describe('the renderer fixture room.map', () => {
  const text = readFileSync('tests/fixtures/room.map', 'utf8');

  it('is canonical: export writes it back byte for byte, without warnings', () => {
    const result = writeMap(parseMap(text), { mode: 'export' });
    expect(result.warnings).toEqual([]);
    expect(result.text).toBe(text);
  });

  it('read-write-read produces identical data', () => {
    const first = parseMap(text);
    expect(normalize(parseMap(writeMap(first, { mode: 'export' }).text))).toEqual(normalize(first));
  });

  it('every brush is valid, so every one of them renders', () => {
    const doc = parseMap(text);
    const brushes = [...doc.nodes.values()].filter((node) => node.kind === 'brush');
    expect(brushes).toHaveLength(11);
    for (const brush of brushes) {
      expect(validateBrush(analyzeBrush(brush)).reasons).toEqual([]);
    }
  });
});

describe('formatNumber', () => {
  it('writes integers without decimals', () => {
    expect(formatNumber(64)).toBe('64');
    expect(formatNumber(-64)).toBe('-64');
    expect(formatNumber(0)).toBe('0');
  });

  it('writes at most six decimals without trailing zeros', () => {
    expect(formatNumber(0.5)).toBe('0.5');
    expect(formatNumber(1 / 3)).toBe('0.333333');
    expect(formatNumber(2.1)).toBe('2.1');
    expect(formatNumber(-0.25)).toBe('-0.25');
  });
});
