import { createSignal, onSettled, untrack } from 'solid-js';
import styles from './SizeInput.module.css';

export interface SizeInputProps {
  /** The field's centre in CSS pixels relative to the views element. */
  readonly x: number;
  readonly y: number;
  /** The bounds the field is clamped into, in the same coordinates. */
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly initial: string;
  readonly placeholder: string;
  /** Applies the text; returns an error message to keep the field open. */
  readonly onSubmit: (text: string) => string | null;
  readonly onCancel: () => void;
}

const WIDTH = 168;
const HEIGHT = 26;

/**
 * The inline brush size field (T15.4): "width height depth" of the view.
 * Enter applies, Escape and blur cancel; an invalid value keeps the field
 * open with its message.
 */
export function SizeInput(props: SizeInputProps) {
  const [error, setError] = createSignal<string | null>(null);
  let input: HTMLInputElement | undefined;
  let closed = false;
  onSettled(() => {
    input?.focus();
    input?.select();
  });
  const position = () => {
    const b = props.bounds;
    const left = Math.min(Math.max(props.x - WIDTH / 2, b.x + 4), b.x + b.width - WIDTH - 4);
    const top = Math.min(Math.max(props.y - HEIGHT / 2, b.y + 4), b.y + b.height - HEIGHT - 24);
    return { left: `${left}px`, top: `${top}px` };
  };
  const cancel = () => {
    if (closed) return;
    closed = true;
    props.onCancel();
  };
  return (
    <div class={styles.holder} style={position()} data-testid="size-input">
      <input
        ref={(el) => {
          // The initial text is set once: a value prop would be re-applied
          // when aria-invalid changes and wipe what the user typed.
          el.value = untrack(() => props.initial);
          input = el;
        }}
        class={styles.input}
        type="text"
        inputmode="decimal"
        spellcheck="false"
        autocomplete="off"
        placeholder={props.placeholder}
        aria-label="Brush size, width height depth"
        aria-invalid={error() ? 'true' : 'false'}
        aria-describedby={error() ? 'size-input-error' : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            const message = props.onSubmit(event.currentTarget.value);
            if (message) {
              setError(message);
            } else {
              closed = true;
            }
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
        }}
        onInput={() => setError(null)}
        onBlur={cancel}
      />
      {error() && (
        <div id="size-input-error" class={styles.error} role="alert">
          {error()}
        </div>
      )}
    </div>
  );
}
