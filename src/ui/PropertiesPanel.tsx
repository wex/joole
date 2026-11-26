import { createEffect, createSignal, For, Show, untrack } from 'solid-js';
import type { EditorApp } from '@app/index';
import type { SurfaceState } from '@app/surfaceProps';
import styles from './PropertiesPanel.module.css';
import { EntityPanel } from './EntityPanel';

export interface PropertiesPanelProps {
  readonly app: EditorApp;
  readonly mapName: string | null;
  readonly gameOpen: boolean;
  /** Bumped by the shell on selection/document/tool events; re-reads the app. */
  readonly version: () => number;
}

function tri(
  state: SurfaceState,
  field: 'flags' | 'contents',
  bit: number,
): 'on' | 'off' | 'mixed' {
  return (field === 'flags' ? state.flags : state.contents).get(bit) ?? 'off';
}

/** The properties panel: ObjectPreview of the selection texture and the per-face surface attributes. */
export function PropertiesPanel(props: PropertiesPanelProps) {
  const app = untrack(() => props.app);
  const [thumb, setThumb] = createSignal<ImageBitmap | null>(null);
  let thumbName = '';

  const textureNames = () => {
    props.version();
    return app.selectionTextureNames();
  };

  const state = () => {
    props.version();
    return app.surfaceState();
  };

  // The texture tool's brush/face navigation (T1.6).
  const focus = () => {
    props.version();
    return app.activeTool === 'texture' ? app.textureFocus() : null;
  };

  const focusLabel = () => {
    const f = focus();
    if (!f || !f.brush) return null;
    const total = f.faces.length;
    return f.position === 0 ? `Brush (${total} faces)` : `Face ${f.position} of ${total}`;
  };

  const singleTexture = () => {
    const names = textureNames();
    return names.length === 1 ? names[0]! : null;
  };

  const walDefault = () => {
    props.version();
    const name = singleTexture();
    return name ? app.walDefaultAttribs(name) : null;
  };

  // Loads the single selection texture's bitmap for the ObjectPreview.
  createEffect(
    () => singleTexture(),
    (name) => {
      if (!name || name === thumbName) return;
      thumbName = name;
      void app.loadTexture(name).then(async (loaded) => {
        if (loaded && thumbName === name) {
          const data = new ImageData(
            new Uint8ClampedArray(loaded.rgba),
            loaded.width,
            loaded.height,
          );
          setThumb(await createImageBitmap(data));
        } else if (!loaded) {
          setThumb(null);
        }
      });
    },
  );

  const drawPreview = (canvas: HTMLCanvasElement) => {
    createEffect(
      () => thumb(),
      (bitmap) => {
        const context = canvas.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (bitmap) {
          context.imageSmoothingEnabled = false;
          const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height, 1);
          const w = bitmap.width * scale;
          const h = bitmap.height * scale;
          context.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        }
      },
    );
  };

  const differs = (field: 'flags' | 'contents', bit: number): boolean => {
    const wal = walDefault();
    const st = state();
    if (!wal || !st) return false;
    const walOn = (wal[field] & bit) !== 0;
    const bitState = tri(st, field, bit);
    return bitState !== 'off' && bitState === 'on' ? !walOn : bitState === 'off' ? walOn : true;
  };

  const flagRow = (field: 'flags' | 'contents', bit: number, label: string) => (
    <label class={styles.flag} title={differs(field, bit) ? 'Differs from the wal default' : ''}>
      <input
        type="checkbox"
        ref={(el) => {
          createEffect(
            () => state(),
            (st) => {
              const value = st ? tri(st, field, bit) : 'off';
              el.checked = value === 'on';
              el.indeterminate = value === 'mixed';
            },
          );
        }}
        onChange={() => app.toggleSurfaceBit(field, bit)}
      />
      <span class={styles.flagName}>{label}</span>
      <Show when={differs(field, bit)}>
        <span class={styles.diff} title="Differs from the wal default">
          ●
        </span>
      </Show>
    </label>
  );

  return (
    <aside class={styles.panel} aria-label="Properties" data-testid="properties-panel">
      <div class={styles.body}>
        <EntityPanel app={app} version={props.version} />
        <Show when={focus()?.brush}>
          <div class={styles.focusRow} data-testid="texture-focus">
            <button
              type="button"
              class={styles.focusButton}
              aria-label="Previous face"
              onClick={() => app.stepTextureFocus(-1)}
            >
              ◀
            </button>
            <span class={styles.focusLabel}>{focusLabel()}</span>
            <button
              type="button"
              class={styles.focusButton}
              aria-label="Next face"
              onClick={() => app.stepTextureFocus(1)}
            >
              ▶
            </button>
          </div>
        </Show>
        <span class={styles.groupLabel}>Selection</span>
        <Show
          when={textureNames().length > 0}
          fallback={<div class={styles.previewEmpty}>No selection</div>}
        >
          <div class={styles.preview} data-testid="object-preview">
            <Show
              when={singleTexture()}
              fallback={<span class={styles.multiple}>Multiple textures</span>}
            >
              {(name) => (
                <>
                  <canvas width={128} height={128} class={styles.previewCanvas} ref={drawPreview} />
                  <span class={styles.previewLabel}>{name()}</span>
                </>
              )}
            </Show>
          </div>
        </Show>
        <Show when={state()}>
          <>
            <span class={styles.groupLabel}>Surface flags</span>
            <div class={styles.flags} data-testid="surface-flags">
              <For each={app.surfaceFlagBits}>{([bit, label]) => flagRow('flags', bit, label)}</For>
            </div>
            <span class={styles.groupLabel}>Contents</span>
            <div class={styles.flags} data-testid="content-flags">
              <For each={app.contentFlagBits}>
                {([bit, label]) => flagRow('contents', bit, label)}
              </For>
            </div>
            <span class={styles.groupLabel}>Value</span>
            <input
              type="number"
              class={styles.valueInput}
              data-testid="surface-value"
              ref={(el) => {
                createEffect(
                  () => state(),
                  (st) => {
                    el.value = st && st.value !== 'mixed' ? String(st.value) : '';
                    el.placeholder = st?.value === 'mixed' ? 'mixed' : '0';
                  },
                );
              }}
              onChange={(event) => {
                const parsed = Number.parseInt(event.currentTarget.value, 10);
                if (Number.isFinite(parsed)) app.setSurfaceValue(parsed);
              }}
            />
          </>
        </Show>
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
