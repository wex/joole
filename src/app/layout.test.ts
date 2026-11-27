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
