import type { Command, MapDocument, Patch } from '@core/types/index';
import { applyPatch, invertPatch, mergePatches } from '@core/doc/index';
import { estimatePatchBytes } from './historyMemory';

export interface CommandBusOptions {
  /** Structural-estimate cap, 256 MB by default. */
  readonly memoryLimitBytes?: number;
}

export interface CommandHistoryEntry {
  readonly label: string;
  readonly mergeKey?: string;
  patch: Patch;
}

export type CommandBusEventType = 'execute' | 'undo' | 'redo' | 'history';

export interface CommandBusEvent {
  readonly type: CommandBusEventType;
  readonly document: MapDocument;
  readonly patch: Patch;
  readonly label: string;
}

export type CommandBusListener = (event: CommandBusEvent) => void;

const DEFAULT_MEMORY_LIMIT = 256 * 1024 * 1024;

/**
 * The single owner of document mutation. It executes Commands, keeps undo and
 * redo stacks, collapses drag steps by mergeKey, and emits the incremental
 * Patch that caused each document transition.
 */
export class CommandBus {
  private readonly listeners = new Set<CommandBusListener>();
  private readonly memoryLimitBytes: number;
  private undoStack: CommandHistoryEntry[] = [];
  private redoStack: CommandHistoryEntry[] = [];
  private doc: MapDocument;
  private memory = 0;

  constructor(document: MapDocument, options: CommandBusOptions = {}) {
    this.doc = document;
    this.memoryLimitBytes = options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT;
  }

  get document(): MapDocument {
    return this.doc;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  get memoryBytes(): number {
    return this.memory;
  }

  subscribe(listener: CommandBusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replaces the document outside history, used when opening another file. */
  reset(document: MapDocument): void {
    this.doc = document;
    this.undoStack = [];
    this.redoStack = [];
    this.memory = 0;
  }

  execute(command: Command): Patch {
    const patch = command.run(this.doc);
    const last = this.undoStack[this.undoStack.length - 1];
    if (
      command.mergeKey !== undefined &&
      last?.mergeKey === command.mergeKey &&
      this.redoStack.length === 0
    ) {
      last.patch = mergePatches(last.patch, patch);
      this.undoStack[this.undoStack.length - 1] = {
        label: command.label,
        mergeKey: command.mergeKey,
        patch: last.patch,
      };
    } else {
      this.undoStack.push({ label: command.label, mergeKey: command.mergeKey, patch });
    }
    this.redoStack = [];
    this.doc = applyPatch(this.doc, patch);
    this.enforceMemoryLimit();
    this.emit('execute', patch, command.label);
    return patch;
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) {
      return false;
    }
    const inverse = invertPatch(entry.patch);
    this.doc = applyPatch(this.doc, inverse);
    this.redoStack.push(entry);
    this.enforceMemoryLimit();
    this.emit('undo', inverse, entry.label);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) {
      return false;
    }
    this.doc = applyPatch(this.doc, entry.patch);
    this.undoStack.push(entry);
    this.enforceMemoryLimit();
    this.emit('redo', entry.patch, entry.label);
    return true;
  }

  private entryCost(entry: CommandHistoryEntry): number {
    return estimatePatchBytes(entry.patch, this.doc);
  }

  private recalculateMemory(): number {
    let total = 0;
    for (const entry of [...this.undoStack, ...this.redoStack]) {
      total += this.entryCost(entry);
    }
    this.memory = total;
    return total;
  }

  private enforceMemoryLimit(): void {
    let total = this.recalculateMemory();
    const count = () => this.undoStack.length + this.redoStack.length;
    let dropped = false;
    while (total > this.memoryLimitBytes && count() > 1) {
      if (this.undoStack.length > 1) {
        this.undoStack.shift();
      } else if (this.redoStack.length > 1) {
        this.redoStack.shift();
      } else if (this.undoStack.length === 1 && this.redoStack.length === 1) {
        // Keep the newest chronological step. With one entry in each stack the
        // undo entry is the operation that led to the current document, while
        // the redo entry is newer than it in wall-clock interaction but older
        // in document order. Dropping the redo entry preserves undo of the
        // current state, which is the invariant the spec cares about.
        this.redoStack.shift();
      } else {
        break;
      }
      dropped = true;
      total = this.recalculateMemory();
    }
    if (dropped) {
      // No document transition occurred, so interested parties only need to
      // know that undo/redo availability may have changed. The patch is empty.
      const empty: Patch = {
        before: new Map(),
        after: new Map(),
        parentBefore: new Map(),
        parentAfter: new Map(),
      };
      this.emit('history', empty, 'History trimmed');
    }
  }

  private emit(type: CommandBusEventType, patch: Patch, label: string): void {
    const event: CommandBusEvent = { type, document: this.doc, patch, label };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
