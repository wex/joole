import { describe, expect, it } from 'vitest';
import { addNodePatch, applyPatch, createEmptyDocument } from '@core/doc/index';
import { makeBox } from '../geom/__tests__/helpers';
import { readProject, writeProject } from './project';

describe('Joole project format', () => {
  it('round-trips a document with exact float64 values', () => {
    let doc = createEmptyDocument();
    const brush = { ...makeBox([0.1, 0, 0], [64.123456789, 64, 64]), id: 'b' };
    doc = applyPatch(doc, addNodePatch(doc, doc.worldspawn, brush));
    const parsed = readProject(writeProject(doc));
    expect(parsed.worldspawn).toBe(doc.worldspawn);
    const copy = parsed.nodes.get('b');
    expect(copy).toEqual(brush);
    if (copy?.kind === 'brush') {
      expect(copy.faces[0]!.points[0]![0]).toBe(brush.faces[0]!.points[0]![0]);
    }
  });

  it('rejects other formats and future versions', () => {
    expect(() => readProject('{"format":"x","version":1}')).toThrow('not a Joole project');
    expect(() => readProject('{"format":"joole-project","version":2}')).toThrow('unsupported');
  });
});
