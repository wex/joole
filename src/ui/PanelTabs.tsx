import { For, Show } from 'solid-js';
import type { ViewId } from '@render/index';
import { Icon } from './Icon';
import styles from './PanelTabs.module.css';

export type BottomTab = 'tree' | 'prefabs' | 'log';

const contentTabs: readonly { id: BottomTab; label: string }[] = [
  { id: 'tree', label: 'Tree' },
  { id: 'prefabs', label: 'Prefabs' },
  { id: 'log', label: 'Log' },
];
const viewTabs: readonly { id: ViewId; label: string; key: string }[] = [
  { id: '3d', label: '3D', key: 'F1' },
  { id: 'top', label: 'Top', key: 'F2' },
  { id: 'front', label: 'Front', key: 'F3' },
  { id: 'side', label: 'Side', key: 'F4' },
];

export interface PanelTabsProps {
  readonly selected: BottomTab;
  /** Visible bottom tabs in their layout order. */
  readonly tabs: readonly BottomTab[];
  readonly maximized: ViewId | null;
  /** The panel is collapsed to its tab strip (T15.9). */
  readonly collapsed: boolean;
  /** Error entries added since the Log tab was last shown (T15.9). */
  readonly newErrors: number;
  readonly onSelect: (tab: BottomTab) => void;
  readonly onView: (view: ViewId) => void;
  readonly onToggleCollapsed: () => void;
}

export function PanelTabs(props: PanelTabsProps) {
  const move = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const visible = contentTabs.filter((tab) => props.tabs.includes(tab.id));
    if (visible.length === 0) return;
    const current = visible.findIndex((tab) => tab.id === props.selected);
    const index = current >= 0 ? current : 0;
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = visible[(index + step + visible.length) % visible.length]!.id;
    props.onSelect(next);
    queueMicrotask(() => document.getElementById(`bottom-tab-${next}`)?.focus());
  };

  return (
    <div class={styles.tabs}>
      <button
        type="button"
        class={styles.disclosure}
        aria-expanded={props.collapsed ? 'false' : 'true'}
        aria-label={props.collapsed ? 'Expand bottom panel' : 'Collapse bottom panel'}
        onClick={() => props.onToggleCollapsed()}
      >
        <Icon name={props.collapsed ? 'chevronRight' : 'chevronDown'} />
      </button>
      <div role="tablist" aria-label="Bottom panel" class={styles.group} onKeyDown={move}>
        <For each={contentTabs.filter((tab) => props.tabs.includes(tab.id))}>
          {(tab) => (
            <button
              type="button"
              id={`bottom-tab-${tab.id}`}
              role="tab"
              class={styles.tab}
              aria-selected={props.selected === tab.id ? 'true' : 'false'}
              onClick={() => props.onSelect(tab.id)}
            >
              {tab.label}
              <Show when={tab.id === 'log' && props.newErrors > 0}>
                <span class={styles.errorBadge} aria-label={`Log, ${props.newErrors} new errors`}>
                  <Icon name="alertTriangle" /> {props.newErrors}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>
      <span class={styles.spacer} />
      <div class={styles.group} aria-label="Views">
        <For each={viewTabs}>
          {(tab) => (
            <button
              type="button"
              class={styles.tab}
              aria-pressed={props.maximized === tab.id ? 'true' : 'false'}
              title={`${tab.label} (${tab.key})`}
              onClick={() => props.onView(tab.id)}
            >
              {tab.label} <span class={styles.kbd}>{tab.key}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
