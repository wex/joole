import { Show, type Element } from 'solid-js';
import styles from './DockSection.module.css';
import { Icon } from './Icon';

export interface DockSectionProps {
  readonly title: string;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly children: Element;
  readonly testId?: string;
}

/** A collapsible section of the right dock: a titlebar with a disclosure button. */
export function DockSection(props: DockSectionProps) {
  return (
    <div class={styles.section} data-testid={props.testId}>
      <header class={styles.titlebar}>
        <button
          type="button"
          class={styles.disclosure}
          aria-expanded={props.collapsed ? 'false' : 'true'}
          aria-label={`${props.collapsed ? 'Expand' : 'Collapse'} ${props.title}`}
          onClick={() => props.onToggle()}
        >
          <Icon name={props.collapsed ? 'chevronRight' : 'chevronDown'} />
        </button>
        <span class={styles.title}>{props.title}</span>
      </header>
      <Show when={!props.collapsed}>
        <div class={styles.body}>{props.children}</div>
      </Show>
    </div>
  );
}
