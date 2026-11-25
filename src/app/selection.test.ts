import { describe, expect, it } from 'vitest';
import type { BrushNode, Command } from '@core/types/index';
import { addNodePatch, createEmptyDocument } from '@core/doc/index';
import { CommandBus } from './commandBus';
import { SelectionManager } from './selection';
import { testDocument } from '../core/doc/__tests__/helpers';

function testBrush(id: string): BrushNode {
  const source = testDocument().nodes.get('b1') as BrushNode;
  return { ...source, id };
}

function addBrush(id: string): Command {
  return {
    label: `Add ${id}`,
    run: (doc) => addNodePatch(doc, doc.worldspawn, testBrush(id)),
  };
}

function fixture() {
  const bus = new CommandBus(createEmptyDocument());
  const selection = new SelectionManager(bus);
  return { bus, selection };
}

describe('SelectionManager', () => {
  it('keeps a set of ids and emits selection changes', () => {
    const { selection } = fixture();
    const seen: string[][] = [];
    selection.subscribe((event) => seen.push([...event.selection].sort()));
    selection.setSelection(['a', 'b', 'a']);
    expect([...selection.selection].sort()).toEqual(['a', 'b']);
    selection.add('c');
    selection.toggle('a');
    expect([...selection.selection].sort()).toEqual(['b', 'c']);
    selection.clear();
    expect(selection.selection.size).toBe(0);
    expect(seen).toEqual([['a', 'b'], ['a', 'b', 'c'], ['b', 'c'], []]);
  });

  it('does not emit when the selection is unchanged', () => {
    const { selection } = fixture();
    let count = 0;
    selection.subscribe(() => count++);
    selection.setSelection(['a']);
    selection.setSelection(['a']);
    selection.add('a');
    selection.remove('missing');
    expect(count).toBe(1);
  });

  it('undo restores the selection captured before the command', () => {
    const { selection } = fixture();
    selection.setSelection(['before']);
    selection.execute(addBrush('brush-a'));
    selection.setSelection(['brush-a']);
    expect(selection.undo()).toBe(true);
    expect([...selection.selection]).toEqual(['before']);
  });

  it('redo does not change the current selection, but keeps undo metadata aligned', () => {
    const { selection } = fixture();
    selection.setSelection(['before']);
    selection.execute(addBrush('brush-a'));
    selection.setSelection(['brush-a']);
    selection.undo();
    selection.setSelection(['while-undone']);
    expect(selection.redo()).toBe(true);
    expect([...selection.selection]).toEqual(['while-undone']);
    selection.undo();
    expect([...selection.selection]).toEqual(['before']);
  });

  it('stays aligned when the command history memory limit drops old entries', () => {
    const bus = new CommandBus(createEmptyDocument(), { memoryLimitBytes: 500 });
    const selection = new SelectionManager(bus);
    for (let i = 0; i < 10; i++) {
      selection.execute(addBrush(`brush-${i}`));
    }
    expect(selection.undoDepth).toBe(bus.undoDepth);
    while (selection.undo()) {}
    expect(selection.undoDepth).toBe(0);
  });
});
