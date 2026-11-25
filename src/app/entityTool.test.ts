import { describe, expect, it } from 'vitest';
import { buildDocument, createEmptyDocument } from '@core/doc/index';
import { EntityTool } from './tools';
import type { EntityNode } from '@core/types/index';

function event(x: number, y: number, z: number) {
  return {
    type: 'down' as const,
    button: 0,
    view: 'xz' as const,
    point: [x, y, z] as [number, number, number],
    tolerance: 4,
    shift: false,
    ctrl: false,
  };
}

describe('EntityTool', () => {
  it('a click emits the placement command snapped to the grid', () => {
    const doc = createEmptyDocument();
    const tool = new EntityTool(
      () => doc,
      () => 'monster_soldier',
      () => doc.worldspawn,
      8,
    );
    const output = tool.pointer(event(30, 0, 33));
    expect(output.commands.length).toBe(1);
    const patch = output.commands[0]!.run(doc);
    const next = buildDocument(doc.worldspawn, new Map());
    void next;
    const entity = [...patch.after.values()].find((n) => n?.kind === 'entity') as EntityNode;
    expect(entity.props).toContainEqual(['classname', 'monster_soldier']);
    // 30/33 snap to the grid step 8: 32/32.
    expect(entity.props.find(([k]) => k === 'origin')![1]).toBe('32 0 32');
    expect(output.selection?.size).toBe(1);
  });

  it('ignores non-primary buttons and move events', () => {
    const doc = createEmptyDocument();
    const tool = new EntityTool(
      () => doc,
      () => 'light',
      () => doc.worldspawn,
      8,
    );
    expect(tool.pointer({ ...event(0, 0, 0), button: 2 }).commands.length).toBe(0);
    expect(tool.pointer({ ...event(0, 0, 0), type: 'move' }).commands.length).toBe(0);
  });

  it('places nothing without a current class', () => {
    const doc = createEmptyDocument();
    const tool = new EntityTool(
      () => doc,
      () => '',
      () => doc.worldspawn,
      8,
    );
    expect(tool.pointer(event(0, 0, 0)).commands.length).toBe(0);
  });
});
