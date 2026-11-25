import { createEffect } from 'solid-js';
import type { IconName } from './icons';
import { icons } from './icons';
import styles from './Icon.module.css';

export function Icon(props: { name: IconName }) {
  let element: HTMLSpanElement | undefined;
  createEffect(
    () => props.name,
    (name) => {
      if (element) {
        element.innerHTML = icons[name];
      }
    },
  );
  return <span class={styles.icon} aria-hidden="true" ref={(el) => (element = el)} />;
}
