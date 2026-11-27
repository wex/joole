import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_LAYOUT,
  type WorkspaceLayout,
  moveLayoutPanel,
  normalizeWorkspaceLayout,
  setLayoutPanelVisible,
  updateWorkspaceLayout,
} from './layout';

describe('workspace layout model', () => {
  it('uses the bounded default arrangement for missing or foreign input', () => {
    expect(normalizeWorkspaceLayout(null)).toEqual(DEFAULT_WORKSPACE_LAYOUT);
    expect(normalizeWorkspaceLayout('floating')).toEqual(DEFAULT_WORKSPACE_LAYOUT);
  });

  it('preserves order and visibility while appending missing panels', () => {
    const layout = normalizeWorkspaceLayout({
      rightDockVisible: true,
      rightSections: [
        { id: 'textures', visible: true },
        { id: 'textures', visible: false },
      ],
      bottomDockVisible: true,
      bottomTabs: [
        { id: 'log', visible: true },
        { id: 'tree', visible: false },
      ],
      bottomActiveTab: 'log',
      viewport: 'front',
    });
    expect(layout.rightSections.map((panel) => panel.id)).toEqual(['textures', 'properties']);
    expect(layout.bottomTabs.map((panel) => panel.id)).toEqual(['log', 'tree', 'prefabs']);
    expect(layout.viewport).toBe('front');
    expect(layout.bottomActiveTab).toBe('log');
  });

  it('repairs a visible dock with no visible panels and an active hidden tab', () => {
    const layout = normalizeWorkspaceLayout({
      rightDockVisible: true,
      rightSections: [
        { id: 'properties', visible: false },
        { id: 'textures', visible: false },
      ],
      bottomDockVisible: true,
      bottomTabs: [
        { id: 'tree', visible: false },
        { id: 'prefabs', visible: false },
        { id: 'log', visible: false },
      ],
      bottomActiveTab: 'log',
    });
    expect(layout.rightSections.some((panel) => panel.visible)).toBe(true);
    expect(layout.bottomTabs.some((panel) => panel.visible)).toBe(true);
    expect(layout.bottomTabs.find((panel) => panel.id === layout.bottomActiveTab)?.visible).toBe(
      true,
    );
  });

  it('allows an explicitly hidden dock to contain no visible panels', () => {
    const layout = normalizeWorkspaceLayout({
      rightDockVisible: false,
      rightSections: [
        { id: 'properties', visible: false },
        { id: 'textures', visible: false },
      ],
      bottomDockVisible: false,
      bottomTabs: [
        { id: 'tree', visible: false },
        { id: 'prefabs', visible: false },
        { id: 'log', visible: false },
      ],
    });
    expect(layout.rightSections.every((panel) => !panel.visible)).toBe(true);
    expect(layout.bottomTabs.every((panel) => !panel.visible)).toBe(true);
  });

  it('reorders panels deterministically and clamps movement at the ends', () => {
    const swapped = moveLayoutPanel(DEFAULT_WORKSPACE_LAYOUT, 'rightSections', 'textures', -1);
    expect(swapped.rightSections.map((panel) => panel.id)).toEqual(['textures', 'properties']);
    expect(moveLayoutPanel(swapped, 'rightSections', 'textures', -1)).toEqual(swapped);
    const bottom = moveLayoutPanel(DEFAULT_WORKSPACE_LAYOUT, 'bottomTabs', 'tree', 1);
    expect(bottom.bottomTabs.map((panel) => panel.id)).toEqual(['prefabs', 'tree', 'log']);
  });

  it('hiding the last visible panel in a visible dock is repaired', () => {
    const hidden = setLayoutPanelVisible(DEFAULT_WORKSPACE_LAYOUT, 'bottomTabs', 'tree', false);
    expect(hidden.bottomTabs.find((panel) => panel.id === 'tree')?.visible).toBe(false);
    const onlyTree: WorkspaceLayout = {
      ...DEFAULT_WORKSPACE_LAYOUT,
      bottomTabs: [
        { id: 'tree', visible: true },
        { id: 'prefabs', visible: false },
        { id: 'log', visible: false },
      ],
    };
    const repaired = setLayoutPanelVisible(onlyTree, 'bottomTabs', 'tree', false);
    expect(repaired.bottomTabs.some((panel) => panel.visible)).toBe(true);
  });

  it('updates scalar arrangement state through validation', () => {
    const layout = updateWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT, {
      viewport: 'side',
      bottomActiveTab: 'prefabs',
      bottomDockVisible: false,
    });
    expect(layout.viewport).toBe('side');
    expect(layout.bottomActiveTab).toBe('prefabs');
    expect(layout.bottomDockVisible).toBe(false);
  });
});

describe('named workspace layouts', () => {
  const snapshot = {
    ...DEFAULT_WORKSPACE_LAYOUT,
    rightWidth: 320,
    bottomHeight: 160,
    dockSplit: 0.5,
    propertiesCollapsed: false,
    texturesCollapsed: false,
    bottomCollapsed: true,
  };

  it('saves, renames, updates and deletes a layout immutably', async () => {
    const { saveNamedLayout, renameNamedLayout, updateNamedLayout, deleteNamedLayout } =
      await import('./layout');
    const saved = saveNamedLayout([], 'Work', snapshot, 'one');
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.layouts[0]?.name).toBe('Work');
    expect(snapshot).not.toHaveProperty('name');

    const renamed = renameNamedLayout(saved.layouts, 'one', 'Review');
    expect(renamed.ok && renamed.layouts[0]?.name).toBe('Review');
    const updated = updateNamedLayout(saved.layouts, 'one', {
      ...snapshot,
      rightWidth: 400,
      viewport: 'side',
    });
    expect(updated.ok && updated.layouts[0]?.snapshot.rightWidth).toBe(400);
    const deleted = deleteNamedLayout(saved.layouts, 'one');
    expect(deleted.ok && deleted.layouts).toHaveLength(0);
  });

  it('validates empty, long, duplicate and cap-limit names', async () => {
    const { saveNamedLayout, MAX_NAMED_LAYOUTS, normalizeNamedLayouts } = await import('./layout');
    expect(saveNamedLayout([], '   ', snapshot, 'empty')).toMatchObject({
      ok: false,
      error: 'empty-name',
    });
    expect(saveNamedLayout([], 'x'.repeat(41), snapshot, 'long')).toMatchObject({
      ok: false,
      error: 'long-name',
    });
    const first = saveNamedLayout([], 'Work', snapshot, 'one');
    if (!first.ok) throw new Error('save failed');
    expect(saveNamedLayout(first.layouts, ' work ', snapshot, 'two')).toMatchObject({
      ok: false,
      error: 'duplicate-name',
    });
    const many = Array.from({ length: MAX_NAMED_LAYOUTS }, (_, index) => ({
      id: `l${index}`,
      name: `Layout ${index}`,
      snapshot,
    }));
    expect(normalizeNamedLayouts(many)).toHaveLength(MAX_NAMED_LAYOUTS);
    expect(saveNamedLayout(many, 'Overflow', snapshot, 'overflow')).toMatchObject({
      ok: false,
      error: 'too-many-layouts',
    });
  });

  it('drops corrupt stored layouts individually and preserves unknown fields', async () => {
    const { normalizeNamedLayouts } = await import('./layout');
    const parsed = normalizeNamedLayouts([
      null,
      { id: '', name: 'Bad', snapshot },
      { id: 'good', name: 'Good', snapshot: { ...snapshot, futureField: 7 }, futureEntry: true },
      { id: 'dupe', name: 'good', snapshot },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ id: 'good', futureEntry: true });
    expect(parsed[0]?.snapshot).toMatchObject({ futureField: 7 });
  });

  it('normalizes corrupt snapshot values independently', async () => {
    const { normalizeLayoutSnapshot } = await import('./layout');
    const parsed = normalizeLayoutSnapshot({
      rightWidth: 10,
      bottomHeight: 200,
      dockSplit: 9,
      propertiesCollapsed: 'yes',
      viewport: 'side',
      unknownFuture: { keep: true },
    });
    expect(parsed.rightWidth).toBe(320);
    expect(parsed.bottomHeight).toBe(200);
    expect(parsed.dockSplit).toBe(0.5);
    expect(parsed.propertiesCollapsed).toBe(false);
    expect(parsed.viewport).toBe('side');
    expect(parsed['unknownFuture']).toEqual({ keep: true });
  });
});
