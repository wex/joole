import { createSignal, For, Show } from 'solid-js';
import { COLOR_TOKENS, defaultColor } from '@app/colors';
import {
  moveLayoutPanel,
  setLayoutPanelVisible,
  updateWorkspaceLayout,
  type LayoutViewport,
  type WorkspaceLayout,
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

  const changeLayout = (layout: WorkspaceLayout) => props.onChange({ layout });
  const movePanel = (zone: 'rightSections' | 'bottomTabs', id: string, delta: -1 | 1) =>
    changeLayout(moveLayoutPanel(props.layout, zone, id, delta));
  const setPanelVisible = (zone: 'rightSections' | 'bottomTabs', id: string, visible: boolean) =>
    changeLayout(setLayoutPanelVisible(props.layout, zone, id, visible));
  const panelLabel = (id: string) => id[0]!.toUpperCase() + id.slice(1);
  const onlyVisible = (zone: 'rightSections' | 'bottomTabs', id: string) =>
    props.layout[zone].filter((panel) => panel.visible).length === 1 &&
    props.layout[zone].find((panel) => panel.id === id)?.visible === true;
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
