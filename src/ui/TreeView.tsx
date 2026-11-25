import { For, Show, untrack } from 'solid-js';
import type { EditorApp } from '@app/index';
import type { Id, MapNode } from '@core/types/index';
import styles from './TreeView.module.css';

export interface TreeViewProps {
  readonly app: EditorApp;
  readonly version: () => number;
}

interface Row {
  readonly id: Id;
  readonly depth: number;
  readonly node: MapNode;
}

/** The document tree: worldspawn hierarchy with selection, reparent drag and group actions. */
export function TreeView(props: TreeViewProps) {
  const app = untrack(() => props.app);

  const rows = (): Row[] => {
    props.version();
    const out: Row[] = [];
    const doc = app.document;
    const walk = (id: Id, depth: number) => {
      const node = doc.nodes.get(id);
      if (!node) return;
      out.push({ id, depth, node });
      if (node.kind === 'entity' || node.kind === 'group') {
        for (const child of node.children) walk(child, depth + 1);
      }
    };
    walk(doc.worldspawn, 0);
    return out;
  };

  const label = (node: MapNode): string => {
    if (node.kind === 'brush') return 'brush';
    if (node.kind === 'group') return node.name;
    return node.props.find(([k]) => k === 'classname')?.[1] ?? 'entity';
  };

  const groupState = (node: MapNode): { hidden: boolean; locked: boolean } =>
    node.kind === 'group'
      ? { hidden: !!node.hidden, locked: !!node.locked }
      : { hidden: false, locked: false };

  let dragId: Id | null = null;

  return (
    <div class={styles.tree} data-testid="tree-view" role="tree">
      <div class={styles.actions}>
        <button
          type="button"
          class={styles.actionButton}
          data-testid="tree-group"
          onClick={() => app.groupSelection()}
        >
          Group
        </button>
        <button
          type="button"
          class={styles.actionButton}
          data-testid="tree-ungroup"
          onClick={() => app.ungroupSelection()}
        >
          Ungroup
        </button>
      </div>
      <For each={rows()}>
        {(row) => (
          <div
            role="treeitem"
            aria-selected={app.selection.has(row.id) ? 'true' : 'false'}
            class={[styles.row, app.selection.has(row.id) ? styles.rowSelected : '']}
            draggable={row.id !== app.document.worldspawn ? 'true' : 'false'}
            data-testid={`tree-row-${row.id}`}
            data-node-id={row.id}
            onClick={(e) => {
              if (e.shiftKey) {
                app.setSelection([...app.selection, row.id]);
              } else {
                app.setSelection([row.id]);
              }
            }}
            onDragStart={(e) => {
              dragId = row.id;
              e.dataTransfer?.setData('text/plain', row.id);
            }}
            onDragOver={(e) => {
              const node = row.node;
              if (node.kind === 'entity' || node.kind === 'group') e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = dragId ?? e.dataTransfer?.getData('text/plain');
              if (id && id !== row.id) app.reparentNode(id, row.id);
              dragId = null;
            }}
            ref={(el) => {
              el.style.paddingLeft = `${row.depth * 14 + 6}px`;
            }}
          >
            <span class={styles.rowLabel}>{label(row.node)}</span>
            <Show when={row.node.kind === 'group'}>
              <button
                type="button"
                class={[styles.flagButton, groupState(row.node).hidden ? styles.flagOn : '']}
                title="Hide or show the group"
                data-testid={`tree-hide-${row.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const node = row.node;
                  if (node.kind === 'group') app.setGroupFlag(row.id, 'hidden', !node.hidden);
                }}
              >
                H
              </button>
              <button
                type="button"
                class={[styles.flagButton, groupState(row.node).locked ? styles.flagOn : '']}
                title="Lock or unlock the group"
                data-testid={`tree-lock-${row.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const node = row.node;
                  if (node.kind === 'group') app.setGroupFlag(row.id, 'locked', !node.locked);
                }}
              >
                L
              </button>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
