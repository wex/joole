import type { Command, Id, Patch } from '@core/types/index';
import type { CommandBus } from './commandBus';

export interface SelectionEvent {
  readonly type: 'selection';
  readonly selection: ReadonlySet<Id>;
}

export type SelectionListener = (event: SelectionEvent) => void;

function copy(selection: ReadonlySet<Id>): Set<Id> {
  return new Set(selection);
}

function same(a: ReadonlySet<Id>, b: ReadonlySet<Id>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/**
 * Selection is editor state, not document state. This manager owns the
 * selection set and the undo metadata associated with CommandBus entries: the
 * selection before each command is restored when that command is undone.
 * Redo deliberately does not rewrite the user's current selection; it only
 * moves the metadata back so a later undo still restores correctly.
 */
export class SelectionManager {
  private readonly listeners = new Set<SelectionListener>();
  private readonly bus: CommandBus;
  private selected = new Set<Id>();
  private undoSelections: Set<Id>[] = [];
  private redoSelections: Set<Id>[] = [];

  constructor(bus: CommandBus) {
    this.bus = bus;
  }

  get selection(): ReadonlySet<Id> {
    return this.selected;
  }

  get undoDepth(): number {
    return this.undoSelections.length;
  }

  subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSelection(ids: Iterable<Id>): void {
    const next = new Set(ids);
    if (same(next, this.selected)) {
      return;
    }
    this.selected = next;
    this.emit();
  }

  add(id: Id): void {
    if (this.selected.has(id)) {
      return;
    }
    this.selected = new Set([...this.selected, id]);
    this.emit();
  }

  remove(id: Id): void {
    if (!this.selected.has(id)) {
      return;
    }
    this.selected = new Set([...this.selected].filter((item) => item !== id));
    this.emit();
  }

  toggle(id: Id): void {
    if (this.selected.has(id)) {
      this.remove(id);
    } else {
      this.add(id);
    }
  }

  clear(): void {
    this.setSelection([]);
  }

  execute(command: Command): Patch {
    const before = copy(this.selected);
    const patch = this.bus.execute(command);
    this.undoSelections.push(before);
    this.redoSelections = [];
    this.alignMetadata();
    return patch;
  }

  undo(): boolean {
    if (!this.bus.canUndo) {
      return false;
    }
    const restore = this.undoSelections.pop() ?? new Set<Id>();
    const ok = this.bus.undo();
    if (!ok) {
      return false;
    }
    this.redoSelections.push(restore);
    this.alignMetadata();
    this.setSelection(restore);
    return true;
  }

  redo(): boolean {
    if (!this.bus.canRedo) {
      return false;
    }
    const ok = this.bus.redo();
    if (!ok) {
      return false;
    }
    const restore = this.redoSelections.pop() ?? new Set<Id>();
    this.undoSelections.push(restore);
    this.alignMetadata();
    return true;
  }

  private alignMetadata(): void {
    while (this.undoSelections.length > this.bus.undoDepth) {
      this.undoSelections.shift();
    }
    while (this.redoSelections.length > this.bus.redoDepth) {
      this.redoSelections.shift();
    }
  }

  private emit(): void {
    const event: SelectionEvent = { type: 'selection', selection: this.selected };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
