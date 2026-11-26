import { Show } from 'solid-js';
import { Icon } from './Icon';
import type { IconName } from './icons';
import styles from './ToolHint.module.css';

export interface ToolHintProps {
  readonly name: string;
  readonly shortcut: string;
  readonly description: string;
  readonly icon: IconName;
}

/**
 * The tool overlay (T1.16): a translucent chip at the bottom centre of the
 * view area, shown for a few seconds after a user tool change. It never
 * blocks the views, and screen readers announce the tool.
 */
export function ToolHint(props: ToolHintProps) {
  return (
    <div class={styles.holder} aria-live="polite">
      <div class={styles.chip} data-testid="tool-hint">
        <span class={styles.icon}>
          <Icon name={props.icon} />
        </span>
        <span class={styles.name}>{props.name}</span>
        <kbd class={styles.keycap}>{props.shortcut}</kbd>
        <Show when={props.description}>
          <span class={styles.description}>{props.description}</span>
        </Show>
      </div>
    </div>
  );
}
