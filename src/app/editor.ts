import { createEmptyDocument } from '@core/doc/index';
import { parseMap, readPcxPalette, readProject, writeMap, writeProject } from '@core/formats/index';
import type { Command, ConvertedTexture, Inflate, MapDocument, Patch } from '@core/types/index';
import { PALETTE_PATH } from '@game/q2/index';
import type { GameFileEntry } from '@platform/index';
import { CommandBus } from './commandBus';
import { SelectionManager } from './selection';
import { mapTextToPastePatch, removeSelectionPatch, selectionToMapText } from './clipboard';
import { BrushTool, SelectTool, type ToolOutput, type ToolPointerEvent } from './tools';
import type { PrimitiveKind } from '@core/geom/index';
import { entriesFromFileList, entriesFromSinglePak, openGameVfs } from '@platform/index';

export type LogLevel = 'info' | 'ok' | 'warning' | 'error';

export interface LogEntry {
  readonly id: number;
  readonly level: LogLevel;
  readonly text: string;
}

export interface GameSelection {
  readonly entries: GameFileEntry[];
  readonly label: string;
}

export interface TextureWorkerLike {
  convert(wal: ArrayBuffer, palette: ArrayBuffer): Promise<ConvertedTexture>;
}

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
}

export interface TextureCacheLike {
  get(key: string): Promise<ConvertedTexture | null>;
  put(key: string, texture: ConvertedTexture): Promise<void>;
}

export interface EditorAppOptions {
  readonly inflate: Inflate;
  readonly textureClient: TextureWorkerLike;
  readonly textureCache?: TextureCacheLike | null;
  /** The Chromium directory-picker path, wired in main.ts. */
  readonly pickGameEntries?: () => Promise<GameSelection | null>;
  /** The Chromium file-picker path, wired in main.ts. */
  readonly pickMapFile?: () => Promise<File | null>;
  readonly clipboard?: ClipboardLike;
  /** Saves project text; main.ts uses a file handle or a download. */
  readonly saveProjectText?: (name: string, text: string) => Promise<boolean>;
  readonly saveMapText?: (name: string, text: string) => Promise<boolean>;
}

export type EditorEvent =
  | { readonly type: 'document'; readonly patch?: Patch }
  | { readonly type: 'game' }
  | { readonly type: 'log' }
  | { readonly type: 'grid' }
  | { readonly type: 'selection' }
  | { readonly type: 'tool' };

export type EditorListener = (event: EditorEvent) => void;
export type EditorToolMode = 'select' | 'brush';

const MAX_LOG_ENTRIES = 500;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * The browser-independent application object of the phase-1 viewer: the open
 * document, the game data connection, the log and editor-wide settings. It
 * has no Solid or DOM-view dependencies; main.ts wires the platform pickers,
 * texture worker and renderer to it, and the UI subscribes to its events.
 */
export class EditorApp {
  private readonly listeners = new Set<EditorListener>();
  private readonly inflate: Inflate;
  private readonly textureClient: TextureWorkerLike;
  private readonly textureCache: TextureCacheLike | null;
  private readonly pickGameEntries?: () => Promise<GameSelection | null>;
  private readonly pickMapFile?: () => Promise<File | null>;
  private readonly clipboard?: ClipboardLike;
  private readonly saveProjectText?: (name: string, text: string) => Promise<boolean>;
  private readonly saveMapText?: (name: string, text: string) => Promise<boolean>;
  private entries: LogEntry[] = [];
  private nextLogId = 1;
  private readonly bus: CommandBus;
  private readonly selectionManager: SelectionManager;
  private readonly selectTool: SelectTool;
  private readonly brushTool: BrushTool;
  private toolMode: EditorToolMode = 'select';
  private map: string | null = null;
  private vfs: Awaited<ReturnType<typeof openGameVfs>> | null = null;
  private palette: Uint8Array | null = null;
  private textures = 0;
  private grid = 8;

  constructor(options: EditorAppOptions) {
    this.inflate = options.inflate;
    this.textureClient = options.textureClient;
    this.textureCache = options.textureCache ?? null;
    this.pickGameEntries = options.pickGameEntries;
    this.pickMapFile = options.pickMapFile;
    this.clipboard = options.clipboard;
    this.saveProjectText = options.saveProjectText;
    this.saveMapText = options.saveMapText;
    this.bus = new CommandBus(createEmptyDocument());
    this.selectionManager = new SelectionManager(this.bus);
    this.selectTool = new SelectTool(
      () => this.document,
      () => this.gridSize,
    );
    this.brushTool = new BrushTool(
      () => this.document,
      () => this.gridSize,
    );
    this.bus.subscribe((event) => {
      if (event.type !== 'history') {
        this.selectTool.applyPatch(event.document, event.patch);
        this.emit({ type: 'document', patch: event.patch });
      }
    });
    this.selectionManager.subscribe(() => {
      this.selectTool.setSelection(this.selectionManager.selection);
      this.emit({ type: 'selection' });
    });
    this.log('info', 'Joole ready. Open a game folder and a map.');
  }

  get document(): MapDocument {
    return this.bus.document;
  }

  get selection(): ReadonlySet<string> {
    return this.selectionManager.selection;
  }

  get activeTool(): EditorToolMode {
    return this.toolMode;
  }

  get brushPrimitive(): PrimitiveKind {
    return this.brushTool.primitive;
  }

  get brushSides(): number {
    return this.brushTool.sides;
  }

  get mapName(): string | null {
    return this.map;
  }

  get gameOpen(): boolean {
    return this.vfs !== null;
  }

  get textureCount(): number {
    return this.textures;
  }

  get gridSize(): number {
    return this.grid;
  }

  get canPickGameFolder(): boolean {
    return this.pickGameEntries !== undefined;
  }

  get canPickMapFile(): boolean {
    return this.pickMapFile !== undefined;
  }

  logEntries(): readonly LogEntry[] {
    return this.entries;
  }

  subscribe(listener: EditorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  log(level: LogLevel, text: string): void {
    this.entries = [...this.entries, { id: this.nextLogId++, level, text }].slice(-MAX_LOG_ENTRIES);
    this.emit({ type: 'log' });
  }

  /** The grid size in units: a power of two from 1 to 256. */
  setGridSize(size: number): boolean {
    if (!Number.isInteger(size) || size < 1 || size > 256 || (size & (size - 1)) !== 0) {
      return false;
    }
    if (size !== this.grid) {
      this.grid = size;
      this.emit({ type: 'grid' });
    }
    return true;
  }

  /** The `[` key behaviour: halve the grid, down to 1. */
  decreaseGridSize(): boolean {
    return this.setGridSize(Math.max(1, this.grid / 2));
  }

  /** The `]` key behaviour: double the grid, up to 256. */
  increaseGridSize(): boolean {
    return this.setGridSize(Math.min(256, this.grid * 2));
  }

  /** The native directory-picker path. Returns false when the user cancels. */
  async openGameFolder(): Promise<boolean> {
    if (!this.pickGameEntries) {
      return false;
    }
    const selection = await this.pickGameEntries();
    return selection ? this.openGameEntries(selection.entries, selection.label) : false;
  }

  /** The webkitdirectory fallback path. */
  async openGameFiles(files: FileList): Promise<boolean> {
    return this.openGameEntries(entriesFromFileList(files), 'the selected folder');
  }

  /** The single-pak fallback path. */
  async openSinglePak(file: File): Promise<boolean> {
    return this.openGameEntries(entriesFromSinglePak(file), file.name);
  }

  async openGameEntries(entries: GameFileEntry[], label: string): Promise<boolean> {
    this.log('info', `Opening game data from ${label}…`);
    try {
      const vfs = await openGameVfs(entries, null, this.inflate);
      const paletteBytes = await vfs.readFile(PALETTE_PATH);
      if (!paletteBytes) {
        throw new Error(`missing ${PALETTE_PATH}`);
      }
      this.vfs = vfs;
      this.palette = readPcxPalette(paletteBytes).slice();
      this.textures = vfs.textureIndex().size;
      this.emit({ type: 'game' });
      this.log('ok', `Game data opened: ${plural(this.textures, 'texture')}.`);
      return true;
    } catch (error) {
      this.log(
        'error',
        `Game data failed to open: ${errorText(error)}. Choose the Quake 2 folder or its baseq2 folder.`,
      );
      return false;
    }
  }

  /** The native open-file-picker path. Returns false when the user cancels. */
  async openMapPicker(): Promise<boolean> {
    if (!this.pickMapFile) {
      return false;
    }
    const file = await this.pickMapFile();
    return file ? this.openMapFile(file) : false;
  }

  async openMapFile(file: File): Promise<boolean> {
    try {
      const text = await file.text();
      if (/\.joole\.json$/i.test(file.name)) return await this.openProjectText(file.name, text);
      return await this.openMapText(file.name, text);
    } catch (error) {
      this.log('error', `Map failed to open: ${errorText(error)}`);
      return false;
    }
  }

  async openMapText(name: string, text: string): Promise<boolean> {
    try {
      const doc = parseMap(text);
      this.bus.reset(doc);
      this.selectionManager.clear();
      this.selectTool.syncDocument(doc);
      this.map = name;
      this.emit({ type: 'document' });
      this.log('ok', `Opened map ${name} (${plural(doc.nodes.size, 'node')}).`);
      return true;
    } catch (error) {
      this.log('error', `Map failed to open: ${errorText(error)}`);
      return false;
    }
  }

  /** Executes one document command through the central bus and selection history. */
  executeCommand(command: Command): Patch {
    return this.selectionManager.execute(command);
  }

  undo(): boolean {
    return this.selectionManager.undo();
  }

  redo(): boolean {
    return this.selectionManager.redo();
  }

  setSelection(ids: Iterable<string>): void {
    this.selectionManager.setSelection(ids);
  }

  copySelectionText(): string | null {
    return selectionToMapText(this.document, this.selection);
  }

  async copySelection(): Promise<boolean> {
    const text = this.copySelectionText();
    if (!text || !this.clipboard) return false;
    await this.clipboard.writeText(text);
    this.log('ok', 'Selection copied as .map text.');
    return true;
  }

  async cutSelection(): Promise<boolean> {
    if (!(await this.copySelection())) return false;
    const patch = removeSelectionPatch(this.document, this.selection);
    if (!patch) return false;
    this.executeCommand({ label: 'Cut selection', run: () => patch });
    this.setSelection([]);
    return true;
  }

  pasteMapText(text: string, offset: [number, number, number] = [0, 0, 0]): boolean {
    try {
      const pasted = mapTextToPastePatch(this.document, text, offset);
      if (!pasted.patch) return false;
      this.executeCommand({ label: 'Paste selection', run: () => pasted.patch! });
      this.setSelection(pasted.ids);
      return true;
    } catch (error) {
      this.log('warning', `Paste failed: ${errorText(error)}`);
      return false;
    }
  }

  async pasteClipboard(): Promise<boolean> {
    if (!this.clipboard) return false;
    return this.pasteMapText(await this.clipboard.readText());
  }

  duplicateSelection(): boolean {
    const text = this.copySelectionText();
    return text ? this.pasteMapText(text, [this.gridSize, this.gridSize, 0]) : false;
  }

  setToolMode(mode: EditorToolMode): void {
    if (mode === this.toolMode) {
      return;
    }
    this.selectTool.cancel();
    this.brushTool.cancel();
    this.toolMode = mode;
    this.emit({ type: 'tool' });
  }

  setBrushPrimitive(kind: PrimitiveKind, sides = this.brushTool.sides): boolean {
    if (!Number.isInteger(sides) || sides < 3 || sides > 64) {
      return false;
    }
    this.brushTool.primitive = kind;
    this.brushTool.sides = sides;
    this.emit({ type: 'tool' });
    return true;
  }

  /** Feeding a neutral pointer event through the active tool and applying its effects. */
  selectPointer(event: ToolPointerEvent): ToolOutput {
    const tool = this.toolMode === 'brush' ? this.brushTool : this.selectTool;
    const output = tool.pointer(event);
    for (const command of output.commands) {
      try {
        this.executeCommand(command);
      } catch (error) {
        this.log('warning', error instanceof Error ? error.message : String(error));
        break;
      }
    }
    if (output.selection) {
      this.setSelection(output.selection);
    }
    return output;
  }

  projectText(): string {
    return writeProject(this.document, { gridSize: this.gridSize });
  }

  exportMapText(): { text: string; warnings: string[] } {
    return writeMap(this.document, { mode: 'export' });
  }

  async saveProject(): Promise<boolean> {
    if (!this.saveProjectText) return false;
    const name = (this.map?.replace(/\.(map|joole\.json)$/i, '') ?? 'untitled') + '.joole.json';
    const saved = await this.saveProjectText(name, this.projectText());
    if (saved) this.log('ok', `Project saved as ${name}.`);
    return saved;
  }

  async exportMap(): Promise<boolean> {
    if (!this.saveMapText) return false;
    const result = this.exportMapText();
    for (const warning of result.warnings) this.log('warning', warning);
    const name = (this.map?.replace(/\.(map|joole\.json)$/i, '') ?? 'untitled') + '.map';
    return this.saveMapText(name, result.text);
  }

  async openProjectText(name: string, text: string): Promise<boolean> {
    try {
      const doc = readProject(text);
      this.bus.reset(doc);
      this.selectionManager.clear();
      this.selectTool.syncDocument(doc);
      this.map = name;
      this.emit({ type: 'document' });
      this.log('ok', `Opened project ${name} (${plural(doc.nodes.size, 'node')}).`);
      return true;
    } catch (error) {
      this.log('error', `Project failed to open: ${errorText(error)}`);
      return false;
    }
  }

  /** The renderer's lazy texture loader, over the open VFS, worker and cache. */
  async loadTexture(name: string): Promise<ConvertedTexture | null> {
    if (!this.vfs || !this.palette) {
      return null;
    }
    const path = `textures/${name}.wal`;
    const hit = this.vfs.find(path);
    if (!hit) {
      return null;
    }
    const source =
      hit.source.kind === 'pack'
        ? `${hit.source.gameDir}/${hit.source.packFile}`
        : `${hit.source.gameDir}/loose`;
    const key = `${source}:${path}:${hit.size}`;
    const cached = await this.textureCache?.get(key);
    if (cached) {
      return cached;
    }
    const wal = await hit.read();
    const converted = await this.textureClient.convert(copyBuffer(wal), copyBuffer(this.palette));
    if (this.textureCache) {
      void this.textureCache.put(key, converted).catch(() => {
        // A cache write failure only means the next open converts the texture again.
      });
    }
    return converted;
  }

  private emit(event: EditorEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
