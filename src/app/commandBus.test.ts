import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { BrushNode, Command, EntityNode, Id, MapDocument } from '@core/types/index';
import { createEmptyDocument } from '@core/doc/index';
import {
  addNodePatch,
  removeNodePatch,
  reparentNodePatch,
  replaceNodePatch,
} from '@core/doc/index';
import { CommandBus } from './commandBus';
import { testDocument } from '../core/doc/__tests__/helpers';

function testBrush(id: string): BrushNode {
  const source = testDocument().nodes.get('b1') as BrushNode;
  return { ...source, id };
}

function addBrushCommand(id: string, mergeKey?: string): Command {
  return {
    label: `Add ${id}`,
    mergeKey,
    run: (doc) => addNodePatch(doc, doc.worldspawn, testBrush(id)),
  };
}

function renameWorldspawn(value: string, mergeKey?: string): Command {
  return {
    label: 'Rename worldspawn',
    mergeKey,
    run: (doc) => {
      const world = doc.nodes.get(doc.worldspawn) as EntityNode;
      return replaceNodePatch(doc, doc.worldspawn, {
        ...world,
        props: [...world.props.filter(([key]) => key !== 'message'), ['message', value]],
      });
    },
  };
}

function worldMessage(doc: MapDocument): string | undefined {
  return (doc.nodes.get(doc.worldspawn) as EntityNode).props.find(
    ([key]) => key === 'message',
  )?.[1];
}

describe('CommandBus', () => {
  it('executes, undoes and redoes commands with patch notifications', () => {
    const bus = new CommandBus(createEmptyDocument());
    const events: string[] = [];
    bus.subscribe((event) => events.push(`${event.type}:${event.patch.after.size}`));
    bus.execute(addBrushCommand('a'));
    expect(bus.document.nodes.has('a')).toBe(true);
    expect(bus.canUndo).toBe(true);
    expect(bus.undo()).toBe(true);
    expect(bus.document.nodes.has('a')).toBe(false);
    expect(bus.canRedo).toBe(true);
    expect(bus.redo()).toBe(true);
    expect(bus.document.nodes.has('a')).toBe(true);
    expect(events).toEqual(['execute:2', 'undo:2', 'redo:2']);
  });

  it('merges commands with the same mergeKey into one undo step', () => {
    const bus = new CommandBus(createEmptyDocument());
    bus.execute(renameWorldspawn('a', 'drag-1'));
    bus.execute(renameWorldspawn('ab', 'drag-1'));
    bus.execute(renameWorldspawn('abc', 'drag-1'));
    expect(worldMessage(bus.document)).toBe('abc');
    expect(bus.undoDepth).toBe(1);
    bus.undo();
    expect(worldMessage(bus.document)).toBeUndefined();
    bus.redo();
    expect(worldMessage(bus.document)).toBe('abc');
  });

  it('does not merge across a different mergeKey or after an undo', () => {
    const bus = new CommandBus(createEmptyDocument());
    bus.execute(renameWorldspawn('a', 'drag'));
    bus.execute(renameWorldspawn('b', 'other'));
    expect(bus.undoDepth).toBe(2);
    bus.undo();
    bus.execute(renameWorldspawn('c', 'drag'));
    expect(bus.undoDepth).toBe(2);
    expect(bus.canRedo).toBe(false);
  });

  it('drops the oldest steps when the structural memory limit is exceeded', () => {
    const bus = new CommandBus(createEmptyDocument(), { memoryLimitBytes: 2_000 });
    for (let i = 0; i < 20; i++) {
      bus.execute(addBrushCommand(`brush-${i}`));
    }
    expect(bus.memoryBytes).toBeLessThanOrEqual(2_000);
    expect(bus.undoDepth).toBeLessThan(20);
    expect(bus.undoDepth).toBeGreaterThan(0);
  });

  it('always keeps an oversized newest step', () => {
    const bus = new CommandBus(createEmptyDocument(), { memoryLimitBytes: 1 });
    bus.execute(addBrushCommand('oversized'));
    expect(bus.undoDepth).toBe(1);
    expect(bus.memoryBytes).toBeGreaterThan(1);
    expect(bus.undo()).toBe(true);
  });

  it('clears redo history when a new command executes', () => {
    const bus = new CommandBus(createEmptyDocument());
    bus.execute(addBrushCommand('a'));
    bus.undo();
    expect(bus.canRedo).toBe(true);
    bus.execute(addBrushCommand('b'));
    expect(bus.canRedo).toBe(false);
  });
});

describe('CommandBus fast-check history property', () => {
  it('undoing all commands returns the initial document and redoing them returns the final one', () => {
    const operation = fc.record({
      kind: fc.constantFrom('add', 'replace', 'remove', 'reorder'),
      value: fc.nat({ max: 999 }),
    });
    fc.assert(
      fc.property(fc.array(operation, { minLength: 1, maxLength: 30 }), (ops) => {
        const bus = new CommandBus(createEmptyDocument(), { memoryLimitBytes: 1024 * 1024 });
        const initial = bus.document;
        const live: Id[] = [];
        const target = (value: number) => live[value % live.length]!;
        ops.forEach((op, index) => {
          if (op.kind === 'add' || live.length === 0) {
            const id = `n${index}`;
            live.push(id);
            bus.execute({
              label: `add ${id}`,
              run: (doc) => addNodePatch(doc, doc.worldspawn, testBrush(id)),
            });
            return;
          }
          const id = target(op.value);
          if (op.kind === 'remove') {
            live.splice(live.indexOf(id), 1);
            bus.execute({ label: `remove ${id}`, run: (doc) => removeNodePatch(doc, id) });
          } else if (op.kind === 'reorder') {
            bus.execute({
              label: `reorder ${id}`,
              run: (doc) => reparentNodePatch(doc, id, doc.worldspawn, 0),
            });
          } else {
            bus.execute({
              label: `replace ${id}`,
              run: (doc) => {
                const brush = doc.nodes.get(id) as BrushNode;
                return replaceNodePatch(doc, id, {
                  ...brush,
                  faces: brush.faces.map((face) => ({
                    ...face,
                    tex: { ...face.tex, offset: [op.value, 0] },
                  })),
                });
              },
            });
          }
        });
        const final = bus.document;
        while (bus.undo()) {}
        expect(bus.document.nodes).toEqual(initial.nodes);
        expect(bus.document.parent).toEqual(initial.parent);
        while (bus.redo()) {}
        expect(bus.document.nodes).toEqual(final.nodes);
        expect(bus.document.parent).toEqual(final.parent);
      }),
      { numRuns: 30 },
    );
  });
});
