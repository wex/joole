import { onCleanup, onSettled, Show, type Element } from 'solid-js';
import styles from './Dialog.module.css';

export interface DialogProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: Element;
  readonly testId?: string;
}

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The design-system modal dialog (T1.15): a scrim, a floating body, a trapped
 * focus, Escape closes and the opener gets the focus back. No animation.
 */
export function Dialog(props: DialogProps) {
  let body: HTMLDivElement | undefined;
  let opener: globalThis.Element | null = null;

  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key !== 'Tab' || !body) return;
    // The focus trap: Tab wraps around the dialog's focusable elements.
    const items = [...body.querySelectorAll(focusableSelector)].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute('disabled'),
    );
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !body.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !body.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  onSettled(() => {
    opener = document.activeElement;
    document.addEventListener('keydown', keyDown, true);
    // Focus the first control, or the body itself when there is none.
    const first = body?.querySelector(focusableSelector);
    if (first instanceof HTMLElement) {
      first.focus();
    } else {
      body?.focus();
    }
  });
  onCleanup(() => {
    document.removeEventListener('keydown', keyDown, true);
    if (opener instanceof HTMLElement) opener.focus();
  });

  return (
    <div class={styles.scrim} data-testid={props.testId ?? 'dialog-scrim'}>
      <div
        class={styles.body}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabindex="-1"
        ref={(el) => (body = el)}
      >
        <header class={styles.header}>
          <h2 class={styles.title}>{props.title}</h2>
          <button
            type="button"
            class={styles.close}
            aria-label="Close"
            onClick={() => props.onClose()}
          >
            ×
          </button>
        </header>
        <div class={styles.content}>{props.children}</div>
      </div>
    </div>
  );
}

/** Mount helper: renders the dialog only while `open` is true. */
export function MaybeDialog(props: DialogProps & { readonly open: boolean }) {
  return (
    <Show when={props.open}>
      <Dialog title={props.title} onClose={props.onClose} testId={props.testId}>
        {props.children}
      </Dialog>
    </Show>
  );
}
