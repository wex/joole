/** Bounded workspace-layout model: arrangement only, no docking or floating windows. */

export type RightSectionId = 'properties' | 'textures';
export type LayoutBottomTab = 'tree' | 'prefabs' | 'log';
export type LayoutViewport = 'quad' | '3d' | 'top' | 'front' | 'side';

export interface LayoutPanel<T extends string> {
  readonly id: T;
  readonly visible: boolean;
}

/**
 * The rearrangeable part of the workspace. Sizes and collapsed state remain
 * in their established settings keys; this structure owns order, visibility,
 * the active bottom tab and the quad/maximized viewport arrangement.
 */
export interface WorkspaceLayout {
  readonly rightDockVisible: boolean;
  readonly rightSections: readonly LayoutPanel<RightSectionId>[];
  readonly bottomDockVisible: boolean;
  readonly bottomTabs: readonly LayoutPanel<LayoutBottomTab>[];
  readonly bottomActiveTab: LayoutBottomTab;
  /** 'quad' is the normal 2×2 grid; a view id is the maximized view. */
  readonly viewport: LayoutViewport;
}

export const RIGHT_SECTION_IDS = ['properties', 'textures'] as const;
export const BOTTOM_TAB_IDS = ['tree', 'prefabs', 'log'] as const;
export const LAYOUT_VIEWPORTS = ['quad', '3d', 'top', 'front', 'side'] as const;

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
  rightDockVisible: true,
  rightSections: [
    { id: 'properties', visible: true },
    { id: 'textures', visible: true },
  ],
  bottomDockVisible: true,
  bottomTabs: [
    { id: 'tree', visible: true },
    { id: 'prefabs', visible: true },
    { id: 'log', visible: true },
  ],
  bottomActiveTab: 'tree',
  viewport: 'quad',
};

function cloneDefault(): WorkspaceLayout {
  return {
    ...DEFAULT_WORKSPACE_LAYOUT,
    rightSections: DEFAULT_WORKSPACE_LAYOUT.rightSections.map((panel) => ({ ...panel })),
    bottomTabs: DEFAULT_WORKSPACE_LAYOUT.bottomTabs.map((panel) => ({ ...panel })),
  };
}

function hasId<T extends string>(ids: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (ids as readonly string[]).includes(value);
}

/** Parses one ordered panel list, dropping duplicates and appending missing panels. */
function orderedPanels<T extends string>(
  value: unknown,
  ids: readonly T[],
  fallback: readonly LayoutPanel<T>[],
): LayoutPanel<T>[] {
  const out: LayoutPanel<T>[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const raw = item as Record<string, unknown>;
      if (!hasId(ids, raw['id']) || out.some((panel) => panel.id === raw['id'])) continue;
      out.push({ id: raw['id'], visible: raw['visible'] !== false });
    }
  }
  for (const panel of fallback) {
    if (!out.some((existing) => existing.id === panel.id)) out.push({ ...panel });
  }
  return out;
}

/**
 * Validates and repairs persisted layout state. Missing panels are appended,
 * duplicates dropped and invalid visibility combinations repaired; wholly
 * foreign input falls back to the default arrangement.
 */
export function normalizeWorkspaceLayout(stored: unknown): WorkspaceLayout {
  if (!stored || typeof stored !== 'object') return cloneDefault();
  const raw = stored as Record<string, unknown>;
  const fallback = cloneDefault();
  let rightSections = orderedPanels(
    raw['rightSections'],
    RIGHT_SECTION_IDS,
    fallback.rightSections,
  );
  let bottomTabs = orderedPanels(raw['bottomTabs'], BOTTOM_TAB_IDS, fallback.bottomTabs);
  const rightDockVisible = raw['rightDockVisible'] !== false;
  const bottomDockVisible = raw['bottomDockVisible'] !== false;

  // A visible dock must have at least one visible section/tab. Hiding the
  // whole dock is the explicit way to remove all of them.
  if (rightDockVisible && !rightSections.some((panel) => panel.visible)) {
    rightSections = rightSections.map((panel, index) =>
      index === 0 ? { ...panel, visible: true } : panel,
    );
  }
  if (bottomDockVisible && !bottomTabs.some((panel) => panel.visible)) {
    bottomTabs = bottomTabs.map((panel, index) =>
      index === 0 ? { ...panel, visible: true } : panel,
    );
  }

  const active = hasId(BOTTOM_TAB_IDS, raw['bottomActiveTab']) ? raw['bottomActiveTab'] : 'tree';
  const activeVisible = bottomTabs.find((panel) => panel.id === active)?.visible === true;
  const bottomActiveTab = activeVisible
    ? active
    : (bottomTabs.find((panel) => panel.visible)?.id ?? 'tree');
  const viewport = hasId(LAYOUT_VIEWPORTS, raw['viewport']) ? raw['viewport'] : 'quad';

  return {
    ...raw,
    rightDockVisible,
    rightSections,
    bottomDockVisible,
    bottomTabs,
    bottomActiveTab,
    viewport,
  };
}

/** Layout-related size/collapse state captured by a named arrangement. */
export interface WorkspaceLayoutSnapshot extends WorkspaceLayout {
  readonly rightWidth: number;
  readonly bottomHeight: number;
  readonly dockSplit: number;
  readonly propertiesCollapsed: boolean;
  readonly texturesCollapsed: boolean;
  readonly bottomCollapsed: boolean;
  readonly [key: string]: unknown;
}

export interface NamedLayout {
  readonly id: string;
  readonly name: string;
  readonly snapshot: WorkspaceLayoutSnapshot;
  readonly [key: string]: unknown;
}

export const MAX_NAMED_LAYOUTS = 32;
export const MAX_LAYOUT_NAME_LENGTH = 40;

export const DEFAULT_LAYOUT_SNAPSHOT: WorkspaceLayoutSnapshot = {
  ...DEFAULT_WORKSPACE_LAYOUT,
  rightWidth: 320,
  bottomHeight: 160,
  dockSplit: 0.5,
  propertiesCollapsed: false,
  texturesCollapsed: false,
  bottomCollapsed: true,
};

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && value >= min && value <= max ? value : fallback;
}

function boolIn(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Validates one named-layout snapshot, dropping corrupt values but preserving unknown fields. */
export function normalizeLayoutSnapshot(stored: unknown): WorkspaceLayoutSnapshot {
  if (!stored || typeof stored !== 'object') {
    return {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      rightSections: DEFAULT_LAYOUT_SNAPSHOT.rightSections.map((panel) => ({ ...panel })),
      bottomTabs: DEFAULT_LAYOUT_SNAPSHOT.bottomTabs.map((panel) => ({ ...panel })),
    };
  }
  const raw = stored as Record<string, unknown>;
  const arrangement = normalizeWorkspaceLayout(raw);
  return {
    ...raw,
    ...arrangement,
    rightWidth: numberIn(raw['rightWidth'], 224, 640, DEFAULT_LAYOUT_SNAPSHOT.rightWidth),
    bottomHeight: numberIn(raw['bottomHeight'], 96, 640, DEFAULT_LAYOUT_SNAPSHOT.bottomHeight),
    dockSplit: numberIn(raw['dockSplit'], 0.15, 0.85, DEFAULT_LAYOUT_SNAPSHOT.dockSplit),
    propertiesCollapsed: boolIn(
      raw['propertiesCollapsed'],
      DEFAULT_LAYOUT_SNAPSHOT.propertiesCollapsed,
    ),
    texturesCollapsed: boolIn(raw['texturesCollapsed'], DEFAULT_LAYOUT_SNAPSHOT.texturesCollapsed),
    bottomCollapsed: boolIn(raw['bottomCollapsed'], DEFAULT_LAYOUT_SNAPSHOT.bottomCollapsed),
  };
}

/** Extracts the arrangement part of a snapshot for the current-layout settings key. */
export function arrangementOfSnapshot(snapshot: WorkspaceLayoutSnapshot): WorkspaceLayout {
  return normalizeWorkspaceLayout({
    rightDockVisible: snapshot.rightDockVisible,
    rightSections: snapshot.rightSections,
    bottomDockVisible: snapshot.bottomDockVisible,
    bottomTabs: snapshot.bottomTabs,
    bottomActiveTab: snapshot.bottomActiveTab,
    viewport: snapshot.viewport,
  });
}

/** Parses the named-layout collection, dropping corrupt entries individually. */
export function normalizeNamedLayouts(stored: unknown): NamedLayout[] {
  if (!Array.isArray(stored)) return [];
  const out: NamedLayout[] = [];
  const names = new Set<string>();
  for (const item of stored) {
    if (out.length >= MAX_NAMED_LAYOUTS) break;
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const id = raw['id'];
    const name = typeof raw['name'] === 'string' ? raw['name'].trim() : '';
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      out.some((entry) => entry.id === id) ||
      name.length === 0 ||
      name.length > MAX_LAYOUT_NAME_LENGTH ||
      names.has(name.toLowerCase()) ||
      !raw['snapshot'] ||
      typeof raw['snapshot'] !== 'object'
    ) {
      continue;
    }
    names.add(name.toLowerCase());
    out.push({ ...raw, id, name, snapshot: normalizeLayoutSnapshot(raw['snapshot']) });
  }
  return out;
}

export type NamedLayoutError =
  'empty-name' | 'long-name' | 'duplicate-name' | 'too-many-layouts' | 'missing-layout';

export type NamedLayoutResult =
  | { readonly ok: true; readonly layouts: readonly NamedLayout[]; readonly id: string }
  | { readonly ok: false; readonly error: NamedLayoutError };

function validLayoutName(
  layouts: readonly NamedLayout[],
  name: string,
  exceptId?: string,
): NamedLayoutError | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'empty-name';
  if (trimmed.length > MAX_LAYOUT_NAME_LENGTH) return 'long-name';
  if (
    layouts.some(
      (layout) => layout.id !== exceptId && layout.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return 'duplicate-name';
  }
  return null;
}

/** Saves the current arrangement under a new unique name. */
export function saveNamedLayout(
  layouts: readonly NamedLayout[],
  name: string,
  snapshot: WorkspaceLayoutSnapshot,
  id: string,
): NamedLayoutResult {
  const error = validLayoutName(layouts, name);
  if (error) return { ok: false, error };
  if (layouts.length >= MAX_NAMED_LAYOUTS) return { ok: false, error: 'too-many-layouts' };
  const entry: NamedLayout = {
    id,
    name: name.trim(),
    snapshot: normalizeLayoutSnapshot(snapshot),
  };
  return { ok: true, layouts: [...layouts, entry], id };
}

/** Renames one saved layout without changing its snapshot. */
export function renameNamedLayout(
  layouts: readonly NamedLayout[],
  id: string,
  name: string,
): NamedLayoutResult {
  if (!layouts.some((layout) => layout.id === id)) return { ok: false, error: 'missing-layout' };
  const error = validLayoutName(layouts, name, id);
  if (error) return { ok: false, error };
  return {
    ok: true,
    id,
    layouts: layouts.map((layout) =>
      layout.id === id ? { ...layout, name: name.trim() } : layout,
    ),
  };
}

/** Overwrites one saved layout with the current snapshot. */
export function updateNamedLayout(
  layouts: readonly NamedLayout[],
  id: string,
  snapshot: WorkspaceLayoutSnapshot,
): NamedLayoutResult {
  if (!layouts.some((layout) => layout.id === id)) return { ok: false, error: 'missing-layout' };
  return {
    ok: true,
    id,
    layouts: layouts.map((layout) =>
      layout.id === id ? { ...layout, snapshot: normalizeLayoutSnapshot(snapshot) } : layout,
    ),
  };
}

/** Deletes one saved layout. */
export function deleteNamedLayout(layouts: readonly NamedLayout[], id: string): NamedLayoutResult {
  if (!layouts.some((layout) => layout.id === id)) return { ok: false, error: 'missing-layout' };
  return { ok: true, id, layouts: layouts.filter((layout) => layout.id !== id) };
}

/** Moves one panel earlier/later in its ordered zone. */
export function moveLayoutPanel(
  layout: WorkspaceLayout,
  zone: 'rightSections' | 'bottomTabs',
  id: string,
  delta: -1 | 1,
): WorkspaceLayout {
  const panels = [...layout[zone]] as LayoutPanel<string>[];
  const index = panels.findIndex((panel) => panel.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= panels.length) return layout;
  const [panel] = panels.splice(index, 1);
  panels.splice(target, 0, panel!);
  return normalizeWorkspaceLayout({ ...layout, [zone]: panels });
}

/** Changes one panel's visibility, with the visible-dock invariant enforced by normalization. */
export function setLayoutPanelVisible(
  layout: WorkspaceLayout,
  zone: 'rightSections' | 'bottomTabs',
  id: string,
  visible: boolean,
): WorkspaceLayout {
  const panels = (layout[zone] as readonly LayoutPanel<string>[]).map((panel) =>
    panel.id === id ? { ...panel, visible } : { ...panel },
  );
  return normalizeWorkspaceLayout({ ...layout, [zone]: panels });
}

/** Updates arrangement scalar fields through the same validation path. */
export function updateWorkspaceLayout(
  layout: WorkspaceLayout,
  partial: Partial<WorkspaceLayout>,
): WorkspaceLayout {
  return normalizeWorkspaceLayout({ ...layout, ...partial });
}
