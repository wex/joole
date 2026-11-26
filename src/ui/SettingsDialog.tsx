import { For } from 'solid-js';
import { Dialog } from './Dialog';
import styles from './SettingsDialog.module.css';

export interface SettingsDialogValues {
  readonly theme: 'dark' | 'light';
  readonly wheelStep: number;
  readonly mouseLookSensitivity: number;
  readonly gridSize: number;
  readonly thumbSize: number;
  readonly showToolOverlay: boolean;
  readonly groupCsgResults: boolean;
}

export interface SettingsDialogProps {
  readonly values: SettingsDialogValues;
  readonly onChange: (partial: Record<string, unknown>) => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}

const gridSizes = [1, 2, 4, 8, 16, 32, 64, 128, 256];

/**
 * The Settings dialog (T1.15). Every change applies immediately and persists;
 * there is no OK/Cancel step.
 */
export function SettingsDialog(props: SettingsDialogProps) {
  return (
    <Dialog title="Settings" onClose={props.onClose} testId="settings-dialog">
      <div class={styles.form}>
        <section class={styles.group}>
          <h3 class={styles.heading}>General</h3>
          <label class={styles.row}>
            <span class={styles.label}>Theme</span>
            <select
              value={props.values.theme}
              onChange={(event) => props.onChange({ theme: event.currentTarget.value })}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
        </section>
        <section class={styles.group}>
          <h3 class={styles.heading}>Views</h3>
          <label class={styles.row}>
            <span class={styles.label}>3D wheel step</span>
            <input
              type="number"
              min="8"
              max="512"
              step="8"
              value={props.values.wheelStep}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (value >= 8 && value <= 512) props.onChange({ wheelStep: value });
              }}
            />
          </label>
          <label class={styles.row}>
            <span class={styles.label}>Mouse-look sensitivity</span>
            <input
              type="number"
              min="0.02"
              max="1"
              step="0.01"
              value={props.values.mouseLookSensitivity}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (value >= 0.02 && value <= 1) props.onChange({ mouseLookSensitivity: value });
              }}
            />
          </label>
        </section>
        <section class={styles.group}>
          <h3 class={styles.heading}>Grid</h3>
          <label class={styles.row}>
            <span class={styles.label}>Grid size at start-up</span>
            <select
              value={props.values.gridSize}
              onChange={(event) => props.onChange({ gridSize: Number(event.currentTarget.value) })}
            >
              <For each={gridSizes}>{(size) => <option value={size}>{size}</option>}</For>
            </select>
          </label>
        </section>
        <section class={styles.group}>
          <h3 class={styles.heading}>Textures</h3>
          <label class={styles.row}>
            <span class={styles.label}>Thumbnail size</span>
            <input
              type="range"
              min="32"
              max="128"
              step="16"
              value={props.values.thumbSize}
              onInput={(event) => props.onChange({ thumbSize: Number(event.currentTarget.value) })}
            />
          </label>
        </section>
        <section class={styles.group}>
          <h3 class={styles.heading}>Tools</h3>
          <label class={styles.row}>
            <span class={styles.label}>Show tool overlay</span>
            <input
              type="checkbox"
              checked={props.values.showToolOverlay}
              onChange={(event) => props.onChange({ showToolOverlay: event.currentTarget.checked })}
            />
          </label>
          <label class={styles.row}>
            <span class={styles.label}>Group CSG results</span>
            <input
              type="checkbox"
              checked={props.values.groupCsgResults}
              onChange={(event) => props.onChange({ groupCsgResults: event.currentTarget.checked })}
            />
          </label>
        </section>
        <footer class={styles.footer}>
          <button type="button" class={styles.reset} onClick={() => props.onReset()}>
            Reset to Defaults
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
