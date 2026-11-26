import { createSignal, For, onSettled, Show, untrack } from 'solid-js';
import type { EditorApp, LogEntry, ToolOutput, ToolPointerEvent } from '@app/index';
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
import { MeasureOverlay, type MeasureBox } from './MeasureOverlay';
import { PanelTabs, type BottomTab } from './PanelTabs';
import { TreeView } from './TreeView';
import { PrefabBrowser } from './PrefabBrowser';
import { PropertiesPanel } from './PropertiesPanel';
import { TextureBrowser } from './TextureBrowser';
import { Toolbar } from './Toolbar';
import styles from './EditorShell.module.css';

/** The PWA update lifecycle, wired in main.ts when the service worker is active. */
export interface PwaUpdateFlow {
  readonly updateAvailable: () => boolean;
  reload: () => void;
}

export interface EditorShellProps {
  readonly app: EditorApp;
  readonly renderer: Renderer;
  readonly canvas: HTMLCanvasElement;
  readonly pwa?: PwaUpdateFlow;
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
  const [textureList, setTextureList] = createSignal(app.textureList());
  const [currentTexture, setCurrentTexture] = createSignal(app.currentTextureName);
  const [gridSize, setGridSize] = createSignal(app.gridSize);
  const [entries, setEntries] = createSignal<readonly LogEntry[]>(app.logEntries());
  const [activeView, setActiveView] = createSignal<ViewId>('3d');
  const [maximizedView, setMaximizedView] = createSignal<ViewId | null>(null);
  const [compileMenuOpen, setCompileMenuOpen] = createSignal(false);
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
  /** The open entity sub-menu: 'add' or 'apply' plus the chosen category. */
  const [entityMenu, setEntityMenu] = createSignal<{
    mode: 'add' | 'apply';
    category: string | null;
  } | null>(null);

  /** Entity classes grouped by their prefix category, for the context menus. */
  const entityCategories = () => {
    const groups = new Map<string, string[]>();
    const mode = entityMenu()?.mode ?? 'add';
    for (const def of app.entityDefs()) {
      if (def.className === 'worldspawn') continue;
      // Add places point entities; Apply converts brushes into brush entities.
      const brushClass = app.isBrushClass(def.className);
      if (mode === 'add' ? brushClass : !brushClass) continue;
      const category = def.className.includes('_') ? def.className.split('_')[0]! : 'misc';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(def.className);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  };
  const [activeTool, setActiveTool] = createSignal(app.activeTool);
  const [brushPrimitive, setBrushPrimitive] = createSignal(app.brushPrimitive);
  const [brushSides, setBrushSides] = createSignal(app.brushSides);
  const [textureLock, setTextureLock] = createSignal(app.textureLockEnabled);
  const [recoveryAvailable, setRecoveryAvailable] = createSignal(app.recoveryProject !== null);
  const [panelVersion, setPanelVersion] = createSignal(0);
  const [measure, setMeasure] = createSignal<MeasureBox | null>(null);
  const [cursor, setCursor] = createSignal<readonly number[] | null>(null);

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
    const ratio = props.renderer.backingRatio();
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

    const sameVec = (a: readonly number[] | null, b: readonly number[] | null) =>
      (a === null && b === null) ||
      (a !== null && b !== null && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);
    const sameBox = (a: MeasureBox | null, b: MeasureBox | null) =>
      (a === null && b === null) ||
      (a !== null && b !== null && sameVec(a.min, b.min) && sameVec(a.max, b.max));

    const applyToolFeedback = (output: ToolOutput) => {
      // undefined means the tool said nothing; [] and null are explicit clears.
      if (output.preview !== undefined || output.invalid !== undefined) {
        renderer.setToolPreview(output.preview ?? [], output.invalid ?? []);
      }
      if (output.cursor !== undefined) {
        const next = output.cursor ?? null;
        if (!sameVec(cursor(), next)) {
          setCursor(next);
          renderer.setCursor(next as [number, number, number] | null);
        }
      }
      if (output.measure !== undefined) {
        const next = output.measure ?? null;
        if (!sameBox(measure(), next)) {
          setMeasure(next);
        }
      }
    };

    const clearToolFeedback = () => {
      setMeasure(null);
      setCursor((previous) => {
        if (previous !== null) {
          renderer.setCursor(null);
        }
        return null;
      });
    };

    const sendToolEvent = (type: 'down' | 'move' | 'up', event: PointerEvent) => {
      const hit = hitView(event.clientX, event.clientY);
      if (!hit || (toolPointer && hit.view !== toolPointer.view)) {
        return false;
      }
      const output = app.selectPointer(toolEvent(hit, type, event));
      applyToolFeedback(output);
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
      // Hover tracking: with no buttons held the tools still see the move,
      // so the creation tools can show the snapped cursor and the clip line.
      if (!pan && !pointerLocked && !rightFly && event.buttons === 0) {
        sendToolEvent('move', event);
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
              props.renderer.backingRatio(),
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
      if (
        app.activeTool === 'texture' &&
        (event.key === 'ArrowLeft' ||
          event.key === 'ArrowRight' ||
          event.key === 'ArrowUp' ||
          event.key === 'ArrowDown')
      ) {
        if (app.textureArrow(event.key, event.shiftKey)) {
          event.preventDefault();
          return;
        }
      }
      const action = shortcutAction({
        key: event.key,
        ctrl: event.ctrlKey || event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
      });
      // N steps the cameras along the leak path after a leaking compile.
      if ((event.key === 'n' || event.key === 'N') && !event.ctrlKey && !event.metaKey) {
        const point = app.nextLeakPoint();
        if (point) {
          event.preventDefault();
          for (const view of ['top', 'front', 'side'] as const) {
            const camera = controller.get(view);
            if (camera.kind === 'ortho') {
              controller.setCamera(view, { ...camera, center: [...point] });
            }
          }
          return;
        }
      }
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
          action === 'tool-face' ||
          action === 'tool-texture' ||
          action === 'tool-entity') &&
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
                  : action === 'tool-face'
                    ? 'face'
                    : action === 'tool-entity'
                      ? 'entity'
                      : 'texture',
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
    viewport.addEventListener('pointerleave', clearToolFeedback);
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
        setTextureList(app.textureList());
      } else if (event.type === 'log') {
        setEntries(app.logEntries());
      } else if (event.type === 'grid') {
        setGridSize(app.gridSize);
      } else if (event.type === 'tool') {
        renderer.setToolPreview([]);
        clearToolFeedback();
        setActiveTool(app.activeTool);
        setBrushPrimitive(app.brushPrimitive);
        setBrushSides(app.brushSides);
        setTextureLock(app.textureLockEnabled);
        setCurrentTexture(app.currentTextureName);
      }
      if (
        event.type === 'document' ||
        event.type === 'selection' ||
        event.type === 'tool' ||
        event.type === 'game'
      ) {
        setPanelVersion((v) => v + 1);
      }
      if (event.type === 'recovery') {
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
      viewport.removeEventListener('pointerleave', clearToolFeedback);
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
        gameOpen={gameOpen()}
        onCompile={() => setCompileMenuOpen((v) => !v)}
        onCsgSubtract={() => app.csgSubtract()}
        onCsgIntersect={() => app.csgIntersect()}
        onHollow={(direction) => app.hollowSelection(direction)}
        onFlip={(axis) => app.flipSelection(axis)}
        onMirror={(axis) => app.mirrorSelection(axis)}
        onRotate90={() => app.rotate90Selection()}
        onApplyTexture={() => app.applyCurrentTexture()}
        onFitTexture={() => app.fitTextures()}
        onResetTexture={() => app.resetTextures()}
        onJustifyTexture={(edge) => app.justifyTextures(edge)}
        onGridSize={(size) => app.setGridSize(size)}
        onToggleTheme={toggleTheme}
        textureLock={textureLock()}
        onToggleTextureLock={() => app.setTextureLock(!app.textureLockEnabled)}
        activeTool={activeTool()}
        brushPrimitive={brushPrimitive()}
        brushSides={brushSides()}
        onTool={(tool) => app.setToolMode(tool)}
        onBrushPrimitive={(kind, sides) => app.setBrushPrimitive(kind, sides)}
      />
      <Show when={compileMenuOpen()}>
        <div class={styles.compileMenu} role="menu" aria-label="Compile profile">
          <For each={['fast', 'normal', 'final'] as const}>
            {(profile) => (
              <button
                type="button"
                role="menuitem"
                class={styles.contextMenuItem}
                data-testid={`compile-${profile}`}
                onClick={() => {
                  setCompileMenuOpen(false);
                  void app.compileMap(profile);
                }}
              >
                {profile[0]!.toUpperCase() + profile.slice(1)}
              </button>
            )}
          </For>
          <Show when={app.isCompiling}>
            <button
              type="button"
              role="menuitem"
              class={styles.contextMenuItem}
              data-testid="compile-cancel"
              onClick={() => {
                setCompileMenuOpen(false);
                app.cancelCompile();
              }}
            >
              Cancel
            </button>
          </Show>
        </div>
      </Show>

      <div class={styles.main} ref={(el) => (mainElement = el)}>
        <div class={styles.center} ref={(el) => (centerElement = el)}>
          <div
            class={styles.viewport}
            tabindex="0"
            aria-label="Editor views"
            data-testid="viewport-area"
            onDragOver={(event) => {
              if (event.dataTransfer?.types.includes('application/x-joole-prefab')) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => {
              const name = event.dataTransfer?.getData('application/x-joole-prefab');
              if (!name) return;
              event.preventDefault();
              const hit = hitView(event.clientX, event.clientY);
              if (!hit || hit.view === '3d') {
                // The 3D view has no ground-plane projection here; place at origin.
                void app.insertPrefab(name);
                return;
              }
              const camera = orthoCamera(hit.view);
              if (!camera) {
                void app.insertPrefab(name);
                return;
              }
              const world = orthoWorldPoint(camera, hit.point, hit.size, hit.ratio);
              const grid = app.gridSize;
              const snapped = world.map((v) => Math.round(v / grid) * grid) as [
                number,
                number,
                number,
              ];
              void app.insertPrefab(name, snapped);
            }}
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
                    <span class={styles.coordinates}>
                      {measure() && view === activeView()
                        ? `${Math.round(measure()!.max[0]! - measure()!.min[0]!)} × ${Math.round(measure()!.max[1]! - measure()!.min[1]!)} × ${Math.round(measure()!.max[2]! - measure()!.min[2]!)}`
                        : coordinates()[view]}
                    </span>
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
                      setEntityMenu(null);
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
                      setEntityMenu(null);
                      app.addEntityAt('info_player_start', point);
                    }}
                  >
                    Add Player Start
                  </button>
                  <Show when={!entityMenu()}>
                    <button
                      type="button"
                      role="menuitem"
                      class={styles.contextMenuItem}
                      data-testid="menu-add-entity"
                      onClick={() => setEntityMenu({ mode: 'add', category: null })}
                    >
                      Add Entity →
                    </button>
                    <Show
                      when={[...app.selection].some(
                        (id) => app.document.nodes.get(id)?.kind === 'brush',
                      )}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        class={styles.contextMenuItem}
                        data-testid="menu-apply-entity"
                        onClick={() => setEntityMenu({ mode: 'apply', category: null })}
                      >
                        Apply Entity →
                      </button>
                    </Show>
                  </Show>
                  <Show when={entityMenu()}>
                    {(sub) => (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          class={styles.contextMenuItem}
                          onClick={() => {
                            if (sub().category) {
                              setEntityMenu({ mode: sub().mode, category: null });
                            } else {
                              setEntityMenu(null);
                            }
                          }}
                        >
                          ← Back
                        </button>
                        <For each={sub().category === null ? entityCategories() : []}>
                          {([category]) => (
                            <button
                              type="button"
                              role="menuitem"
                              class={styles.contextMenuItem}
                              onClick={() => setEntityMenu({ mode: sub().mode, category })}
                            >
                              {category} →
                            </button>
                          )}
                        </For>
                        <For
                          each={
                            sub().category !== null
                              ? (entityCategories().find(([c]) => c === sub().category)?.[1] ?? [])
                              : []
                          }
                        >
                          {(classname) => (
                            <button
                              type="button"
                              role="menuitem"
                              class={styles.contextMenuItem}
                              data-testid={`menu-class-${classname}`}
                              onClick={() => {
                                const point = menu().point;
                                const mode = sub().mode;
                                setViewMenu(null);
                                setEntityMenu(null);
                                if (mode === 'add') {
                                  app.setCurrentEntityClass(classname);
                                  app.addEntityAt(classname, point);
                                } else {
                                  app.convertSelectionToEntity(classname);
                                }
                              }}
                            >
                              {classname}
                            </button>
                          )}
                        </For>
                      </>
                    )}
                  </Show>
                </div>
              )}
            </Show>
            <MeasureOverlay
              measure={measure}
              camera={orthoCamera}
              rects={() => renderer.viewRects()}
              ratio={() => renderer.backingRatio()}
            />
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
            <Show when={bottomTab() === 'tree'}>
              <TreeView app={app} version={panelVersion} />
            </Show>
            <Show when={bottomTab() === 'prefabs'}>
              <PrefabBrowser app={app} version={panelVersion} />
            </Show>
            <Show when={bottomTab() === 'log'}>
              <LogPanel entries={entries()} />
            </Show>
            <Show when={bottomTab() === 'textures'}>
              <Show
                when={gameOpen()}
                fallback={
                  <div class={styles.texturePlaceholder} data-testid="texture-placeholder">
                    Open a game folder to index textures.
                  </div>
                }
              >
                <TextureBrowser
                  entries={textureList()}
                  inUse={() => app.texturesInUse()}
                  selected={() => currentTexture()}
                  onSelect={(name) => app.chooseTexture(name)}
                  load={(name) => app.loadTexture(name)}
                />
              </Show>
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
        <PropertiesPanel
          app={app}
          mapName={mapName()}
          gameOpen={gameOpen()}
          version={panelVersion}
        />
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
      <Show when={props.pwa?.updateAvailable()}>
        <div
          class={styles.recoveryPrompt}
          role="alertdialog"
          aria-label="Update available"
          data-testid="update-prompt"
        >
          <strong>A new version of Joole is ready.</strong>
          <span>Reload to use it. Your work is autosaved.</span>
          <button type="button" onClick={() => props.pwa?.reload()}>
            Reload
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
