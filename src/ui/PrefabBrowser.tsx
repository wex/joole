import { createSignal, For, onSettled, Show, untrack } from 'solid-js';
import type { EditorApp } from '@app/index';
import styles from './TreeView.module.css';

export interface PrefabBrowserProps {
  readonly app: EditorApp;
  readonly version: () => number;
}

/** The prefab library: save the selection, drag entries into a 2D view to place them. */
export function PrefabBrowser(props: PrefabBrowserProps) {
  const app = untrack(() => props.app);
  const [entries, setEntries] = createSignal<readonly { name: string; savedAt: number }[]>([]);
  const [name, setName] = createSignal('');

  const refresh = async () => {
    setEntries(await app.listPrefabs());
  };

  // Reload whenever the app reports a change (prefab save and delete emit one).
  const track = () => {
    props.version();
    return entries();
  };

  onSettled(() => {
    const unsubscribe = app.subscribe(() => void refresh());
    void refresh();
    return unsubscribe;
  });

  return (
    <div class={styles.tree} data-testid="prefab-browser">
      <div class={styles.actions}>
        <input
          type="text"
          placeholder="Prefab name"
          value={name()}
          data-testid="prefab-name"
          onInput={(e) => setName(e.currentTarget.value)}
          style={{ 'flex-grow': '1' }}
        />
        <button
          type="button"
          class={styles.actionButton}
          data-testid="prefab-save"
          onClick={async () => {
            const trimmed = name().trim();
            if (!trimmed) return;
            await app.savePrefab(trimmed);
            setName('');
            await refresh();
          }}
        >
          Save
        </button>
      </div>
      <Show when={track().length === 0}>
        <div style={{ padding: '8px', color: 'var(--ink-muted)' }} data-testid="prefab-empty">
          Select brushes and save them as a prefab.
        </div>
      </Show>
      <For each={track()}>
        {(entry) => (
          <div
            class={styles.row}
            draggable="true"
            data-testid={`prefab-${entry.name}`}
            data-prefab-name={entry.name}
            onDragStart={(e) => {
              e.dataTransfer?.setData('application/x-joole-prefab', entry.name);
              e.dataTransfer?.setData('text/plain', entry.name);
            }}
          >
            <span class={styles.rowLabel}>{entry.name}</span>
            <button
              type="button"
              class={styles.flagButton}
              title="Insert at the origin"
              data-testid={`prefab-insert-${entry.name}`}
              onClick={() => void app.insertPrefab(entry.name)}
            >
              +
            </button>
            <button
              type="button"
              class={styles.flagButton}
              title="Delete the prefab"
              data-testid={`prefab-delete-${entry.name}`}
              onClick={async () => {
                await app.deletePrefab(entry.name);
                await refresh();
              }}
            >
              ×
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
