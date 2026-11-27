import { createSignal, For, Show, untrack } from 'solid-js';
import { COLOR_TOKENS, defaultColor } from '@app/colors';
import {
  arrangementOfSnapshot,
  deleteNamedLayout,
  moveLayoutPanel,
  renameNamedLayout,
  saveNamedLayout,
  setLayoutPanelVisible,
  updateNamedLayout,
  updateWorkspaceLayout,
  type LayoutViewport,
  type NamedLayout,
  type NamedLayoutError,
  type WorkspaceLayout,
  type WorkspaceLayoutSnapshot,
} from '@app/layout';
import { Dialog } from './Dialog';
import styles from './SettingsDialog.module.css';

export interface SettingsDialogValues {
  readonly theme: 'dark' | 'light';
  readonly wheelStep: number;
  readonly mouseLookSensitivity: number;
  readonly gridSize: number;
  readonly thumbSize: number;
  readonly showToolOverlay: boolean;
  readonly groupCsgResults: boolean;
  readonly handleSize: number;
}

export interface SettingsDialogProps {
  readonly values: SettingsDialogValues;
  /** Colour overrides of both themes, only the changed tokens (T15.10). */
  readonly colors: {
    readonly dark: Record<string, string>;
    readonly light: Record<string, string>;
  };
  /** The current bounded workspace arrangement (T2.7). */
  readonly layout: WorkspaceLayout;
  /** Saved arrangements and the active preset id (T2.8). */
  readonly layouts: readonly NamedLayout[];
  readonly activeLayoutId: string | null;
  readonly currentLayoutSnapshot: () => WorkspaceLayoutSnapshot;
  readonly defaultLayoutSnapshot: WorkspaceLayoutSnapshot;
  readonly onChange: (partial: Record<string, unknown>) => void;
  readonly onReset: () => void;
  readonly onResetColors: () => void;
  readonly onClose: () => void;
}

const gridSizes = [1, 2, 4, 8, 16, 32, 64, 128, 256];

/**
 * The Settings dialog (T1.15). Every change applies immediately and persists;
 * there is no OK/Cancel step.
 */
export function SettingsDialog(props: SettingsDialogProps) {
  const [tab, setTab] = createSignal<'general' | 'layout' | 'colors'>('general');
  const [selectedLayout, setSelectedLayout] = createSignal(
    untrack(() => props.activeLayoutId) ?? '',
  );
  const [layoutName, setLayoutName] = createSignal('');
  const [layoutError, setLayoutError] = createSignal<NamedLayoutError | null>(null);
  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'layout' as const, label: 'Layout' },
    { id: 'colors' as const, label: 'Colors' },
  ];
  const moveTab = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const index = tabs.findIndex((item) => item.id === tab());
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(index + step + tabs.length) % tabs.length]!.id;
    setTab(next);
    queueMicrotask(() => document.getElementById(`settings-tab-${next}`)?.focus());
  };
  const setColor = (token: string, value: string | null) => {
    const theme = props.values.theme;
    const next = { ...props.colors[theme] };
    if (value === null) {
      delete next[token];
    } else {
      next[token] = value;
    }
    props.onChange({
      colors: { dark: { ...props.colors.dark }, light: { ...props.colors.light }, [theme]: next },
    });
  };

  const changeLayout = (layout: WorkspaceLayout) =>
    props.onChange({ layout, activeLayoutId: null });
  const movePanel = (zone: 'rightSections' | 'bottomTabs', id: string, delta: -1 | 1) =>
    changeLayout(moveLayoutPanel(props.layout, zone, id, delta));
  const setPanelVisible = (zone: 'rightSections' | 'bottomTabs', id: string, visible: boolean) =>
    changeLayout(setLayoutPanelVisible(props.layout, zone, id, visible));
  const panelLabel = (id: string) => id[0]!.toUpperCase() + id.slice(1);
  const onlyVisible = (zone: 'rightSections' | 'bottomTabs', id: string) =>
    props.layout[zone].filter((panel) => panel.visible).length === 1 &&
    props.layout[zone].find((panel) => panel.id === id)?.visible === true;

  const layoutErrorText = (error: NamedLayoutError) =>
    ({
      'empty-name': 'Enter a layout name.',
      'long-name': 'Layout names are limited to 40 characters.',
      'duplicate-name': 'A layout with that name already exists.',
      'too-many-layouts': 'At most 32 layouts can be saved.',
      'missing-layout': 'Choose a saved layout first.',
    })[error];
  const layoutById = (id: string) => props.layouts.find((layout) => layout.id === id) ?? null;
  const showLayoutResult = (result: { ok: true } | { ok: false; error: NamedLayoutError }) =>
    setLayoutError(result.ok ? null : result.error);
  const layoutPartial = (snapshot: WorkspaceLayoutSnapshot, activeLayoutId: string | null) => ({
    layout: arrangementOfSnapshot(snapshot),
    rightWidth: snapshot.rightWidth,
    bottomHeight: snapshot.bottomHeight,
    dockSplit: snapshot.dockSplit,
    propertiesCollapsed: snapshot.propertiesCollapsed,
    texturesCollapsed: snapshot.texturesCollapsed,
    bottomCollapsed: snapshot.bottomCollapsed,
    activeLayoutId,
  });
  const newLayoutId = () =>
    globalThis.crypto?.randomUUID?.() ?? `layout-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const saveLayout = () => {
    const id = newLayoutId();
    const result = saveNamedLayout(props.layouts, layoutName(), props.currentLayoutSnapshot(), id);
    showLayoutResult(result);
    if (!result.ok) return;
    props.onChange({ layouts: [...result.layouts], activeLayoutId: id });
    setSelectedLayout(id);
    setLayoutName('');
  };
  const applyLayout = () => {
    const entry = layoutById(selectedLayout());
    if (!entry) {
      setLayoutError('missing-layout');
      return;
    }
    setLayoutError(null);
    props.onChange(layoutPartial(entry.snapshot, entry.id));
  };
  const renameLayout = () => {
    const result = renameNamedLayout(props.layouts, selectedLayout(), layoutName());
    showLayoutResult(result);
    if (result.ok) props.onChange({ layouts: [...result.layouts] });
  };
  const overwriteLayout = () => {
    const result = updateNamedLayout(
      props.layouts,
      selectedLayout(),
      props.currentLayoutSnapshot(),
    );
    showLayoutResult(result);
    if (result.ok) props.onChange({ layouts: [...result.layouts] });
  };
  const removeLayout = () => {
    const id = selectedLayout();
    const result = deleteNamedLayout(props.layouts, id);
    showLayoutResult(result);
    if (!result.ok) return;
    props.onChange({
      layouts: [...result.layouts],
      ...(props.activeLayoutId === id ? { activeLayoutId: null } : {}),
    });
    setSelectedLayout('');
    setLayoutName('');
  };
  const resetLayout = () => {
    setLayoutError(null);
    setSelectedLayout('');
    props.onChange(layoutPartial(props.defaultLayoutSnapshot, null));
  };
  return (
    <Dialog title="Settings" onClose={props.onClose} testId="settings-dialog">
      <div role="tablist" aria-label="Settings sections" class={styles.tabs} onKeyDown={moveTab}>
        <For each={tabs}>
          {(item) => (
            <button
              type="button"
              id={`settings-tab-${item.id}`}
              role="tab"
              class={styles.tab}
              aria-selected={tab() === item.id ? 'true' : 'false'}
              tabindex={tab() === item.id ? '0' : '-1'}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>
      <Show when={tab() === 'colors'}>
        <div class={styles.form} data-testid="settings-colors">
          <p class={styles.themeNote}>
            Colours of the {props.values.theme} theme. Changes apply at once; a row's button
            restores its default.
          </p>
          <For each={['views', 'interface'] as const}>
            {(group) => (
              <section class={styles.group}>
                <h3 class={styles.heading}>{group === 'views' ? 'Views' : 'Interface'}</h3>
                <For each={COLOR_TOKENS.filter((token) => token.group === group)}>
                  {(token) => {
                    const value = () =>
                      props.colors[props.values.theme][token.name] ??
                      defaultColor(token.name, props.values.theme);
                    const overridden = () => token.name in props.colors[props.values.theme];
                    return (
                      <label class={styles.row}>
                        <span class={styles.label}>{token.label}</span>
                        <input
                          type="color"
                          value={value()}
                          data-testid={`color-${token.name}`}
                          onInput={(event) => setColor(token.name, event.currentTarget.value)}
                        />
                        <span class={styles.hex}>{value()}</span>
                        <Show when={overridden()}>
                          <button
                            type="button"
                            class={styles.rowReset}
                            aria-label={`Reset ${token.label}`}
                            onClick={() => setColor(token.name, null)}
                          >
                            ×
                          </button>
                        </Show>
                      </label>
                    );
                  }}
                </For>
              </section>
            )}
          </For>
          <footer class={styles.footer}>
            <button
              type="button"
              class={styles.reset}
              data-testid="reset-colors"
              onClick={() => props.onResetColors()}
            >
              Reset colours
            </button>
          </footer>
        </div>
      </Show>
      <Show when={tab() === 'layout'}>
        <div class={styles.form} data-testid="settings-layout">
          <section class={styles.group}>
            <h3 class={styles.heading}>Workspace</h3>
            <label class={styles.row}>
              <span class={styles.label}>Viewport arrangement</span>
              <select
                data-testid="layout-viewport"
                value={props.layout.viewport}
                onChange={(event) =>
                  changeLayout(
                    updateWorkspaceLayout(props.layout, {
                      viewport: event.currentTarget.value as LayoutViewport,
                    }),
                  )
                }
              >
                <option value="quad">Four views</option>
                <option value="3d">3D maximized</option>
                <option value="top">Top maximized</option>
                <option value="front">Front maximized</option>
                <option value="side">Side maximized</option>
              </select>
            </label>
            <label class={styles.row}>
              <span class={styles.label}>Show right dock</span>
              <input
                type="checkbox"
                data-testid="layout-right-dock-visible"
                checked={props.layout.rightDockVisible}
                onChange={(event) =>
                  changeLayout(
                    updateWorkspaceLayout(props.layout, {
                      rightDockVisible: event.currentTarget.checked,
                    }),
                  )
                }
              />
            </label>
            <label class={styles.row}>
              <span class={styles.label}>Show bottom dock</span>
              <input
                type="checkbox"
                data-testid="layout-bottom-dock-visible"
                checked={props.layout.bottomDockVisible}
                onChange={(event) =>
                  changeLayout(
                    updateWorkspaceLayout(props.layout, {
                      bottomDockVisible: event.currentTarget.checked,
                    }),
                  )
                }
              />
            </label>
          </section>
          <section class={styles.group}>
            <h3 class={styles.heading}>Right dock sections</h3>
            <For each={props.layout.rightSections}>
              {(panel, index) => (
                <div class={styles.layoutItem} data-testid={`layout-right-${panel.id}`}>
                  <label class={styles.layoutName}>
                    <input
                      type="checkbox"
                      data-testid={`layout-right-${panel.id}-visible`}
                      checked={panel.visible}
                      disabled={
                        props.layout.rightDockVisible && onlyVisible('rightSections', panel.id)
                      }
                      onChange={(event) =>
                        setPanelVisible('rightSections', panel.id, event.currentTarget.checked)
                      }
                    />
                    {panelLabel(panel.id)}
                  </label>
                  <span class={styles.layoutButtons}>
                    <button
                      type="button"
                      aria-label={`Move ${panelLabel(panel.id)} up`}
                      data-testid={`layout-right-${panel.id}-up`}
                      disabled={index() === 0}
                      onClick={() => movePanel('rightSections', panel.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${panelLabel(panel.id)} down`}
                      data-testid={`layout-right-${panel.id}-down`}
                      disabled={index() === props.layout.rightSections.length - 1}
                      onClick={() => movePanel('rightSections', panel.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                </div>
              )}
            </For>
          </section>
          <section class={styles.group}>
            <h3 class={styles.heading}>Bottom tabs</h3>
            <For each={props.layout.bottomTabs}>
              {(panel, index) => (
                <div class={styles.layoutItem} data-testid={`layout-bottom-${panel.id}`}>
                  <label class={styles.layoutName}>
                    <input
                      type="checkbox"
                      data-testid={`layout-bottom-${panel.id}-visible`}
                      checked={panel.visible}
                      disabled={
                        props.layout.bottomDockVisible && onlyVisible('bottomTabs', panel.id)
                      }
                      onChange={(event) =>
                        setPanelVisible('bottomTabs', panel.id, event.currentTarget.checked)
                      }
                    />
                    {panelLabel(panel.id)}
                  </label>
                  <span class={styles.layoutButtons}>
                    <button
                      type="button"
                      aria-label={`Move ${panelLabel(panel.id)} up`}
                      data-testid={`layout-bottom-${panel.id}-up`}
                      disabled={index() === 0}
                      onClick={() => movePanel('bottomTabs', panel.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${panelLabel(panel.id)} down`}
                      data-testid={`layout-bottom-${panel.id}-down`}
                      disabled={index() === props.layout.bottomTabs.length - 1}
                      onClick={() => movePanel('bottomTabs', panel.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                </div>
              )}
            </For>
          </section>
          <section class={styles.group}>
            <h3 class={styles.heading}>Named layouts</h3>
            <label class={styles.row}>
              <span class={styles.label}>Saved layout</span>
              <select
                data-testid="layout-preset-select"
                value={selectedLayout()}
                onChange={(event) => {
                  const id = event.currentTarget.value;
                  setSelectedLayout(id);
                  setLayoutName(layoutById(id)?.name ?? '');
                  setLayoutError(null);
                }}
              >
                <option value="" disabled>
                  Choose…
                </option>
                <For each={props.layouts}>
                  {(layout) => <option value={layout.id}>{layout.name}</option>}
                </For>
              </select>
            </label>
            <label class={styles.row}>
              <span class={styles.label}>Name</span>
              <input
                type="text"
                maxlength="40"
                data-testid="layout-name-input"
                value={layoutName()}
                placeholder="Layout name"
                onInput={(event) => setLayoutName(event.currentTarget.value)}
              />
            </label>
            <div class={styles.layoutActions}>
              <button type="button" data-testid="layout-save" onClick={saveLayout}>
                Save current as
              </button>
              <button
                type="button"
                data-testid="layout-apply"
                disabled={!selectedLayout()}
                onClick={applyLayout}
              >
                Apply
              </button>
              <button
                type="button"
                data-testid="layout-rename"
                disabled={!selectedLayout()}
                onClick={renameLayout}
              >
                Rename
              </button>
              <button
                type="button"
                data-testid="layout-update"
                disabled={!selectedLayout()}
                onClick={overwriteLayout}
              >
                Update
              </button>
              <button
                type="button"
                data-testid="layout-delete"
                disabled={!selectedLayout()}
                onClick={removeLayout}
              >
                Delete
              </button>
            </div>
            <div class={styles.layoutActions}>
              <button type="button" data-testid="layout-reset" onClick={resetLayout}>
                Reset layout
              </button>
            </div>
            <Show when={layoutError()}>
              {(error) => (
                <p class={styles.layoutError} data-testid="layout-error" role="alert">
                  {layoutErrorText(error())}
                </p>
              )}
            </Show>
          </section>
        </div>
      </Show>
      <Show when={tab() === 'general'}>
        <div class={styles.form}>
          <section class={styles.group}>
            <h3 class={styles.heading}>General</h3>
            <label class={styles.row}>
              <span class={styles.label}>Theme</span>
              <select
                value={props.values.theme}
                onChange={(event) => props.onChange({ theme: event.currentTarget.value })}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
          </section>
          <section class={styles.group}>
            <h3 class={styles.heading}>Views</h3>
            <label class={styles.row}>
              <span class={styles.label}>3D wheel step</span>
              <input
                type="number"
                min="8"
                max="512"
                step="8"
                value={props.values.wheelStep}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (value >= 8 && value <= 512) props.onChange({ wheelStep: value });
                }}
              />
            </label>
            <label class={styles.row}>
              <span class={styles.label}>Mouse-look sensitivity</span>
              <input
                type="number"
                min="0.02"
                max="1"
                step="0.01"
                value={props.values.mouseLookSensitivity}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (value >= 0.02 && value <= 1) props.onChange({ mouseLookSensitivity: value });
                }}
              />
            </label>
          </section>
          <section class={styles.group}>
            <h3 class={styles.heading}>Grid</h3>
            <label class={styles.row}>
              <span class={styles.label}>Grid size at start-up</span>
              <select
                value={props.values.gridSize}
                onChange={(event) =>
                  props.onChange({ gridSize: Number(event.currentTarget.value) })
                }
              >
                <For each={gridSizes}>{(size) => <option value={size}>{size}</option>}</For>
              </select>
            </label>
          </section>
          <section class={styles.group}>
            <h3 class={styles.heading}>Textures</h3>
            <label class={styles.row}>
              <span class={styles.label}>Thumbnail size</span>
              <input
                type="range"
                min="32"
                max="128"
                step="16"
                value={props.values.thumbSize}
                onInput={(event) =>
                  props.onChange({ thumbSize: Number(event.currentTarget.value) })
                }
              />
            </label>
          </section>
          <section class={styles.group}>
            <h3 class={styles.heading}>Tools</h3>
            <label class={styles.row}>
              <span class={styles.label}>Show tool overlay</span>
              <input
                type="checkbox"
                checked={props.values.showToolOverlay}
                onChange={(event) =>
                  props.onChange({ showToolOverlay: event.currentTarget.checked })
                }
              />
            </label>
            <label class={styles.row}>
              <span class={styles.label}>Handle size</span>
              <input
                type="range"
                min="7"
                max="28"
                step="1"
                value={props.values.handleSize}
                aria-valuetext={`${props.values.handleSize} px`}
                data-testid="handle-size-slider"
                onInput={(event) =>
                  props.onChange({ handleSize: Number(event.currentTarget.value) })
                }
              />
            </label>
            <label class={styles.row}>
              <span class={styles.label}>Group CSG results</span>
              <input
                type="checkbox"
                checked={props.values.groupCsgResults}
                onChange={(event) =>
                  props.onChange({ groupCsgResults: event.currentTarget.checked })
                }
              />
            </label>
          </section>
          <footer class={styles.footer}>
            <button type="button" class={styles.reset} onClick={() => props.onReset()}>
              Reset to Defaults
            </button>
          </footer>
        </div>
      </Show>
    </Dialog>
  );
}
