import { describe, expect, it } from 'vitest';
import { analyzeBrush, mat4Translation } from '@core/geom/index';
import { applyPatch, buildDocument } from '@core/doc/index';
import { createSnapToGridCommand, createTransformCommand } from './transformCommands';
import { testDocument } from '../core/doc/__tests__/helpers';
import { makeBox } from '../core/geom/__tests__/helpers';

function validDocument() {
  const base = testDocument();
  const nodes = new Map(base.nodes);
  nodes.set('b1', { ...makeBox([0, 0, 0], [64, 64, 64]), id: 'b1' });
  nodes.set('b2', { ...makeBox([128, 0, 0], [192, 64, 64]), id: 'b2' });
  return buildDocument(base.worldspawn, nodes);
}

describe('transform commands', () => {
  it('moving a group moves every descendant brush once', () => {
    const doc = validDocument();
    const command = createTransformCommand('Move group', ['g1'], mat4Translation([8, 0, 0]));
    const next = applyPatch(doc, command.run(doc));
    expect(command.label).toBe('Move group');
    const b1 = next.nodes.get('b1');
    const b2 = next.nodes.get('b2');
    expect(b1?.kind).toBe('brush');
    expect(b2?.kind).toBe('brush');
    if (b1?.kind === 'brush' && b2?.kind === 'brush') {
      expect(analyzeBrush(b1).aabb!.min[0]).toBe(0);
      expect(analyzeBrush(b2).aabb!.min[0]).toBe(136);
    }
  });

  it('snap-to-grid produces a patch for the selected brushes', () => {
    const doc = validDocument();
    const command = createSnapToGridCommand(['b1', 'g1'], 8);
    const patch = command.run(doc);
    expect(patch.after.has('b1')).toBe(true);
    expect(patch.after.has('b2')).toBe(true);
    expect(patch.after.has('g1')).toBe(false);
  });
});
