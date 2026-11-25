import { createEffect, For } from 'solid-js';
import type { LogEntry, LogLevel } from '@app/index';
import styles from './LogPanel.module.css';

const labels: Record<LogLevel, string> = {
  info: 'Info',
  ok: 'Ok',
  warning: 'Warning',
  error: 'Error',
};

export function LogPanel(props: { entries: readonly LogEntry[] }) {
  let scroller: HTMLDivElement | undefined;
  createEffect(
    () => props.entries.length,
    () => {
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    },
  );

  return (
    <div class={styles.log} ref={(el) => (scroller = el)} data-testid="log-panel">
      <For each={props.entries}>
        {(entry) => (
          <div class={styles.row}>
            <span class={[styles.level, styles[entry.level]]}>{labels[entry.level]}:</span>
            <span>{entry.text}</span>
          </div>
        )}
      </For>
    </div>
  );
}
