import styles from './PropertiesPanel.module.css';

export function PropertiesPanel(props: { mapName: string | null; gameOpen: boolean }) {
  return (
    <aside class={styles.panel} aria-label="Properties" data-testid="properties-panel">
      <header class={styles.titlebar}>Properties</header>
      <div class={styles.body}>
        <span class={styles.groupLabel}>Selection</span>
        <div class={styles.preview}>No selection</div>
        <span class={styles.groupLabel}>Status</span>
        <dl class={styles.status}>
          <dt>Map</dt>
          <dd>{props.mapName ?? 'None'}</dd>
          <dt>Game data</dt>
          <dd>{props.gameOpen ? 'Open' : 'Not open'}</dd>
        </dl>
      </div>
    </aside>
  );
}
