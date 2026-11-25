import { createSignal, For, onSettled, Show, untrack } from 'solid-js';
import type { EditorApp, LogEntry, ToolPointerEvent } from '@app/index';
import { shortcutAction } from '@app/index';
import type { OrthoCamera, PerspectiveCamera, Renderer, ViewId, ViewRect } from '@render/index';
import { VIEW_ORDER } from '@render/index';
import {
  CameraController,
  lookPerspective,
  movePerspective,
  orthoCoordinates,
  orthoWorldPoint,
  panOrtho,
  perspectiveRayDirection,
  WHEEL_ZOOM_STEP,
  zoomOrthoAt,
} from './cameras';
import { Icon } from './Icon';
import { LogPanel } from './LogPanel';
import { PanelTabs, type BottomTab } from './PanelTabs';
import { PropertiesPanel } from './PropertiesPanel';
import { Toolbar } from './Toolbar';
import styles from './EditorShell.module.css';

export interface EditorShellProps {
  readonly app: EditorApp;
  readonly renderer: Renderer;
  readonly canvas: HTMLCanvasElement;
}

const viewLabels: Record<ViewId, string> = {
  '3d': '3D',
  top: 'Top',
  front: 'Front',
  side: 'Side',
};
const viewAxes: Record<Exclude<ViewId, '3d'>, string> = {
  top: 'X, Y',
  front: 'X, Z',
  side: 'Y, Z',
};
const functionKeys: Record<string, ViewId> = {
  F1: '3d',
  F2: 'top',
  F3: 'front',
  F4: 'side',
};

const initialRightWidth = 224;
const initialBottomHeight = 160;
const minRightWidth = 168;
const maxRightWidth = 480;
const minBottomHeight = 88;
const maxBottomHeight = 420;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function coordinateDefaults(fly: boolean): Record<ViewId, string> {
  return {
    '3d': fly ? 'Fly' : 'Textured',
    top: viewAxes.top,
    front: viewAxes.front,
    side: viewAxes.side,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

interface HitView {
  readonly view: ViewId;
  readonly rect: ViewRect;
  readonly point: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly ratio: number;
}

export function EditorShell(props: EditorShellProps) {
  const app = untrack(() => props.app);
  const renderer = untrack(() => props.renderer);
  const canvasElement = untrack(() => props.canvas);
  const [mapName, setMapName] = createSignal(app.mapName);
  const [gameOpen, setGameOpen] = createSignal(app.gameOpen);
  const [textureCount, setTextureCount] = createSignal(app.textureCount);
  const [gridSize, setGridSize] = createSignal(app.gridSize);
  const [entries, setEntries] = createSignal<readonly LogEntry[]>(app.logEntries());
  const [activeView, setActiveView] = createSignal<ViewId>('3d');
  const [maximizedView, setMaximizedView] = createSignal<ViewId | null>(null);
  const [bottomTab, setBottomTab] = createSignal<BottomTab>('textures');
  const [theme, setTheme] = createSignal<'dark' | 'light'>('dark');
  const [coordinates, setCoordinates] = createSignal(coordinateDefaults(false));
  const [rightWidth, setRightWidth] = createSignal(initialRightWidth);
  const [bottomHeight, setBottomHeight] = createSignal(initialBottomHeight);
  const [viewMenu, setViewMenu] = createSignal<{
    x: number;
    y: number;
    point: [number, number, number];
  } | null>(null);
  const [activeTool, setActiveTool] = createSignal(app.activeTool);
  const [brushPrimitive, setBrushPrimitive] = createSignal(app.brushPrimitive);
  const [brushSides, setBrushSides] = createSignal(app.brushSides);
  const [recoveryAvailable, setRecoveryAvailable] = createSignal(app.recoveryProject !== null);

  let viewportElement: HTMLDivElement | undefined;
  let mainElement: HTMLDivElement | undefined;
  let centerElement: HTMLDivElement | undefined;
  let gameInput: HTMLInputElement | undefined;
  let pakInput: HTMLInputElement | undefined;
  let mapInput: HTMLInputElement | undefined;

  const controller = new CameraController((view, camera) => {
    renderer.setCamera(view, camera);
  });

  const setPanelWidth = (width: number) => {
    const next = clamp(Math.round(width), minRightWidth, maxRightWidth);
    setRightWidth(next);
    mainElement?.style.setProperty('--right-panel-width', `${next}px`);
  };
  const setPanelHeight = (height: number) => {
    const next = clamp(Math.round(height), minBottomHeight, maxBottomHeight);
    setBottomHeight(next);
    centerElement?.style.setProperty('--bottom-panel-height', `${next}px`);
  };

  const hitView = (clientX: number, clientY: number): HitView | null => {
    const bounds = canvasElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const x = (clientX - bounds.left) * ratio;
    const y = (clientY - bounds.top) * ratio;
    for (const [view, rect] of props.renderer.viewRects()) {
      if (x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height) {
        return {
          view,
          rect,
          point: { x: (x - rect.x) / ratio, y: (y - rect.y) / ratio },
          size: { width: rect.width / ratio, height: rect.height / ratio },
          ratio,
        };
      }
    }
    return null;
  };

  const orthoCamera = (view: ViewId): OrthoCamera | null => {
    const camera = controller.get(view);
    return camera.kind === 'ortho' ? camera : null;
  };
  const perspectiveCamera = (): PerspectiveCamera | null => {
    const camera = controller.get('3d');
    return camera.kind === 'perspective' ? camera : null;
  };

  const toggleMaximized = (view: ViewId) => {
    const next = maximizedView() === view ? null : view;
    setMaximizedView(next);
    setActiveView(view);
    renderer.setMaximized(next);
  };

  const chooseGameFolder = () => {
    if (app.canPickGameFolder) {
      void app.openGameFolder();
    } else {
      gameInput?.click();
    }
  };
  const chooseMap = () => {
    if (app.canPickMapFile) {
      void app.openMapPicker();
    } else {
      mapInput?.click();
    }
  };

  const toggleTheme = () => {
    const next = theme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    renderer.refreshColors();
  };

  const stepGrid = (direction: -1 | 1) => {
    const power = clamp(Math.round(Math.log2(app.gridSize)) + direction, 0, 8);
    props.app.setGridSize(2 ** power);
  };

  const beginSplitterDrag = (event: PointerEvent, orientation: 'vertical' | 'horizontal'): void => {
    event.preventDefault();
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    target.setPointerCapture(event.pointerId);
    const startPosition = orientation === 'vertical' ? event.clientX : event.clientY;
    const startSize = orientation === 'vertical' ? rightWidth() : bottomHeight();
    const move = (moveEvent: PointerEvent) => {
      const position = orientation === 'vertical' ? moveEvent.clientX : moveEvent.clientY;
      const delta = position - startPosition;
      if (orientation === 'vertical') {
        setPanelWidth(startSize - delta);
      } else {
        setPanelHeight(startSize - delta);
      }
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  const splitterKey = (event: KeyboardEvent, orientation: 'vertical' | 'horizontal'): void => {
    const step = 8;
    if (orientation === 'vertical' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      setPanelWidth(rightWidth() + (event.key === 'ArrowLeft' ? step : -step));
    }
    if (orientation === 'horizontal' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      setPanelHeight(bottomHeight() + (event.key === 'ArrowUp' ? step : -step));
    }
  };

  onSettled(() => {
    const viewport = viewportElement;
    if (!viewport) {
      return;
    }
    const canvas = canvasElement;
    let pan: {
      pointerId: number;
      view: ViewId;
      lastX: number;
      lastY: number;
    } | null = null;
    let toolPointer: { readonly pointerId: number; readonly view: ViewId } | null = null;
    let rightFly = false;
    let pointerLocked = false;
    let frame: number | null = null;
    let lastFrameTime = 0;
    const flyKeys = new Set<string>();

    const updateCursor = (clientX: number, clientY: number) => {
      const hit = hitView(clientX, clientY);
      const next = coordinateDefaults(pointerLocked || rightFly);
      if (hit && hit.view !== '3d') {
        const camera = orthoCamera(hit.view);
        if (camera) {
          const coords = orthoCoordinates(camera, hit.point, hit.size, hit.ratio);
          next[hit.view] =
            `${coords.labels[0]}, ${coords.labels[1]}: ${Math.round(coords.values[0]!)}, ${Math.round(coords.values[1]!)}`;
        }
      }
      setCoordinates(next);
    };

    const stopMovement = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    };
    const tick = (now: number) => {
      frame = null;
      const camera = perspectiveCamera();
      if (!camera || (!pointerLocked && !rightFly) || flyKeys.size === 0) {
        return;
      }
      const seconds = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
      lastFrameTime = now;
      const moved = movePerspective(camera, flyKeys, seconds);
      if (moved !== camera) {
        controller.setCamera('3d', moved);
      }
      frame = requestAnimationFrame(tick);
    };
    const ensureMovement = () => {
      if (frame === null && flyKeys.size > 0 && (pointerLocked || rightFly)) {
        lastFrameTime = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const updateFlyState = () => {
      const active = pointerLocked || rightFly;
      setCoordinates(coordinateDefaults(active));
      if (!active) {
        flyKeys.clear();
        stopMovement();
      } else {
        ensureMovement();
      }
    };

    const toolEvent = (
      hit: HitView,
      type: 'down' | 'move' | 'up',
      event: PointerEvent,
    ): ToolPointerEvent => {
      if (hit.view === '3d') {
        const camera = perspectiveCamera();
        return {
          type,
          button: event.button,
          view: '3d' as const,
          point: camera?.position ?? [0, 0, 0],
          direction: camera ? perspectiveRayDirection(camera, hit.point, hit.size) : [1, 0, 0],
          tolerance: 4,
          shift: event.shiftKey,
          ctrl: event.ctrlKey || event.metaKey,
        };
      }
      const camera = orthoCamera(hit.view);
      const axis =
        hit.view === 'top'
          ? ('xy' as const)
          : hit.view === 'front'
            ? ('xz' as const)
            : ('yz' as const);
      return {
        type,
        button: event.button,
        view: axis,
        point: camera ? orthoWorldPoint(camera, hit.point, hit.size, hit.ratio) : [0, 0, 0],
        tolerance: camera ? (4 * hit.ratio) / camera.zoom : 4,
        shift: event.shiftKey,
        ctrl: event.ctrlKey || event.metaKey,
      };
    };

    const sendToolEvent = (type: 'down' | 'move' | 'up', event: PointerEvent) => {
      const hit = hitView(event.clientX, event.clientY);
      if (!hit || (toolPointer && hit.view !== toolPointer.view)) {
        return false;
      }
      const output = app.selectPointer(toolEvent(hit, type, event));
      renderer.setToolPreview(output.preview ?? [], output.invalid ?? []);
      return true;
    };

    const pointerDown = (event: PointerEvent) => {
      const hit = hitView(event.clientX, event.clientY);
      if (!hit) {
        return;
      }
      setActiveView(hit.view);
      viewport.focus();
      if (event.button === 0) {
        setViewMenu(null);
        toolPointer = { pointerId: event.pointerId, view: hit.view };
        viewport.setPointerCapture(event.pointerId);
        sendToolEvent('down', event);
        event.preventDefault();
        return;
      }
      if (hit.view !== '3d' && event.button === 1) {
        pan = {
          pointerId: event.pointerId,
          view: hit.view,
          lastX: event.clientX,
          lastY: event.clientY,
        };
        viewport.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
      if (hit.view === '3d' && event.button === 1) {
        event.preventDefault();
        if (document.pointerLockElement === canvas) {
          document.exitPointerLock();
        } else {
          try {
            const request = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            void request?.catch(() => {
              app.log(
                'warning',
                'Pointer lock failed. Hold the right mouse button to fly instead.',
              );
            });
          } catch {
            app.log('warning', 'Pointer lock failed. Hold the right mouse button to fly instead.');
          }
        }
        return;
      }
      if (hit.view === '3d' && event.button === 2) {
        rightFly = true;
        viewport.setPointerCapture(event.pointerId);
        updateFlyState();
        event.preventDefault();
      }
    };

    const pointerMove = (event: PointerEvent) => {
      if (toolPointer && event.pointerId === toolPointer.pointerId) {
        sendToolEvent('move', event);
        event.preventDefault();
        return;
      }
      if (pan && event.pointerId === pan.pointerId) {
        const camera = orthoCamera(pan.view);
        if (camera) {
          controller.setCamera(
            pan.view,
            panOrtho(
              camera,
              event.clientX - pan.lastX,
              event.clientY - pan.lastY,
              window.devicePixelRatio || 1,
            ),
          );
        }
        pan = { ...pan, lastX: event.clientX, lastY: event.clientY };
      }
      if ((pointerLocked || rightFly) && (event.movementX !== 0 || event.movementY !== 0)) {
        const camera = perspectiveCamera();
        if (camera) {
          controller.setCamera('3d', lookPerspective(camera, event.movementX, event.movementY));
        }
      }
      if (!pointerLocked) {
        updateCursor(event.clientX, event.clientY);
      }
    };

    const pointerEnd = (event: PointerEvent) => {
      if (toolPointer && event.pointerId === toolPointer.pointerId) {
        sendToolEvent('up', event);
        toolPointer = null;
        event.preventDefault();
        return;
      }
      if (pan && event.pointerId === pan.pointerId) {
        pan = null;
      }
      if (event.button === 2 && rightFly) {
        rightFly = false;
        updateFlyState();
      }
    };

    const wheel = (event: WheelEvent) => {
      const hit = hitView(event.clientX, event.clientY);
      if (!hit || hit.view === '3d') {
        return;
      }
      const camera = orthoCamera(hit.view);
      if (!camera) {
        return;
      }
      event.preventDefault();
      const factor = WHEEL_ZOOM_STEP ** (-event.deltaY / 120);
      controller.setCamera(hit.view, zoomOrthoAt(camera, hit.point, hit.size, hit.ratio, factor));
      updateCursor(event.clientX, event.clientY);
    };

    const pointerLockChange = () => {
      pointerLocked = document.pointerLockElement === canvas;
      updateFlyState();
    };
    const contextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const hit = hitView(event.clientX, event.clientY);
      if (!hit || hit.view === '3d') {
        setViewMenu(null);
        return;
      }
      const camera = orthoCamera(hit.view);
      if (!camera) {
        setViewMenu(null);
        return;
      }
      const bounds = viewport.getBoundingClientRect();
      setViewMenu({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        point: orthoWorldPoint(camera, hit.point, hit.size, hit.ratio),
      });
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setViewMenu(null);
      }
      const maximized = functionKeys[event.key];
      if (maximized) {
        event.preventDefault();
        toggleMaximized(maximized);
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (
        app.activeTool === 'clip' &&
        (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') &&
        !(pointerLocked || rightFly)
      ) {
        event.preventDefault();
        const output = app.clipKey(event.key);
        renderer.setToolPreview(output.preview ?? [], output.invalid ?? []);
        return;
      }
      const action = shortcutAction({
        key: event.key,
        ctrl: event.ctrlKey || event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
      });
      if (action === 'undo' || action === 'redo') {
        event.preventDefault();
        if (action === 'undo') {
          app.undo();
        } else {
          app.redo();
        }
        return;
      }
      if (action === 'save') {
        event.preventDefault();
        void app.saveProject();
        return;
      }
      if (action === 'copy' || action === 'cut' || action === 'paste' || action === 'duplicate') {
        event.preventDefault();
        if (action === 'copy') void app.copySelection();
        if (action === 'cut') void app.cutSelection();
        if (action === 'paste') void app.pasteClipboard();
        if (action === 'duplicate') app.duplicateSelection();
        return;
      }
      if (action === 'grid-down' || action === 'grid-up') {
        event.preventDefault();
        stepGrid(action === 'grid-down' ? -1 : 1);
        return;
      }
      if (
        (action === 'tool-select' ||
          action === 'tool-brush' ||
          action === 'tool-clip' ||
          action === 'tool-vertex-edge' ||
          action === 'tool-face') &&
        !(pointerLocked || rightFly)
      ) {
        event.preventDefault();
        app.setToolMode(
          action === 'tool-select'
            ? 'select'
            : action === 'tool-brush'
              ? 'brush'
              : action === 'tool-clip'
                ? 'clip'
                : action === 'tool-vertex-edge'
                  ? 'vertex'
                  : 'face',
        );
        return;
      }
      if (action && action.startsWith('tool-') && !(pointerLocked || rightFly)) {
        event.preventDefault();
        return;
      }
      if (action) {
        // Commands whose work packages have not arrived yet are still
        // captured here so the browser never performs its own Ctrl/Cmd action.
        event.preventDefault();
        return;
      }
      const key = event.key.toLowerCase();
      if (
        (key === 'w' || key === 'a' || key === 's' || key === 'd') &&
        (pointerLocked || rightFly)
      ) {
        flyKeys.add(key);
        event.preventDefault();
        ensureMovement();
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      flyKeys.delete(event.key.toLowerCase());
      if (flyKeys.size === 0) {
        stopMovement();
      }
    };
    const blur = () => {
      flyKeys.clear();
      rightFly = false;
      pan = null;
      toolPointer = null;
      updateFlyState();
    };

    viewport.addEventListener('pointerdown', pointerDown);
    viewport.addEventListener('pointermove', pointerMove);
    viewport.addEventListener('pointerup', pointerEnd);
    viewport.addEventListener('pointercancel', pointerEnd);
    viewport.addEventListener('wheel', wheel, { passive: false });
    viewport.addEventListener('contextmenu', contextMenu);
    document.addEventListener('pointerlockchange', pointerLockChange);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);

    const unsubscribe = app.subscribe((event) => {
      if (event.type === 'document') {
        setMapName(app.mapName);
        if (!event.patch) {
          controller.frame(renderer.bounds(), renderer.viewRects());
        }
      } else if (event.type === 'game') {
        setGameOpen(app.gameOpen);
        setTextureCount(app.textureCount);
      } else if (event.type === 'log') {
        setEntries(app.logEntries());
      } else if (event.type === 'grid') {
        setGridSize(app.gridSize);
      } else if (event.type === 'tool') {
        renderer.setToolPreview([]);
        setActiveTool(app.activeTool);
        setBrushPrimitive(app.brushPrimitive);
        setBrushSides(app.brushSides);
      } else if (event.type === 'recovery') {
        setRecoveryAvailable(app.recoveryProject !== null);
      }
    });
    const initialFrame = requestAnimationFrame(() => {
      controller.frame(renderer.bounds(), renderer.viewRects());
    });

    return () => {
      cancelAnimationFrame(initialFrame);
      unsubscribe();
      viewport.removeEventListener('pointerdown', pointerDown);
      viewport.removeEventListener('pointermove', pointerMove);
      viewport.removeEventListener('pointerup', pointerEnd);
      viewport.removeEventListener('pointercancel', pointerEnd);
      viewport.removeEventListener('wheel', wheel);
      viewport.removeEventListener('contextmenu', contextMenu);
      document.removeEventListener('pointerlockchange', pointerLockChange);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      stopMovement();
    };
  });

  return (
    <div class={styles.shell} data-testid="editor-shell">
      <Toolbar
        gridSize={gridSize()}
        theme={theme()}
        onOpenGameFolder={chooseGameFolder}
        onOpenSinglePak={() => pakInput?.click()}
        onOpenMap={chooseMap}
        onExportMap={() => void app.exportMap()}
        onCsgSubtract={() => app.csgSubtract()}
        onCsgIntersect={() => app.csgIntersect()}
        onHollow={(direction) => app.hollowSelection(direction)}
        onFlip={(axis) => app.flipSelection(axis)}
        onMirror={(axis) => app.mirrorSelection(axis)}
        onRotate90={() => app.rotate90Selection()}
        onGridSize={(size) => app.setGridSize(size)}
        onToggleTheme={toggleTheme}
        activeTool={activeTool()}
        brushPrimitive={brushPrimitive()}
        brushSides={brushSides()}
        onTool={(tool) => app.setToolMode(tool)}
        onBrushPrimitive={(kind, sides) => app.setBrushPrimitive(kind, sides)}
      />
      <div class={styles.main} ref={(el) => (mainElement = el)}>
        <div class={styles.center} ref={(el) => (centerElement = el)}>
          <div
            class={styles.viewport}
            tabindex="0"
            aria-label="Editor views"
            data-testid="viewport-area"
            ref={(el) => {
              viewportElement = el;
              if (canvasElement.parentElement !== el) {
                el.prepend(canvasElement);
              }
            }}
          >
            <div class={styles.titleLayer} aria-hidden="false">
              <For each={VIEW_ORDER}>
                {(view) => (
                  <header
                    class={[
                      styles.viewTitle,
                      styles[`view-${view}`],
                      {
                        [styles.active as string]: activeView() === view,
                        [styles.hidden as string]:
                          maximizedView() !== null && maximizedView() !== view,
                        [styles.maximized as string]: maximizedView() === view,
                      },
                    ]}
                    data-testid={`view-title-${view}`}
                  >
                    <span>{viewLabels[view]}</span>
                    <span class={styles.coordinates}>{coordinates()[view]}</span>
                    <span class={styles.titleSpacer} />
                    <button
                      type="button"
                      aria-label={
                        maximizedView() === view
                          ? `Restore ${viewLabels[view]}`
                          : `Maximize ${viewLabels[view]}`
                      }
                      title={
                        maximizedView() === view
                          ? `Restore ${viewLabels[view]}`
                          : `Maximize ${viewLabels[view]}`
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleMaximized(view);
                      }}
                    >
                      <Icon name={maximizedView() === view ? 'minimize' : 'maximize'} />
                    </button>
                  </header>
                )}
              </For>
            </div>
            <Show when={viewMenu()}>
              {(menu) => (
                <div
                  class={styles.contextMenu}
                  role="menu"
                  aria-label="View actions"
                  data-testid="view-context-menu"
                  style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
                  ref={(el) => {
                    el.addEventListener('pointerdown', (event) => event.stopPropagation());
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    class={styles.contextMenuItem}
                    onClick={() => {
                      setViewMenu(null);
                      app.setToolMode('brush');
                    }}
                  >
                    Add Brush
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    class={styles.contextMenuItem}
                    onClick={() => {
                      const point = menu().point;
                      setViewMenu(null);
                      app.addEntityAt('info_player_start', point);
                    }}
                  >
                    Add Player Start
                  </button>
                </div>
              )}
            </Show>
          </div>
          <div
            class={[styles.splitter, styles.horizontalSplitter]}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize bottom panel"
            aria-valuenow={bottomHeight()}
            tabindex="0"
            onPointerDown={(event) => beginSplitterDrag(event, 'horizontal')}
            onKeyDown={(event) => splitterKey(event, 'horizontal')}
          />
          <section class={styles.bottomPanel} aria-label="Textures and log">
            <PanelTabs
              selected={bottomTab()}
              maximized={maximizedView()}
              onSelect={setBottomTab}
              onView={toggleMaximized}
            />
            <Show
              when={bottomTab() === 'log'}
              fallback={
                <div class={styles.texturePlaceholder} data-testid="texture-placeholder">
                  {gameOpen()
                    ? `Texture browser: ${textureCount()} textures indexed.`
                    : 'Open a game folder to index textures.'}
                </div>
              }
            >
              <LogPanel entries={entries()} />
            </Show>
          </section>
        </div>
        <div
          class={[styles.splitter, styles.verticalSplitter]}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize properties panel"
          aria-valuenow={rightWidth()}
          tabindex="0"
          onPointerDown={(event) => beginSplitterDrag(event, 'vertical')}
          onKeyDown={(event) => splitterKey(event, 'vertical')}
        />
        <PropertiesPanel mapName={mapName()} gameOpen={gameOpen()} />
      </div>
      <Show when={recoveryAvailable()}>
        <div
          class={styles.recoveryPrompt}
          role="alertdialog"
          aria-label="Recover autosave"
          data-testid="recovery-prompt"
        >
          <strong>Recover unsaved work?</strong>
          <span>An autosaved project is available.</span>
          <button type="button" onClick={() => void app.acceptRecovery()}>
            Recover
          </button>
          <button type="button" onClick={() => void app.discardRecovery()}>
            Discard
          </button>
        </div>
      </Show>
      <input
        ref={(el) => (gameInput = el)}
        class={styles.fileInput}
        type="file"
        aria-label="Choose game folder"
        data-testid="game-directory-input"
        webkitdirectory=""
        onChange={(event) => {
          const input = event.currentTarget;
          if (input.files) {
            void app.openGameFiles(input.files);
          }
          input.value = '';
        }}
      />
      <input
        ref={(el) => (pakInput = el)}
        class={styles.fileInput}
        type="file"
        accept=".pak"
        aria-label="Choose pak0.pak"
        data-testid="pak-input"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (file) {
            void app.openSinglePak(file);
          }
          input.value = '';
        }}
      />
      <input
        ref={(el) => (mapInput = el)}
        class={styles.fileInput}
        type="file"
        accept=".map,.joole.json"
        aria-label="Choose map"
        data-testid="map-input"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (file) {
            void app.openMapFile(file);
          }
          input.value = '';
        }}
      />
    </div>
  );
}
