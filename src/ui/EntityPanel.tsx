import { createSignal, For, Show, untrack } from 'solid-js';
import type { EditorApp } from '@app/index';
import styles from './EntityPanel.module.css';

export interface EntityPanelProps {
  readonly app: EditorApp;
  /** Bumped by the shell on selection/document events; re-reads the app. */
  readonly version: () => number;
}

/** Parses a Quake "r g b" colour (0..1 floats) into a css hex colour. */
function rgbToHex(value: string): string {
  const parts = value.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((c) => !Number.isFinite(c))) return '#ffffff';
  const hex = (c: number) =>
    Math.round(Math.max(0, Math.min(1, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(parts[0]!)}${hex(parts[1]!)}${hex(parts[2]!)}`;
}

function hexToRgb(hex: string): string {
  const c = (i: number) =>
    (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${c(1)} ${c(3)} ${c(5)}`;
}

/** The entity properties form, generated from the definitions (design system EntityProperties). */
export function EntityPanel(props: EntityPanelProps) {
  const app = untrack(() => props.app);
  const state = () => {
    props.version();
    return app.entityPanel();
  };

  const [newKey, setNewKey] = createSignal('');

  const commitKey = (key: string, value: string) => {
    const id = state().entityId;
    if (id) app.setEntityProp(id, key, value);
  };

  /** The angle compass: eight directions as a dial plus the numeric value. */
  const angleCompass = (value: string) => {
    const current = () => ((Number(value) % 360) + 360) % 360;
    const dir = (deg: number) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return { x: 50 + Math.cos(rad) * 38, y: 50 + Math.sin(rad) * 38 };
    };
    return (
      <span class={styles.compassRow}>
        <svg class={styles.compass} viewBox="0 0 100 100" aria-label="Angle compass">
          <circle cx="50" cy="50" r="44" class={styles.compassRing} />
          <For each={[0, 45, 90, 135, 180, 225, 270, 315]}>
            {(deg) => {
              const p = dir(deg);
              return (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={current() === deg ? 7 : 5}
                  class={current() === deg ? styles.compassDotActive : styles.compassDot}
                  onClick={() => commitKey('angle', String(deg))}
                />
              );
            }}
          </For>
        </svg>
        <input
          class={styles.valueInput}
          type="text"
          value={value}
          data-testid="angle-input"
          onChange={(e) => commitKey('angle', e.currentTarget.value)}
        />
      </span>
    );
  };

  const valueEditor = (key: string, type: string, value: string, defaultValue?: string) => {
    const effective = value || defaultValue || '';
    if (type === 'angle') return angleCompass(effective);
    if (type === 'color') {
      return (
        <span class={styles.colorRow}>
          <input
            type="color"
            class={styles.colorInput}
            value={rgbToHex(effective)}
            onChange={(e) => commitKey(key, hexToRgb(e.currentTarget.value))}
          />
          <input
            class={styles.valueInput}
            type="text"
            value={value}
            placeholder={defaultValue ?? ''}
            data-testid={`key-input-${key}`}
            onChange={(e) => commitKey(key, e.currentTarget.value)}
          />
        </span>
      );
    }
    if (type === 'target') {
      return (
        <span class={styles.colorRow}>
          <input
            class={styles.valueInput}
            type="text"
            list="joole-targetnames"
            value={value}
            placeholder={defaultValue ?? ''}
            data-testid={`key-target-input`}
            onChange={(e) => commitKey(key, e.currentTarget.value)}
          />
        </span>
      );
    }
    return (
      <input
        class={styles.valueInput}
        type="text"
        value={value}
        placeholder={defaultValue ?? ''}
        data-testid={`key-input-${key}`}
        onChange={(e) => commitKey(key, e.currentTarget.value)}
      />
    );
  };

  return (
    <Show when={state().entityId}>
      <div class={styles.entity} data-testid="entity-panel">
        <span class={styles.groupLabel}>Entity</span>
        <Show when={!state().worldspawn}>
          <label class={styles.row}>
            <span class={styles.rowLabel}>Category</span>
            <select
              class={styles.select}
              data-testid="entity-category"
              value={state().category}
              onChange={(e) => {
                const category = e.currentTarget.value;
                const first = app
                  .entityDefs()
                  .filter(
                    (d) =>
                      d.className !== 'worldspawn' &&
                      (d.className.includes('_') ? d.className.split('_')[0] : 'misc') === category,
                  )[0];
                const id = state().entityId;
                if (first && id) app.setEntityClass(id, first.className);
              }}
            >
              <For each={state().categories}>
                {(category) => <option value={category}>{category}</option>}
              </For>
            </select>
          </label>
          <label class={styles.row}>
            <span class={styles.rowLabel}>Class</span>
            <select
              class={styles.select}
              data-testid="entity-class"
              value={state().classname}
              onChange={(e) => {
                const id = state().entityId;
                if (id) app.setEntityClass(id, e.currentTarget.value);
              }}
            >
              <For each={state().categoryClasses}>
                {(classname) => <option value={classname}>{classname}</option>}
              </For>
              <Show
                when={
                  state().classname !== '' && !state().categoryClasses.includes(state().classname)
                }
              >
                <option value={state().classname}>{state().classname}</option>
              </Show>
            </select>
          </label>
        </Show>
        <Show when={state().spawnflags.length > 0}>
          <span class={styles.groupLabel}>Spawnflags</span>
          <div class={styles.flags}>
            <For each={state().spawnflags}>
              {(flag) => (
                <label class={styles.flag} title={flag.name}>
                  <input
                    type="checkbox"
                    checked={flag.checked}
                    data-testid={`spawnflag-${flag.name}`}
                    onChange={() => {
                      const id = state().entityId;
                      if (id) app.toggleSpawnflag(id, flag.bit);
                    }}
                  />
                  <span class={styles.flagName}>{flag.name.toUpperCase()}</span>
                </label>
              )}
            </For>
          </div>
        </Show>
        <span class={styles.groupLabel}>Keys</span>
        <datalist id="joole-targetnames">
          <For each={state().targetnames}>{(name) => <option value={name} />}</For>
        </datalist>
        <table class={styles.keys}>
          <tbody>
            <For each={state().keys}>
              {(row) => (
                <tr class={row.present ? undefined : styles.absentRow}>
                  <td
                    class={styles.keyCell}
                    title={
                      row.description + (row.defaultValue ? ` (default: ${row.defaultValue})` : '')
                    }
                  >
                    {row.key}
                  </td>
                  <td class={styles.valueCell}>
                    {valueEditor(row.key, row.type, row.value, row.defaultValue)}
                  </td>
                </tr>
              )}
            </For>
            <tr>
              <td class={styles.keyCell}>
                <input
                  class={styles.keyInput}
                  type="text"
                  placeholder="(new key)"
                  data-testid="new-key-input"
                  value={newKey()}
                  onInput={(e) => setNewKey(e.currentTarget.value)}
                />
              </td>
              <td class={styles.valueCell}>
                <input
                  class={styles.valueInput}
                  type="text"
                  data-testid="new-key-value"
                  onChange={(e) => {
                    const key = newKey().trim();
                    if (!/^[A-Za-z0-9_]+$/.test(key)) return;
                    commitKey(key, e.currentTarget.value);
                    setNewKey('');
                    e.currentTarget.value = '';
                  }}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Show>
  );
}
