import { For } from 'solid-js';
import type { ViewId } from '@render/index';
import styles from './PanelTabs.module.css';

export type BottomTab = 'textures' | 'tree' | 'prefabs' | 'log';

const contentTabs: readonly { id: BottomTab; label: string }[] = [
  { id: 'textures', label: 'Textures' },
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
  readonly maximized: ViewId | null;
  readonly onSelect: (tab: BottomTab) => void;
  readonly onView: (view: ViewId) => void;
}

export function PanelTabs(props: PanelTabsProps) {
  const move = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const next = props.selected === 'textures' ? 'log' : 'textures';
    props.onSelect(next);
    queueMicrotask(() => document.getElementById(`bottom-tab-${next}`)?.focus());
  };

  return (
    <div class={styles.tabs}>
      <div role="tablist" aria-label="Bottom panel" class={styles.group} onKeyDown={move}>
        <For each={contentTabs}>
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
