import { analyzeBrush } from '@core/geom/index';
import { stepTextureFocus as stepFocus, textureFocus as resolveFocus } from './textureFocus';
import {
  reparentNodePatch,
  addNodePatch,
  createEmptyDocument,
  createId,
  applyPatch,
  mergePatches,
} from '@core/doc/index';
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
  subtreeIds,
  ungroupNodesPatch,
} from './groups';
import { boxSegments, dashedSegment } from './tools';
import { runCompilePipeline, type CompileProfile, type CompileRunner } from './compile';
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
import type { PrefabStore } from '@platform/index';
import { parseMd2, parsePts, type Md2Wireframe } from '@core/formats/index';
import { CLASS_MODELS } from '@game/q2/models';
import { mapTextToPastePatch, removeSelectionPatch, selectionToMapText } from './clipboard';
import {
  hollowSelectionPatch,
  intersectSelectionPatch,
  subtractSelectionPatch,
  withCsgGrouping,
} from './csg';
import {
  readSurfaceState,
  toggleBitPatch,
  editSurfacePatch,
  type SurfaceState,
} from './surfaceProps';
import {
  allFacesOf,
  applyTexturePatch,
  expandBrushIds,
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
  DEFAULT_HANDLE_SIZE,
  resizeToCommand,
  selectionBounds,
  type ToolOutput,
  type ToolPointerEvent,
  EntityTool,
} from './tools';
import type { PickAxis, PrimitiveKind } from '@core/geom/index';
import { formatSize, sizeAxes } from './sizeInput';
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
  | { readonly type: 'tool'; readonly source?: 'user' | 'internal' }
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
      () => this.groupPick,
      () => this.scopeId,
    );
    this.brushTool = new BrushTool(
      () => this.document,
      () => this.gridSize,
      undefined,
      () => this.insertionParent,
    );
    this.clipTool = new ClipTool(
      () => this.document,
      () => this.gridSize,
    );
    this.vertexTool = new VertexTool(
      () => this.document,
      () => this.gridSize,
      () => this.selection,
      () => this.handleSizePx,
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

  /** The group the editor is scoped into, or null for the whole map. */
  get scope(): string | null {
    return this.scopeId;
  }

  /** Group-pick mode (T1.13): clicks in the views select whole groups. */
  get groupPick(): boolean {
    return this.groupPickMode;
  }

  private groupPickMode = false;

  /** Toggles group-pick mode. It is session state and is not persisted. */
  toggleGroupPick(): boolean {
    this.groupPickMode = !this.groupPickMode;
    this.emit({ type: 'selection' });
    return this.groupPickMode;
  }

  /** The group under the cursor in group-pick mode, reported by the Select tool. */
  setGroupHover(id: string | null): void {
    if (this.groupHoverId === id) return;
    this.groupHoverId = id;
    this.emit({ type: 'tool' });
  }

  private groupHoverId: string | null = null;

  /**
   * The group-pick overlay (T1.13): the dashed bounding box of every visible
   * group in scope, plus the hovered group's box undashed. Empty when the
   * mode is off.
   */
  groupOverlay(): {
    segments: (readonly [[number, number, number], [number, number, number]])[];
    hover: (readonly [[number, number, number], [number, number, number]])[];
  } {
    const segments: (readonly [[number, number, number], [number, number, number]])[] = [];
    const hover: (readonly [[number, number, number], [number, number, number]])[] = [];
    if (!this.groupPickMode) return { segments, hover };
    for (const node of this.document.nodes.values()) {
      if (node.kind !== 'group') continue;
      if (!this.inScope(node.id)) continue;
      const state = effectiveGroupState(this.document, node.id);
      if (state.hidden) continue;
      // The union of the descendant brushes' bounds.
      let min: [number, number, number] | null = null;
      let max: [number, number, number] | null = null;
      for (const id of subtreeIds(this.document, node.id)) {
        const child = this.document.nodes.get(id);
        if (child?.kind !== 'brush') continue;
        const box = analyzeBrush(child).aabb;
        if (!box) continue;
        if (!min) {
          min = [...box.min] as [number, number, number];
          max = [...box.max] as [number, number, number];
        } else {
          for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis]!, box.min[axis]!);
            max![axis] = Math.max(max![axis]!, box.max[axis]!);
          }
        }
      }
      if (!min || !max) continue;
      const edges = boxSegments(min, max);
      if (node.id === this.groupHoverId) {
        hover.push(...edges);
      } else {
        for (const [a, b] of edges) segments.push(...dashedSegment(a, b));
      }
    }
    return { segments, hover };
  }

  private scopeId: string | null = null;

  /** A node is inside the scope when it is the scope or one of its descendants. */
  inScope(id: string): boolean {
    if (!this.scopeId) return true;
    let at: string | undefined = id;
    while (at !== undefined) {
      if (at === this.scopeId) return true;
      at = this.document.parent.get(at);
    }
    return false;
  }

  /**
   * Enters a group: selection and new brushes are limited to it and the rest
   * of the map is dimmed (Qoole's scope, OpScopeChange).
   */
  enterScope(id: string): boolean {
    const node = this.document.nodes.get(id);
    if (!node || node.kind !== 'group') {
      this.log('warning', 'Only a group can be entered.');
      return false;
    }
    this.scopeId = id;
    this.selectionManager.setSelection([...this.selection].filter((sel) => this.inScope(sel)));
    this.emit({ type: 'document' });
    this.log('info', `Entered group ${node.name}; the rest of the map is dimmed.`);
    return true;
  }

  /** Leaves the scope back to the whole map. */
  exitScope(): void {
    if (!this.scopeId) return;
    this.scopeId = null;
    this.emit({ type: 'document' });
    this.log('info', 'Left the group scope.');
  }

  /** The parent new top-level content goes to: the scope group or worldspawn. */
  get insertionParent(): string {
    return this.scopeId ?? this.document.worldspawn;
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

  /** Dissolves every selected group in one undo step (T1.13), deepest first. */
  ungroupSelection(): boolean {
    const groupIds = [...this.selection].filter(
      (id) => this.document.nodes.get(id)?.kind === 'group',
    );
    if (groupIds.length === 0) {
      this.log('warning', 'Ungroup needs a selected group.');
      return false;
    }
    try {
      // Deepest groups first, so a nested selection dissolves inside-out.
      const depth = (id: string): number => {
        let n = 0;
        let at: string | undefined = id;
        while ((at = this.document.parent.get(at)) !== undefined) n++;
        return n;
      };
      const ordered = [...groupIds].sort((a, b) => depth(b) - depth(a));
      const children: string[] = [];
      let patch: Patch | null = null;
      let doc = this.document;
      for (const groupId of ordered) {
        if (!doc.nodes.has(groupId)) continue;
        const next = ungroupNodesPatch(doc, groupId);
        children.push(...(doc.nodes.get(groupId) as { children: string[] }).children);
        patch = patch ? mergePatches(patch, next) : next;
        doc = applyPatch(doc, next);
      }
      this.executeCommand({ label: 'Ungroup', run: () => patch! });
      this.setSelection(children.filter((id) => this.document.nodes.has(id)));
      this.log('ok', ordered.length > 1 ? `Ungrouped ${ordered.length} groups.` : 'Ungrouped.');
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
    const filtered = [...ids].filter(
      (id) => !effectiveGroupState(this.document, id).locked && this.inScope(id),
    );
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
        run: (doc) => addNodePatch(doc, this.insertionParent, entity),
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
  /** Whether Hollow and Subtract group their fragments (T1.14/T1.15). */
  get csgGrouping(): boolean {
    return this.csgGroupingEnabled;
  }

  private csgGroupingEnabled = true;
  private handleSizePx = DEFAULT_HANDLE_SIZE;
  private lastBrushSizeText = '';

  setCsgGrouping(value: boolean): void {
    this.csgGroupingEnabled = value;
  }

  /** The last typed brush size of the session, as text (T15.4). */
  get lastBrushSize(): string {
    return this.lastBrushSizeText;
  }

  /**
   * Creates a brush of a typed size centred on a point (T15.4): the size is
   * width, height and depth of the view. One undo step; the brush is
   * selected.
   */
  createBrushAt(view: PickAxis, center: Vec3, size: readonly [number, number, number]): boolean {
    const output = this.brushTool.createAt(view, center, size);
    if (output.commands.length === 0) return false;
    for (const command of output.commands) this.executeCommand(command);
    if (output.selection) this.setSelection(output.selection);
    this.lastBrushSizeText = formatSize(size);
    return true;
  }

  /**
   * The size input for the selection in a view (T15.4): its centre and its
   * current size as width, height and depth of the view. Null when nothing
   * resizable is selected.
   */
  selectionSizePrompt(view: PickAxis): { center: Vec3; text: string } | null {
    const box = selectionBounds(this.document, this.selection);
    if (!box) return null;
    const center: Vec3 = [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    ];
    const text = formatSize(sizeAxes(view).map((axis) => box.max[axis]! - box.min[axis]!));
    return { center, text };
  }

  /** Resizes the selection to a typed size about its centre, in one undo step (T15.4). */
  resizeSelectionTo(view: PickAxis, size: readonly [number, number, number]): boolean {
    const world: [number, number, number] = [0, 0, 0];
    sizeAxes(view).forEach((axis, i) => (world[axis] = size[i]!));
    const command = resizeToCommand(this.document, this.selection, world);
    if (!command) return false;
    this.executeCommand(command);
    return true;
  }

  /** The bounding box of the selected brushes, or null when nothing is selected (T15.5). */
  selectionBounds(): { min: Vec3; max: Vec3 } | null {
    const box = selectionBounds(this.document, this.selection);
    return box ? { min: [...box.min] as Vec3, max: [...box.max] as Vec3 } : null;
  }

  /** The idle handle dot diameter in CSS px; the hit radius follows it (T15.3). */
  setHandleSize(value: number): void {
    this.handleSizePx = value;
  }

  /**
   * The vertex/edge/face handle dots of the current document and selection
   * (T15.3), so the views can refresh them after undo, redo or a tool change
   * without waiting for a pointer event. Empty outside the vertex and face
   * tools.
   */
  handleDots(): readonly { point: Vec3; state: 0 | 1 | 2 }[] {
    return this.toolMode === 'vertex' || this.toolMode === 'face'
      ? this.vertexTool.handleDots()
      : [];
  }

  csgSubtract(): boolean {
    const result = subtractSelectionPatch(this.document, this.selection);
    if (!result) {
      this.log('warning', 'CSG Subtract needs a selected cutter overlapping another brush.');
      return false;
    }
    try {
      const grouped = this.csgGroupingEnabled
        ? withCsgGrouping(this.document, result, 'subtract')
        : { ...result, groups: [] as string[] };
      this.executeCommand({ label: 'CSG Subtract', run: () => grouped.patch });
      // With group-pick mode on, the new groups are the natural selection.
      this.setSelection(
        this.groupPickMode && grouped.groups.length > 0 ? grouped.groups : result.ids,
      );
      this.log(
        'ok',
        `CSG Subtract cut ${plural(result.targets, 'target')} into ${plural(result.ids.length, 'fragment')}${grouped.groups.length > 0 ? ' (grouped)' : ''}.`,
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
      const grouped = this.csgGroupingEnabled
        ? withCsgGrouping(this.document, result, 'hollow')
        : { ...result, groups: [] as string[] };
      this.executeCommand({ label: `Hollow ${direction}`, run: () => grouped.patch });
      // Hollow selects the new group so the shell can move as one piece.
      this.setSelection(grouped.groups.length > 0 ? grouped.groups : result.ids);
      this.log(
        'ok',
        `Hollowed one brush ${direction} into ${plural(result.ids.length, 'fragment')}${grouped.groups.length > 0 ? ' (grouped)' : ''}.`,
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

  private clipboardMirror: string | null = null;

  async copySelection(): Promise<boolean> {
    const text = this.copySelectionText();
    if (!text) return false;
    // The in-app mirror is the guarantee: the system clipboard may deny
    // access (WebKit does not grant clipboard permissions at all), but
    // copy/paste inside the editor must still work.
    this.clipboardMirror = text;
    if (this.clipboard) {
      await this.clipboard.writeText(text).catch(() => undefined);
    }
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

  /**
   * Deletes the whole selection in one undoable step, with no confirmation:
   * brushes, point entities, groups and brush entities, together with their
   * subtrees (T1.9). Returns false when there is nothing to delete — faces
   * picked in the texture tool are not nodes and are left alone.
   */
  deleteSelection(): boolean {
    if (this.selection.size === 0) return false;
    const patch = removeSelectionPatch(this.document, this.selection);
    if (!patch) return false;
    this.executeCommand({ label: 'Delete', run: () => patch });
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
    if (this.clipboard) {
      const text = await this.clipboard.readText().catch(() => null);
      if (text !== null) return this.pasteMapText(text);
    }
    return this.clipboardMirror !== null ? this.pasteMapText(this.clipboardMirror) : false;
  }

  /** Saves the current selection as a named prefab snippet in OPFS. */
  async savePrefab(name: string): Promise<boolean> {
    const text = this.copySelectionText();
    if (!text) {
      this.log('warning', 'Nothing selected for the prefab.');
      return false;
    }
    if (!this.prefabStore) {
      this.log('warning', 'Prefab storage is unavailable.');
      return false;
    }
    await this.prefabStore.save(name, text);
    this.emit({ type: 'game' });
    this.log('ok', `Prefab ${name} saved.`);
    return true;
  }

  /** Lists the stored prefabs, newest first. */
  async listPrefabs(): Promise<readonly { name: string; savedAt: number }[]> {
    if (!this.prefabStore) return [];
    const entries = await this.prefabStore.list();
    return entries.map(({ name, savedAt }) => ({ name, savedAt }));
  }

  /** Inserts a prefab at the given world offset, as one undoable command. */
  async insertPrefab(name: string, offset: [number, number, number] = [0, 0, 0]): Promise<boolean> {
    if (!this.prefabStore) return false;
    const text = await this.prefabStore.load(name);
    if (!text) {
      this.log('warning', `Prefab ${name} is missing.`);
      return false;
    }
    try {
      const pasted = mapTextToPastePatch(this.document, text, offset, this.insertionParent);
      if (!pasted.patch) return false;
      this.executeCommand({ label: `Insert prefab ${name}`, run: () => pasted.patch! });
      this.setSelection(pasted.ids);
      this.log('ok', `Prefab ${name} placed.`);
      return true;
    } catch (error) {
      this.log('warning', `Prefab insert failed: ${errorText(error)}`);
      return false;
    }
  }

  async deletePrefab(name: string): Promise<void> {
    await this.prefabStore?.remove(name);
    this.emit({ type: 'game' });
  }

  private prefabStore: PrefabStore | null = null;

  /** Attaches the OPFS prefab store after start-up. */
  setPrefabStore(store: PrefabStore): void {
    this.prefabStore = store;
  }

  duplicateSelection(): boolean {
    const text = this.copySelectionText();
    return text ? this.pasteMapText(text, [this.gridSize, this.gridSize, 0]) : false;
  }

  setToolMode(mode: EditorToolMode, source: 'user' | 'internal' = 'user'): void {
    if (mode === this.toolMode) {
      // Pressing V again in vertex mode switches between vertex and edge editing.
      if (mode === 'vertex') {
        this.vertexTool.toggleVertexEdge();
        this.emit({ type: 'tool', source });
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
    if (mode !== 'texture') {
      // Face picks belong to the texture tool; outside it the texture
      // operations target whole brushes.
      this.textureTool.clearFaceSelection();
    }
    this.emit({ type: 'tool', source });
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

  /** Injected by main.ts: runs one compile step in a worker. */
  compileRunner: CompileRunner | null = null;

  /** Injected by main.ts: saves binary output (the compiled .bsp). */
  saveBinaryFile: ((name: string, data: Uint8Array) => Promise<boolean>) | null = null;

  /** Injected by main.ts: cancels the running compile. */
  cancelCompileWorker: (() => void) | null = null;

  private compiling = false;

  /** The parsed leak path of the last compile, or null when there is none. */
  leakPath: readonly [number, number, number][] | null = null;
  private leakIndex = 0;

  /** The next leak point for the camera stepping command (N), advancing each time. */
  nextLeakPoint(): [number, number, number] | null {
    if (!this.leakPath || this.leakPath.length === 0) return null;
    const point = this.leakPath[this.leakIndex % this.leakPath.length]!;
    this.leakIndex++;
    return [point[0], point[1], point[2]];
  }

  /** True while a compile runs; the UI shows the cancel action. */
  get isCompiling(): boolean {
    return this.compiling;
  }

  /** Cancels the running compile, if any. */
  cancelCompile(): void {
    this.cancelCompileWorker?.();
  }

  /**
   * Compiles the current map with the chosen profile: exports in export
   * mode (warnings first), feeds the used textures' .wal headers and the
   * colormap from the game data into the tools, streams the output into
   * the log and saves the .bsp. A leak stops the chain and keeps the
   * pointfile for the leak display.
   */
  async compileMap(profile: CompileProfile): Promise<boolean> {
    if (!this.compileRunner || !this.vfs) {
      this.log('warning', 'Open a game folder before compiling.');
      return false;
    }
    if (this.compiling) {
      this.log('warning', 'A compile is already running.');
      return false;
    }
    const exported = this.exportMapText();
    for (const warning of exported.warnings) {
      this.log('warning', warning);
    }
    const mapName = (this.map?.replace(/\.(map|joole\.json)$/i, '') || 'untitled') + '.map';
    // The .wal headers of every texture the map uses.
    const wals: { name: string; data: Uint8Array }[] = [];
    const missing: string[] = [];
    for (const name of this.texturesInUse()) {
      const bytes = await this.vfs.readFile(`textures/${name}.wal`);
      if (bytes) {
        wals.push({ name, data: bytes });
      } else {
        missing.push(name);
      }
    }
    if (missing.length > 0) {
      this.log('warning', `Textures missing from the game data: ${missing.join(', ')}`);
    }
    const colormap = await this.vfs.readFile('pics/colormap.pcx');
    this.compiling = true;
    this.log('info', `Compiling ${mapName} (${profile})…`);
    this.emit({ type: 'document' });
    try {
      const result = await runCompilePipeline(
        this.compileRunner,
        profile,
        mapName,
        exported.text,
        wals,
        colormap ?? null,
      );
      if (result.leaked) {
        this.leakPath = result.pts ? parsePts(new TextDecoder().decode(result.pts)) : null;
        this.log(
          'error',
          `The map leaks; the path is drawn in the views. N steps the camera along it.`,
        );
        return false;
      }
      this.leakPath = null;
      this.leakIndex = 0;
      const bspName = mapName.replace(/\.map$/i, '.bsp');
      const saved = this.saveBinaryFile ? await this.saveBinaryFile(bspName, result.bsp) : false;
      this.log('ok', `Compiled ${bspName} (${result.bsp.byteLength} bytes).`);
      return saved;
    } catch (error) {
      this.log('error', `Compile failed: ${errorText(error)}`);
      return false;
    } finally {
      this.compiling = false;
      this.emit({ type: 'document' });
    }
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
    return allFacesOf(this.document, expandBrushIds(this.document, this.selection));
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

  /**
   * The texture browser's click: sets the current texture and applies it to
   * the targets — the picked faces in the texture tool, or every face of the
   * selected brushes including groups and brush entities. Targets that
   * already carry the texture are skipped, so clicking the active texture
   * again adds no undo step.
   */
  chooseTexture(name: string): void {
    if (!name) return;
    this.currentTexture = name;
    const faces = this.textureTargets().filter((ref) => {
      const node = this.document.nodes.get(ref.brush);
      return node?.kind === 'brush' && node.faces[ref.face]?.tex.name !== name;
    });
    if (faces.length > 0) {
      const patch = applyTexturePatch(this.document, faces, name);
      if (patch) {
        try {
          this.executeCommand({ label: 'Apply Texture', run: () => patch });
        } catch (error) {
          this.log('warning', errorText(error));
        }
      }
    }
    this.emit({ type: 'tool' });
  }

  /** The texture tool's focus navigation state (T1.6), for the Properties row. */
  textureFocus() {
    return resolveFocus(
      this.document,
      this.selection,
      this.textureTool.faceSelection.map((ref) => ({ brush: ref.brush, face: ref.face })),
    );
  }

  /** Steps the texture focus one face forward or back, wrapping around. */
  stepTextureFocus(direction: 1 | -1): void {
    const focus = this.textureFocus();
    if (!focus.brush) {
      return;
    }
    const target = stepFocus(focus, direction);
    this.textureTool.setFaceSelection(target === -1 ? [] : [{ brush: focus.brush, face: target }]);
    this.emit({ type: 'tool' });
  }

  /** The polygons of the texture tool's picked faces, for the renderer highlight. */
  faceHighlightPolygons(): readonly (readonly Vec3[])[] {
    if (this.toolMode !== 'texture') {
      return [];
    }
    const out: (readonly Vec3[])[] = [];
    for (const ref of this.textureTool.faceSelection) {
      const node = this.document.nodes.get(ref.brush);
      if (node?.kind !== 'brush') continue;
      const polygon = analyzeBrush(node).polygons[ref.face];
      if (polygon && polygon.length >= 3) {
        out.push(polygon);
      }
    }
    return out;
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
  /** The parsed frame-0 wireframe of a model path, once loaded. */
  readonly modelWireframes = new Map<string, Md2Wireframe | null>();

  /**
   * Loads an md2 model through the virtual filesystem and parses its frame-0
   * wireframe. null entries mark failed lookups so they are not retried.
   */
  async loadModel(path: string): Promise<Md2Wireframe | null> {
    if (this.modelWireframes.has(path)) return this.modelWireframes.get(path) ?? null;
    if (!this.vfs) return null;
    const hit = this.vfs.find(path);
    if (!hit) {
      this.modelWireframes.set(path, null);
      return null;
    }
    try {
      const bytes = await hit.read();
      const wire = parseMd2(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      );
      this.modelWireframes.set(path, wire);
      return wire;
    } catch {
      this.modelWireframes.set(path, null);
      return null;
    }
  }

  /** The wireframe edges of a point entity's model, when one is loaded. */
  entityWireframe(node: {
    readonly kind: string;
    readonly props?: [string, string][];
  }):
    | readonly (readonly [readonly [number, number, number], readonly [number, number, number]])[]
    | null {
    const classname = node.props?.find(([k]) => k === 'classname')?.[1];
    if (!classname) return null;
    const model = CLASS_MODELS[classname];
    if (!model) return null;
    const wire = this.modelWireframes.get(model);
    if (!wire) {
      // Trigger the asynchronous load; the caller re-asks when it arrives.
      void this.loadModel(model).then((loaded) => {
        if (loaded) this.emit({ type: 'document' });
      });
      return null;
    }
    return wire.edges;
  }

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
