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
    rightDockVisible,
    rightSections,
    bottomDockVisible,
    bottomTabs,
    bottomActiveTab,
    viewport,
  };
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
