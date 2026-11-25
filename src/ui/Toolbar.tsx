import { createSignal, For, onSettled, Show } from 'solid-js';
import type { PrimitiveKind } from '@core/geom/index';
import { Icon } from './Icon';
import styles from './Toolbar.module.css';

export type ToolbarTool = 'select' | 'brush' | 'clip' | 'vertex' | 'face' | 'texture' | 'entity';

export interface ToolbarProps {
  readonly gridSize: number;
  readonly theme: 'dark' | 'light';
  readonly activeTool: ToolbarTool;
  readonly brushPrimitive: PrimitiveKind;
  readonly brushSides: number;
  readonly onOpenGameFolder: () => void;
  readonly onOpenSinglePak: () => void;
  readonly onOpenMap: () => void;
  readonly onExportMap: () => void;
  readonly onCsgSubtract: () => void;
  readonly onCsgIntersect: () => void;
  readonly onHollow: (direction: 'inward' | 'outward') => void;
  readonly onFlip: (axis: 0 | 1 | 2) => void;
  readonly onMirror: (axis: 0 | 1 | 2) => void;
  readonly onRotate90: () => void;
  readonly onApplyTexture: () => void;
  readonly onFitTexture: () => void;
  readonly onResetTexture: () => void;
  readonly onJustifyTexture: (edge: 'left' | 'right' | 'top' | 'bottom') => void;
  readonly onGridSize: (size: number) => void;
  readonly textureLock: boolean;
  readonly onToggleTheme: () => void;
  readonly onToggleTextureLock: () => void;
  readonly onTool: (tool: ToolbarTool) => void;
  readonly onBrushPrimitive: (kind: PrimitiveKind, sides: number) => void;
}

function tool(
  id: string,
  label: string,
  icon: Parameters<typeof Icon>[0]['name'],
  enabled = false,
) {
  return { id, label, icon, enabled };
}

const tools = [
  tool('select', 'Select (S)', 'mousePointer', true),
  tool('brush', 'Brush (B)', 'box', true),
  tool('entity', 'Entity (E)', 'circleUser', true),
  tool('clip', 'Clip (C)', 'clip', true),
  tool('vertex', 'Vertex/edge (V)', 'move', true),
  tool('face', 'Face (F)', 'scan', true),
  tool('texture', 'Texture (T)', 'brush', true),
];

const primitives: PrimitiveKind[] = ['box', 'wedge', 'cylinder', 'cone', 'sphere'];

export function Toolbar(props: ToolbarProps) {
  const [fileOpen, setFileOpen] = createSignal(false);
  const [editOpen, setEditOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;

  onSettled(() => {
    const close = (event: PointerEvent) => {
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setFileOpen(false);
        setEditOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFileOpen(false);
        setEditOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  });

  const choose = (action: () => void) => {
    setFileOpen(false);
    setEditOpen(false);
    action();
  };
  const gridPower = () => Math.round(Math.log2(props.gridSize));
  const setGridPower = (power: number) => props.onGridSize(2 ** power);

  return (
    <div class={styles.toolbar} ref={(el) => (root = el)}>
      <div class={styles.menuHolder}>
        <button
          type="button"
          class={styles.menuButton}
          aria-haspopup="menu"
          aria-expanded={fileOpen() ? 'true' : 'false'}
          onClick={() => {
            setEditOpen(false);
            setFileOpen(!fileOpen());
          }}
        >
          File <Icon name="chevronDown" />
        </button>
        <Show when={fileOpen()}>
          <ul class={styles.menu} role="menu">
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(props.onOpenGameFolder)}>
                Open Game Folder…
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(props.onOpenSinglePak)}>
                Open pak0.pak…
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(props.onOpenMap)}>
                Open Map…
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(props.onExportMap)}>
                Export .map…
              </button>
            </li>
          </ul>
        </Show>
      </div>
      <div class={styles.menuHolder}>
        <button
          type="button"
          class={styles.menuButton}
          aria-haspopup="menu"
          aria-expanded={editOpen() ? 'true' : 'false'}
          onClick={() => {
            setFileOpen(false);
            setEditOpen(!editOpen());
          }}
        >
          Edit <Icon name="chevronDown" />
        </button>
        <Show when={editOpen()}>
          <ul class={styles.menu} role="menu">
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(props.onCsgSubtract)}>
                CSG Subtract
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(props.onCsgIntersect)}>
                CSG Intersect
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => choose(() => props.onHollow('inward'))}
              >
                Hollow Inward
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => choose(() => props.onHollow('outward'))}
              >
                Hollow Outward
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(() => props.onFlip(0))}>
                Flip X
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(() => props.onFlip(1))}>
                Flip Y
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(() => props.onFlip(2))}>
                Flip Z
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(() => props.onMirror(0))}>
                Mirror X
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(() => props.onMirror(1))}>
                Mirror Y
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(() => props.onMirror(2))}>
                Mirror Z
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(props.onRotate90)}>
                Rotate 90°
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(props.onApplyTexture)}>
                Apply Texture
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(props.onFitTexture)}>
                Fit Texture
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => choose(() => props.onJustifyTexture('left'))}
              >
                Justify Left
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => choose(() => props.onJustifyTexture('right'))}
              >
                Justify Right
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => choose(() => props.onJustifyTexture('top'))}
              >
                Justify Top
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => choose(() => props.onJustifyTexture('bottom'))}
              >
                Justify Bottom
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={() => choose(props.onResetTexture)}>
                Reset Texture
              </button>
            </li>
          </ul>
        </Show>
      </div>
      <button type="button" class={styles.iconButton} title="Save" disabled>
        <Icon name="save" />
      </button>
      <span class={styles.separator} />
      <button type="button" class={styles.iconButton} title="Undo" disabled>
        <Icon name="undo" />
      </button>
      <button type="button" class={styles.iconButton} title="Redo" disabled>
        <Icon name="redo" />
      </button>
      <span class={styles.separator} />
      <For each={tools}>
        {(item) => (
          <button
            type="button"
            class={styles.iconButton}
            title={item.label}
            aria-label={item.label}
            aria-pressed={props.activeTool === item.id ? 'true' : 'false'}
            disabled={!item.enabled}
            onClick={() => {
              if (
                item.id === 'select' ||
                item.id === 'brush' ||
                item.id === 'clip' ||
                item.id === 'vertex' ||
                item.id === 'face'
              )
                props.onTool(item.id);
            }}
          >
            <Icon name={item.icon} />
          </button>
        )}
      </For>
      <Show when={props.activeTool === 'brush'}>
        <label class={styles.primitiveControl}>
          <span>Primitive</span>
          <select
            aria-label="Brush primitive"
            value={props.brushPrimitive}
            onChange={(event) =>
              props.onBrushPrimitive(event.currentTarget.value as PrimitiveKind, props.brushSides)
            }
          >
            <For each={primitives}>{(kind) => <option value={kind}>{kind}</option>}</For>
          </select>
        </label>
        <label class={styles.primitiveControl}>
          <span>Sides</span>
          <input
            type="number"
            min="3"
            max="64"
            value={props.brushSides}
            aria-label="Primitive sides"
            onChange={(event) =>
              props.onBrushPrimitive(props.brushPrimitive, Number(event.currentTarget.value))
            }
          />
        </label>
      </Show>
      <span class={styles.separator} />
      <button
        type="button"
        class={styles.iconButton}
        title="CSG Subtract"
        aria-label="CSG Subtract"
        onClick={() => props.onCsgSubtract()}
      >
        <Icon name="csgSubtract" />
      </button>
      <button
        type="button"
        class={styles.iconButton}
        title="Hollow"
        aria-label="Hollow"
        onClick={() => props.onHollow('inward')}
      >
        <Icon name="hollow" />
      </button>
      <span class={styles.separator} />
      <span class={styles.gridControl}>
        <Icon name="grid" />
        <input
          type="range"
          min="0"
          max="8"
          step="1"
          value={gridPower()}
          aria-label="Grid size"
          onInput={(event) => setGridPower(Number(event.currentTarget.value))}
        />
        <output>{`Grid ${props.gridSize}`}</output>
      </span>
      <button
        type="button"
        class={styles.iconButton}
        title="Texture lock"
        aria-label="Texture lock"
        aria-pressed={props.textureLock ? 'true' : 'false'}
        onClick={() => props.onToggleTextureLock()}
      >
        <Icon name="lock" />
      </button>
      <span class={styles.spacer} />
      <button
        type="button"
        class={styles.iconButton}
        title={props.theme === 'dark' ? 'Use Light Theme' : 'Use Dark Theme'}
        aria-label={props.theme === 'dark' ? 'Use Light Theme' : 'Use Dark Theme'}
        onClick={() => props.onToggleTheme()}
      >
        <Icon name="sunMoon" />
      </button>
      <button type="button" class={styles.compileButton} disabled>
        <Icon name="play" /> Compile
      </button>
    </div>
  );
}
