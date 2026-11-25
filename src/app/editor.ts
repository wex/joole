import { reparentNodePatch, addNodePatch, createEmptyDocument, createId } from '@core/doc/index';
import {
  mergeEntityDefs,
  parseQuakedBlocks,
  parseMap,
  readPcxPalette,
  readProject,
  readWalHeader,
  writeMap,
  writeProject,
} from '@core/formats/index';
import q2defText from '../game/q2/q2.def?raw';
import { convertBrushesToEntityPatch } from './entities';
import {
  entityPanelState,
  renameEntityPropPatch,
  setEntityClassPatch,
  setEntityPropPatch,
  targetLinks,
  toggleSpawnflagPatch,
} from './entityPanel';
import {
  effectiveGroupState,
  groupNodesPatch,
  setGroupFlagPatch,
  ungroupNodesPatch,
} from './groups';
import type { EntityClassDef } from '@core/formats/index';
import type {
  Command,
  ConvertedTexture,
  Inflate,
  MapDocument,
  Patch,
  Vec3,
} from '@core/types/index';
import {
  CONTENT_FLAG_BITS,
  DEFAULT_TEXTURE,
  PALETTE_PATH,
  SURFACE_FLAG_BITS,
} from '@game/q2/index';
import type { GameFileEntry } from '@platform/index';
import { CommandBus } from './commandBus';
import { SelectionManager } from './selection';
import { mapTextToPastePatch, removeSelectionPatch, selectionToMapText } from './clipboard';
import { hollowSelectionPatch, intersectSelectionPatch, subtractSelectionPatch } from './csg';
import {
  readSurfaceState,
  toggleBitPatch,
  editSurfacePatch,
  type SurfaceState,
} from './surfaceProps';
import {
  allFacesOf,
  applyTexturePatch,
  fitTexturePatch,
  justifyTexturePatch,
  resetTexturePatch,
  rotateTexturePatch,
  shiftTexturePatch,
  type FaceRef,
  type JustifyEdge,
} from './textureOps';
import { createFlipCommand, createRotate90Command, mirrorSelectionPatch } from './mirrorCommands';
import {
  BrushTool,
  ClipTool,
  SelectTool,
  TextureTool,
  VertexTool,
  type ToolOutput,
  type ToolPointerEvent,
  EntityTool,
} from './tools';
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

export interface AutosaveStoreLike {
  saveAutosave(project: string, dirty: boolean): Promise<void>;
  clearAutosave(): Promise<void>;
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
  readonly autosaveStore?: AutosaveStoreLike;
}

export type EditorEvent =
  | { readonly type: 'document'; readonly patch?: Patch }
  | { readonly type: 'game' }
  | { readonly type: 'log' }
  | { readonly type: 'grid' }
  | { readonly type: 'selection' }
  | { readonly type: 'tool' }
  | { readonly type: 'recovery' };

export type EditorListener = (event: EditorEvent) => void;
export type EditorToolMode = 'select' | 'brush' | 'clip' | 'vertex' | 'face' | 'texture' | 'entity';

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
  private readonly autosaveStore?: AutosaveStoreLike;
  private dirty = false;
  private recovery: string | null = null;
  private entries: LogEntry[] = [];
  private nextLogId = 1;
  private readonly bus: CommandBus;
  private readonly selectionManager: SelectionManager;
  private readonly selectTool: SelectTool;
  private readonly brushTool: BrushTool;
  private readonly clipTool: ClipTool;
  private readonly vertexTool: VertexTool;
  private readonly textureTool: TextureTool;
  private readonly entityTool: EntityTool;
  private toolMode: EditorToolMode = 'select';
  private map: string | null = null;
  private vfs: Awaited<ReturnType<typeof openGameVfs>> | null = null;
  private palette: Uint8Array | null = null;
  private textures = 0;
  private grid = 8;
  private textureLock = false;
  private currentTexture = DEFAULT_TEXTURE;
  private textureDims = new Map<string, readonly [number, number]>();
  private walAttribs = new Map<string, { flags: number; contents: number; value: number }>();
  private walAttribsPending = new Set<string>();

  constructor(options: EditorAppOptions) {
    this.inflate = options.inflate;
    this.textureClient = options.textureClient;
    this.textureCache = options.textureCache ?? null;
    this.pickGameEntries = options.pickGameEntries;
    this.pickMapFile = options.pickMapFile;
    this.clipboard = options.clipboard;
    this.saveProjectText = options.saveProjectText;
    this.saveMapText = options.saveMapText;
    this.autosaveStore = options.autosaveStore;
    this.bus = new CommandBus(createEmptyDocument());
    this.selectionManager = new SelectionManager(this.bus);
    this.selectTool = new SelectTool(
      () => this.document,
      () => this.gridSize,
      () => this.textureLock,
      (errorTexels) =>
        this.log(
          'warning',
          `Texture lock error ${errorTexels.toFixed(2)} texels exceeds the 0.5-texel limit on a face.`,
        ),
    );
    this.brushTool = new BrushTool(
      () => this.document,
      () => this.gridSize,
    );
    this.clipTool = new ClipTool(
      () => this.document,
      () => this.gridSize,
    );
    this.vertexTool = new VertexTool(
      () => this.document,
      () => this.gridSize,
      () => this.selection,
    );
    this.textureTool = new TextureTool(
      () => this.document,
      () => this.gridSize,
    );
    this.entityTool = new EntityTool(
      () => this.document,
      () => this.currentEntityClassValue,
      () => this.document.worldspawn,
      () => this.gridSize,
    );
    this.bus.subscribe((event) => {
      if (event.type !== 'history') {
        this.dirty = true;
        this.selectTool.applyPatch(event.document, event.patch);
        this.textureTool.applyPatch(event.document, event.patch);
        this.emit({ type: 'document', patch: event.patch });
      }
    });
    this.selectionManager.subscribe(() => {
      this.selectTool.setSelection(this.selectionManager.selection);
      this.clipTool.setSelection(this.selectionManager.selection);
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

  get vertexSubmode(): 'vertex' | 'edge' | 'face' {
    return this.vertexTool.submode;
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
    const last = this.entries[this.entries.length - 1];
    if (last && last.level === level && last.text === text) {
      return;
    }
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

  get textureLockEnabled(): boolean {
    return this.textureLock;
  }

  /** Texture lock toggle: textures stick to surfaces on move and rotate when on. */
  /** The merged entity definitions: vanilla plus any mod overrides. */
  entityDefs(): readonly EntityClassDef[] {
    return this.entityDefsValue;
  }

  /** Replaces the mod definition layer; an empty list returns to vanilla. */
  setModEntityDefs(texts: readonly string[]): void {
    const vanilla = parseQuakedBlocks(q2defText);
    const mod = texts.flatMap((text) => parseQuakedBlocks(text));
    this.entityDefsValue = mod.length > 0 ? mergeEntityDefs(vanilla, mod) : vanilla;
    this.modEntityDefTexts = [...texts];
  }

  /** The class the entity tool places, 'light' until one is chosen. */
  get currentEntityClass(): string {
    return this.currentEntityClassValue;
  }

  setCurrentEntityClass(classname: string): void {
    this.currentEntityClassValue = classname;
  }

  private currentEntityClassValue = 'light';

  /**
   * Turns the selected brushes into a brush entity of the given class
   * (func_*, trigger_*). Returns false with a log line when the selection
   * cannot form one.
   */
  convertSelectionToEntity(classname: string): boolean {
    const brushIds = [...this.selection].filter(
      (id) => this.document.nodes.get(id)?.kind === 'brush',
    );
    try {
      const { patch, id } = convertBrushesToEntityPatch(
        this.document,
        classname,
        brushIds,
        createId,
      );
      this.executeCommand({ label: `Convert to ${classname}`, run: () => patch });
      this.setSelection([id]);
      this.log('ok', `Converted ${plural(brushIds.length, 'brush')} to ${classname}.`);
      return true;
    } catch (error) {
      this.log('warning', `Convert to entity failed: ${errorText(error)}`);
      return false;
    }
  }

  /** Groups the selected nodes under a new group (one undo step). */
  groupSelection(): boolean {
    const ids = [...this.selection].filter((id) => id !== this.document.worldspawn);
    try {
      const { patch, id } = groupNodesPatch(this.document, ids, createId);
      this.executeCommand({ label: 'Group', run: () => patch });
      this.setSelection([id]);
      this.log('ok', `Grouped ${plural(ids.length, 'node')}.`);
      return true;
    } catch (error) {
      this.log('warning', `Group failed: ${errorText(error)}`);
      return false;
    }
  }

  /** Dissolves the selected group, moving its children to its parent. */
  ungroupSelection(): boolean {
    const groupId = [...this.selection].find((id) => this.document.nodes.get(id)?.kind === 'group');
    if (!groupId) {
      this.log('warning', 'Ungroup needs a selected group.');
      return false;
    }
    try {
      const patch = ungroupNodesPatch(this.document, groupId);
      const children = (this.document.nodes.get(groupId) as { children: string[] }).children;
      this.executeCommand({ label: 'Ungroup', run: () => patch });
      this.setSelection(children);
      this.log('ok', 'Ungrouped.');
      return true;
    } catch (error) {
      this.log('warning', `Ungroup failed: ${errorText(error)}`);
      return false;
    }
  }

  /** Sets or clears the hidden or locked flag of a group. */
  setGroupFlag(groupId: string, flag: 'hidden' | 'locked', value: boolean): boolean {
    try {
      const patch = setGroupFlagPatch(this.document, groupId, flag, value);
      this.executeCommand({ label: value ? `${flag} group` : `un${flag} group`, run: () => patch });
      return true;
    } catch (error) {
      this.log('warning', errorText(error));
      return false;
    }
  }

  /** Reparents a node in the tree, as one undoable command. */
  reparentNode(id: string, newParentId: string): boolean {
    try {
      const patch = reparentNodePatch(this.document, id, newParentId);
      this.executeCommand({ label: 'Reparent', run: () => patch });
      return true;
    } catch (error) {
      this.log('warning', `Reparent failed: ${errorText(error)}`);
      return false;
    }
  }

  /** Hidden/locked inherited state of a node. */
  nodeGroupState(id: string): { hidden: boolean; locked: boolean } {
    return effectiveGroupState(this.document, id);
  }

  /** The entity panel state of the current selection. */
  entityPanel() {
    return entityPanelState(this.document, this.selection, this.entityDefsValue);
  }

  /** Undoable entity key edit; empty value removes the key. */
  setEntityProp(id: string, key: string, value: string): boolean {
    return this.runEntityPatch(`Edit ${key}`, () =>
      setEntityPropPatch(this.document, id, key, value),
    );
  }

  renameEntityProp(id: string, oldKey: string, newKey: string): boolean {
    return this.runEntityPatch(`Rename ${oldKey}`, () =>
      renameEntityPropPatch(this.document, id, oldKey, newKey),
    );
  }

  toggleSpawnflag(id: string, bit: number): boolean {
    return this.runEntityPatch('Toggle spawnflag', () =>
      toggleSpawnflagPatch(this.document, id, bit),
    );
  }

  /** Changes the class of a point entity. For brush classes on a brush selection use convertSelectionToEntity. */
  setEntityClass(id: string, classname: string): boolean {
    return this.runEntityPatch(`Class ${classname}`, () =>
      setEntityClassPatch(this.document, id, classname),
    );
  }

  /** Target–targetname link pairs for the 2D link lines. */
  targetLinks() {
    return targetLinks(this.document);
  }

  private runEntityPatch(label: string, build: () => Patch): boolean {
    try {
      const patch = build();
      this.executeCommand({ label, run: () => patch });
      return true;
    } catch (error) {
      this.log('warning', errorText(error));
      return false;
    }
  }

  /** Whether the class is a brush entity (func_*, trigger_* and the ? form). */
  isBrushClass(classname: string): boolean {
    const def = this.entityDefsValue.find((d) => d.className === classname);
    return def ? def.bbox === 'brush' : /^(func|trigger|path|multi)_/.test(classname);
  }

  private entityDefsValue: readonly EntityClassDef[] = parseQuakedBlocks(q2defText);
  private modEntityDefTexts: string[] = [];

  setTextureLock(enabled: boolean): void {
    if (enabled !== this.textureLock) {
      this.textureLock = enabled;
      this.log('info', `Texture lock ${enabled ? 'on' : 'off'}.`);
      this.emit({ type: 'tool' });
    }
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
      this.textureTool.syncDocument(doc);
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
    // Locked groups lock their whole subtree out of the selection.
    const filtered = [...ids].filter((id) => !effectiveGroupState(this.document, id).locked);
    this.selectionManager.setSelection(filtered);
  }

  /** Minimal entity placement for Gate 2; the full class-aware entity tool is P4.4. */
  addEntityAt(classname: string, point: Vec3): string | null {
    if (!/^[A-Za-z0-9_]+$/.test(classname)) return null;
    const grid = this.gridSize;
    const snapped = point.map((value) => Math.round(value / grid) * grid) as Vec3;
    const entity = {
      kind: 'entity' as const,
      id: createId(),
      props: [
        ['classname', classname] as [string, string],
        ['origin', snapped.map((value) => String(value === 0 ? 0 : value)).join(' ')] as [
          string,
          string,
        ],
      ],
      children: [],
    };
    try {
      this.executeCommand({
        label: `Add ${classname}`,
        run: (doc) => addNodePatch(doc, doc.worldspawn, entity),
      });
      this.setSelection([entity.id]);
      this.log('ok', `Added ${classname} at ${entity.props[1]![1]}.`);
      return entity.id;
    } catch (error) {
      this.log('warning', errorText(error));
      return null;
    }
  }

  /** Qoole semantics: selected brushes are cutters; overlapping unselected brushes are targets. */
  csgSubtract(): boolean {
    const result = subtractSelectionPatch(this.document, this.selection);
    if (!result) {
      this.log('warning', 'CSG Subtract needs a selected cutter overlapping another brush.');
      return false;
    }
    try {
      this.executeCommand({ label: 'CSG Subtract', run: () => result.patch });
      this.setSelection(result.ids);
      this.log(
        'ok',
        `CSG Subtract cut ${plural(result.targets, 'target')} into ${plural(result.ids.length, 'fragment')}.`,
      );
      return true;
    } catch (error) {
      this.log('warning', `CSG Subtract failed: ${errorText(error)}`);
      return false;
    }
  }

  /** Flips the selected brushes in place across the axis plane through their center. */
  flipSelection(axis: 0 | 1 | 2): boolean {
    if (this.selection.size === 0) {
      this.log('warning', 'Flip needs a selection.');
      return false;
    }
    try {
      this.executeCommand(createFlipCommand([...this.selection], axis));
      this.log('ok', `Flipped the selection on ${'XYZ'[axis]}.`);
      return true;
    } catch (error) {
      this.log('warning', `Flip failed: ${errorText(error)}`);
      return false;
    }
  }

  /** Duplicates the selection and flips the copies; the copies become selected. */
  mirrorSelection(axis: 0 | 1 | 2): boolean {
    const result = mirrorSelectionPatch(this.document, this.selection, axis);
    if (!result) {
      this.log('warning', 'Mirror needs a selected brush.');
      return false;
    }
    try {
      this.executeCommand({ label: `Mirror ${'XYZ'[axis]}`, run: () => result.patch });
      this.setSelection(result.ids);
      this.log('ok', `Mirrored ${plural(result.targets, 'brush')} on ${'XYZ'[axis]}.`);
      return true;
    } catch (error) {
      this.log('warning', `Mirror failed: ${errorText(error)}`);
      return false;
    }
  }

  /** Rotates the selection exactly 90° counterclockwise about Z through its center. */
  rotate90Selection(): boolean {
    if (this.selection.size === 0) {
      this.log('warning', 'Rotate 90° needs a selection.');
      return false;
    }
    try {
      this.executeCommand(createRotate90Command([...this.selection]));
      this.log('ok', 'Rotated the selection 90°.');
      return true;
    } catch (error) {
      this.log('warning', `Rotate 90° failed: ${errorText(error)}`);
      return false;
    }
  }

  /** Replaces two or more selected brushes by their convex intersection. */
  csgIntersect(): boolean {
    const result = intersectSelectionPatch(this.document, this.selection);
    if (!result) {
      this.log('warning', 'CSG Intersect needs overlapping selected brushes with one parent.');
      return false;
    }
    try {
      this.executeCommand({ label: 'CSG Intersect', run: () => result.patch });
      this.setSelection(result.ids);
      this.log('ok', `CSG Intersect merged ${plural(result.targets, 'brush')}.`);
      return true;
    } catch (error) {
      this.log('warning', `CSG Intersect failed: ${errorText(error)}`);
      return false;
    }
  }

  hollowSelection(direction: 'inward' | 'outward', thickness = 8): boolean {
    const result = hollowSelectionPatch(this.document, this.selection, direction, thickness);
    if (!result) {
      this.log('warning', 'Hollow needs exactly one selected brush.');
      return false;
    }
    try {
      this.executeCommand({ label: `Hollow ${direction}`, run: () => result.patch });
      this.setSelection(result.ids);
      this.log(
        'ok',
        `Hollowed one brush ${direction} into ${plural(result.ids.length, 'fragment')}.`,
      );
      return true;
    } catch (error) {
      this.log('warning', `Hollow failed: ${errorText(error)}`);
      return false;
    }
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
      // Pressing V again in vertex mode switches between vertex and edge editing.
      if (mode === 'vertex') {
        this.vertexTool.toggleVertexEdge();
        this.emit({ type: 'tool' });
      }
      return;
    }
    if (mode === 'face') {
      this.vertexTool.submode = 'face';
    } else if (mode === 'vertex' && this.vertexTool.submode === 'face') {
      this.vertexTool.submode = 'vertex';
    }
    this.selectTool.cancel();
    this.brushTool.cancel();
    this.clipTool.cancel();
    this.vertexTool.cancel();
    this.textureTool.cancel();
    this.entityTool.cancel();
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
    const tool =
      this.toolMode === 'brush'
        ? this.brushTool
        : this.toolMode === 'clip'
          ? this.clipTool
          : this.toolMode === 'vertex' || this.toolMode === 'face'
            ? this.vertexTool
            : this.toolMode === 'texture'
              ? this.textureTool
              : this.toolMode === 'entity'
                ? this.entityTool
                : this.selectTool;
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
    if (output.faces) {
      this.emit({ type: 'tool' });
    }
    if (output.pickedTexture) {
      this.currentTexture = output.pickedTexture;
      this.log('info', `Picked texture ${output.pickedTexture}.`);
      this.emit({ type: 'tool' });
    }
    return output;
  }

  /** Feeds Enter, Tab and Escape to the Clip tool without intercepting ordinary shortcuts. */
  clipKey(key: string): ToolOutput {
    const output = this.clipTool.key(key);
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

  get hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  get recoveryProject(): string | null {
    return this.recovery;
  }

  offerRecovery(project: string): void {
    this.recovery = project;
    this.emit({ type: 'recovery' });
  }

  async acceptRecovery(): Promise<boolean> {
    if (!this.recovery) return false;
    const text = this.recovery;
    this.recovery = null;
    this.emit({ type: 'recovery' });
    const opened = await this.openProjectText('recovered.joole.json', text);
    if (opened) {
      this.dirty = true;
      await this.autosaveStore?.clearAutosave();
    }
    return opened;
  }

  async discardRecovery(): Promise<void> {
    this.recovery = null;
    this.emit({ type: 'recovery' });
    await this.autosaveStore?.clearAutosave();
  }

  async autosave(): Promise<boolean> {
    if (!this.dirty || !this.autosaveStore) return false;
    await this.autosaveStore.saveAutosave(this.projectText(), true);
    return true;
  }

  projectText(): string {
    return writeProject(this.document, {
      gridSize: this.gridSize,
      ...(this.modEntityDefTexts.length > 0 ? { modEntityDefs: this.modEntityDefTexts } : {}),
    });
  }

  exportMapText(): { text: string; warnings: string[] } {
    return writeMap(this.document, { mode: 'export' });
  }

  async saveProject(): Promise<boolean> {
    if (!this.saveProjectText) return false;
    const name = (this.map?.replace(/\.(map|joole\.json)$/i, '') ?? 'untitled') + '.joole.json';
    const saved = await this.saveProjectText(name, this.projectText());
    if (saved) {
      this.dirty = false;
      void this.autosaveStore?.clearAutosave();
      this.log('ok', `Project saved as ${name}.`);
    }
    return saved;
  }

  /** The surface-attribute bit tables for the properties panel. */
  readonly surfaceFlagBits = SURFACE_FLAG_BITS;
  readonly contentFlagBits = CONTENT_FLAG_BITS;

  /** The combined surface state of the texture tool's target faces, or null. */
  surfaceState(): SurfaceState | null {
    const faces = this.textureTargets();
    if (faces.length === 0) return null;
    return readSurfaceState(
      this.document,
      faces,
      SURFACE_FLAG_BITS.map(([bit]) => bit),
      CONTENT_FLAG_BITS.map(([bit]) => bit),
    );
  }

  /** The distinct texture names of the target faces, for the ObjectPreview. */
  selectionTextureNames(): readonly string[] {
    const names = new Set<string>();
    for (const ref of this.textureTargets()) {
      const node = this.document.nodes.get(ref.brush);
      if (node?.kind === 'brush') {
        const face = node.faces[ref.face];
        if (face) names.add(face.tex.name);
      }
    }
    return [...names].sort();
  }

  /**
   * The wal default attributes of a texture, or null when unknown. The first
   * call starts loading; a 'game' event is emitted when they arrive.
   */
  walDefaultAttribs(name: string): { flags: number; contents: number; value: number } | null {
    const cached = this.walAttribs.get(name);
    if (cached) return cached;
    if (!this.vfs || this.walAttribsPending.has(name)) return null;
    this.walAttribsPending.add(name);
    const hit = this.vfs.find(`textures/${name}.wal`);
    if (!hit) return null;
    void hit.read().then((bytes) => {
      try {
        const header = readWalHeader(new Uint8Array(bytes));
        this.walAttribs.set(name, {
          flags: header.flags,
          contents: header.contents,
          value: header.value,
        });
        this.emit({ type: 'game' });
      } catch {
        // An unreadable wal has no usable defaults; the panel hides the marker.
      }
    });
    return null;
  }

  /** Toggles one surface or contents bit on the target faces, undoably. */
  toggleSurfaceBit(field: 'flags' | 'contents', bit: number): boolean {
    const faces = this.textureTargets();
    if (faces.length === 0) {
      this.log('info', 'No faces or brushes selected.');
      return false;
    }
    const patch = toggleBitPatch(this.document, faces, field, bit);
    if (!patch) return false;
    this.executeCommand({
      label: field === 'flags' ? 'Surface Flag' : 'Contents Flag',
      run: () => patch,
    });
    return true;
  }

  /** Sets the light value of the target faces, undoably. */
  setSurfaceValue(value: number): boolean {
    if (!Number.isFinite(value)) return false;
    const faces = this.textureTargets();
    if (faces.length === 0) {
      this.log('info', 'No faces or brushes selected.');
      return false;
    }
    const patch = editSurfacePatch(this.document, faces, (tex) => ({
      ...tex,
      value: Math.round(value),
    }));
    if (!patch) return false;
    this.executeCommand({ label: 'Surface Value', run: () => patch });
    return true;
  }

  /** The face targets of the texture tools: picked faces, or whole selected brushes. */
  textureTargets(): FaceRef[] {
    const picked = this.textureTool.faceSelection;
    if (picked.length > 0) {
      return [...picked];
    }
    return allFacesOf(this.document, this.selection);
  }

  get faceSelectionCount(): number {
    return this.textureTool.faceSelection.length;
  }

  get currentTextureName(): string {
    return this.currentTexture;
  }

  setCurrentTexture(name: string): void {
    if (!name) return;
    this.currentTexture = name;
    this.emit({ type: 'tool' });
  }

  clearFaceSelection(): void {
    this.textureTool.clearFaceSelection();
    this.emit({ type: 'tool' });
  }

  private textureSize(name: string): readonly [number, number] {
    // Fit and justify need real texel dimensions; unloaded textures use the
    // wal default of 64x64 until the renderer has converted them.
    return this.textureDims.get(name) ?? [64, 64];
  }

  private editTextures(label: string, build: (faces: readonly FaceRef[]) => Patch | null): boolean {
    const faces = this.textureTargets();
    if (faces.length === 0) {
      this.log('info', 'No faces or brushes selected.');
      return false;
    }
    const patch = build(faces);
    if (!patch) {
      this.log('warning', 'Texture edit did not apply to the selection.');
      return false;
    }
    this.executeCommand({ label, run: () => patch });
    return true;
  }

  /** Applies the current texture to the selected faces or brushes. */
  applyCurrentTexture(): boolean {
    return this.editTextures('Apply Texture', (faces) =>
      applyTexturePatch(this.document, faces, this.currentTexture),
    );
  }

  /** Arrow-key texture shift: offsets move by the grid step in integer texels. */
  shiftTextures(ds: number, dt: number): boolean {
    return this.editTextures('Shift Texture', (faces) =>
      shiftTexturePatch(this.document, faces, ds, dt),
    );
  }

  rotateTextures(degrees: number): boolean {
    return this.editTextures('Rotate Texture', (faces) =>
      rotateTexturePatch(this.document, faces, degrees),
    );
  }

  fitTextures(): boolean {
    return this.editTextures('Fit Texture', (faces) => {
      const [w, h] = this.textureSize(this.currentTexture);
      return fitTexturePatch(this.document, faces, w, h);
    });
  }

  justifyTextures(edge: JustifyEdge): boolean {
    return this.editTextures('Justify Texture', (faces) => {
      const [w, h] = this.textureSize(this.currentTexture);
      return justifyTexturePatch(this.document, faces, edge, w, h);
    });
  }

  resetTextures(): boolean {
    return this.editTextures('Reset Texture', (faces) => resetTexturePatch(this.document, faces));
  }

  /**
   * Arrow keys with the texture tool active. Plain arrows shift the texture
   * by the grid step in the arrow direction (the texture follows the arrow);
   * Shift+Left/Right rotates by the grid step in degrees.
   */
  textureArrow(key: string, shift: boolean): boolean {
    const grid = this.gridSize;
    if (shift && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      return this.rotateTextures(key === 'ArrowLeft' ? -grid : grid);
    }
    if (shift) return false;
    // A positive shift moves the sampled texel forward, so the texture moves
    // against the offset direction: right/up subtract the grid step.
    if (key === 'ArrowLeft') return this.shiftTextures(grid, 0);
    if (key === 'ArrowRight') return this.shiftTextures(-grid, 0);
    if (key === 'ArrowUp') return this.shiftTextures(0, grid);
    if (key === 'ArrowDown') return this.shiftTextures(0, -grid);
    return false;
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
      const editorField = (JSON.parse(text) as { editor?: { modEntityDefs?: unknown } }).editor;
      if (Array.isArray(editorField?.modEntityDefs)) {
        this.setModEntityDefs(editorField.modEntityDefs.filter((t) => typeof t === 'string'));
      }
      this.bus.reset(doc);
      this.selectionManager.clear();
      this.selectTool.syncDocument(doc);
      this.textureTool.syncDocument(doc);
      this.map = name;
      this.emit({ type: 'document' });
      this.log('ok', `Opened project ${name} (${plural(doc.nodes.size, 'node')}).`);
      return true;
    } catch (error) {
      this.log('error', `Project failed to open: ${errorText(error)}`);
      return false;
    }
  }

  /** The indexed textures with their source label, for the texture browser. */
  textureList(): readonly { name: string; source: string }[] {
    if (!this.vfs) return [];
    const out: { name: string; source: string }[] = [];
    for (const [name, source] of this.vfs.textureIndex()) {
      out.push({
        name,
        source:
          source.kind === 'pack' ? `${source.gameDir}/${source.packFile}` : `${source.gameDir}`,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  /** Texture names used by the document's brushes, for the in-use filter. */
  texturesInUse(): ReadonlySet<string> {
    const used = new Set<string>();
    for (const node of this.document.nodes.values()) {
      if (node.kind !== 'brush') continue;
      for (const face of node.faces) used.add(face.tex.name);
    }
    return used;
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
      this.textureDims.set(name, [cached.width, cached.height]);
      return cached;
    }
    const wal = await hit.read();
    const converted = await this.textureClient.convert(copyBuffer(wal), copyBuffer(this.palette));
    this.textureDims.set(name, [converted.width, converted.height]);
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
