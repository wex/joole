import { createSignal, For, onSettled, Show, untrack } from 'solid-js';
import type { EditorApp, LogEntry, ToolOutput, ToolPointerEvent } from '@app/index';
import { shortcutAction } from '@app/index';
import type { OrthoCamera, PerspectiveCamera, Renderer, ViewId, ViewRect } from '@render/index';
import { VIEW_ORDER } from '@render/index';
import {
  CameraController,
  dollyPerspective,
  flyKey,
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
import type { IconName } from './icons';
import { LogPanel } from './LogPanel';
import { MeasureOverlay, type MeasureBox } from './MeasureOverlay';
import { PanelTabs, type BottomTab } from './PanelTabs';
import { TreeView } from './TreeView';
import { PrefabBrowser } from './PrefabBrowser';
import { PropertiesPanel } from './PropertiesPanel';
import { DockSection } from './DockSection';
import { SettingsDialog } from './SettingsDialog';
import { ToolHint } from './ToolHint';
import { DEFAULT_SETTINGS } from '@app/settings';
import { toolInfo } from '@app/toolInfo';
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
  /** The persisted settings, loaded at startup; the shell reports changes back. */
  readonly settings?: {
    readonly rightWidth: number;
    readonly bottomHeight: number;
    readonly dockSplit: number;
    readonly propertiesCollapsed: boolean;
    readonly texturesCollapsed: boolean;
    readonly thumbSize: number;
    readonly theme: 'dark' | 'light';
    readonly wheelStep: number;
    readonly mouseLookSensitivity: number;
    readonly showToolOverlay: boolean;
    readonly groupCsgResults: boolean;
    readonly handleSize: number;
  };
  readonly onSettingsChange?: (partial: Record<string, unknown>) => void;
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

const initialRightWidth = 320;
const initialBottomHeight = 160;
const minRightWidth = 168;
const maxRightWidth = 640;
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
  // The persisted settings are the initial values only; the shell owns them afterwards.
  const initialSettings = untrack(() => props.settings);
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
  const [bottomTab, setBottomTab] = createSignal<BottomTab>('tree');
  const [theme, setTheme] = createSignal<'dark' | 'light'>(initialSettings?.theme ?? 'dark');
  const [coordinates, setCoordinates] = createSignal(coordinateDefaults(false));
  const [flyActive, setFlyActive] = createSignal(false);
  const [rightWidth, setRightWidth] = createSignal(
    initialSettings?.rightWidth ?? initialRightWidth,
  );
  const [bottomHeight, setBottomHeight] = createSignal(
    initialSettings?.bottomHeight ?? initialBottomHeight,
  );
  // The right dock (T1.12): two collapsible sections split vertically.
  const [dockSplit, setDockSplit] = createSignal(initialSettings?.dockSplit ?? 0.5);
  const [propertiesCollapsed, setPropertiesCollapsed] = createSignal(
    initialSettings?.propertiesCollapsed ?? false,
  );
  const [texturesCollapsed, setTexturesCollapsed] = createSignal(
    initialSettings?.texturesCollapsed ?? false,
  );
  const [thumbSize, setThumbSize] = createSignal(initialSettings?.thumbSize ?? 64);
  // The dialog settings (T1.15).
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [wheelStep, setWheelStep] = createSignal(initialSettings?.wheelStep ?? 64);
  const [mouseLook, setMouseLook] = createSignal(initialSettings?.mouseLookSensitivity ?? 0.15);
  const [showToolOverlay, setShowToolOverlay] = createSignal(
    initialSettings?.showToolOverlay ?? true,
  );
  const [groupCsgResults, setGroupCsgResults] = createSignal(
    initialSettings?.groupCsgResults ?? true,
  );
  const [handleSize, setHandleSize] = createSignal(initialSettings?.handleSize ?? 14);
  /** Applies one dialog change immediately: signals, side effects, persistence. */
  const applySettingsChange = (partial: Record<string, unknown>) => {
    if (typeof partial['theme'] === 'string') {
      const next = partial['theme'] as 'dark' | 'light';
      setTheme(next);
      document.documentElement.dataset.theme = next;
      renderer.refreshColors();
    }
    if (typeof partial['thumbSize'] === 'number') setThumbSize(partial['thumbSize']);
    if (typeof partial['wheelStep'] === 'number') setWheelStep(partial['wheelStep']);
    if (typeof partial['mouseLookSensitivity'] === 'number') {
      setMouseLook(partial['mouseLookSensitivity']);
    }
    if (typeof partial['showToolOverlay'] === 'boolean')
      setShowToolOverlay(partial['showToolOverlay']);
    if (typeof partial['groupCsgResults'] === 'boolean') {
      setGroupCsgResults(partial['groupCsgResults']);
      app.setCsgGrouping(partial['groupCsgResults']);
    }
    if (typeof partial['handleSize'] === 'number') {
      setHandleSize(partial['handleSize']);
      app.setHandleSize(partial['handleSize']);
      renderer.setHandleSize(partial['handleSize']);
    }
    if (typeof partial['gridSize'] === 'number') app.setGridSize(partial['gridSize']);
    if (typeof partial['rightWidth'] === 'number') {
      setRightWidth(partial['rightWidth'] as number);
      mainElement?.style.setProperty('--right-panel-width', `${partial['rightWidth']}px`);
    }
    if (typeof partial['bottomHeight'] === 'number') {
      setBottomHeight(partial['bottomHeight'] as number);
      centerElement?.style.setProperty('--bottom-panel-height', `${partial['bottomHeight']}px`);
    }
    if (typeof partial['dockSplit'] === 'number') setDockSplit(partial['dockSplit']);
    if (typeof partial['propertiesCollapsed'] === 'boolean') {
      setPropertiesCollapsed(partial['propertiesCollapsed']);
    }
    if (typeof partial['texturesCollapsed'] === 'boolean') {
      setTexturesCollapsed(partial['texturesCollapsed']);
    }
    props.onSettingsChange?.(partial);
  };
  const reportSetting = (key: string, value: unknown) => props.onSettingsChange?.({ [key]: value });
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
  const [groupPick, setGroupPick] = createSignal(app.groupPick);

  // The tool overlay (T1.16): shown for 2.5 s after a user tool change.
  const [toolHint, setToolHint] = createSignal<{
    name: string;
    shortcut: string;
    description: string;
    icon: IconName;
  } | null>(null);
  let toolHintTimer: ReturnType<typeof setTimeout> | null = null;
  const toolIcons: Record<string, IconName> = {
    select: 'mousePointer',
    brush: 'box',
    entity: 'circleUser',
    clip: 'clip',
    vertex: 'move',
    edge: 'move',
    face: 'scan',
    texture: 'brush',
  };
  const showToolHint = () => {
    // Event-time reads, not a subscription: the overlay never re-fires.
    if (!untrack(showToolOverlay) || untrack(flyActive)) return;
    // The vertex tool shows its submode: V toggles vertex and edge editing.
    const id =
      app.activeTool === 'vertex' && app.vertexSubmode === 'edge' ? 'edge' : app.activeTool;
    const info = toolInfo(id);
    if (!info) return;
    if (toolHintTimer !== null) clearTimeout(toolHintTimer);
    setToolHint({
      name: info.name,
      shortcut: info.shortcut,
      description: info.description,
      icon: toolIcons[id] ?? 'box',
    });
    toolHintTimer = setTimeout(() => {
      toolHintTimer = null;
      setToolHint(null);
    }, 2500);
  };

  let viewportElement: HTMLDivElement | undefined;
  let dockElement: HTMLElement | undefined;
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
    reportSetting('rightWidth', next);
  };
  const setPanelHeight = (height: number) => {
    const next = clamp(Math.round(height), minBottomHeight, maxBottomHeight);
    setBottomHeight(next);
    centerElement?.style.setProperty('--bottom-panel-height', `${next}px`);
    reportSetting('bottomHeight', next);
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
    reportSetting('theme', next);
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

  // The dock's inner splitter stores a fraction of the dock's height (T1.12).
  const setDockFraction = (fraction: number) => {
    const next = clamp(fraction, 0.15, 0.85);
    setDockSplit(next);
    reportSetting('dockSplit', next);
  };
  const beginDockSplitterDrag = (event: PointerEvent): void => {
    if (event.button !== 0 || !dockElement) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const bounds = dockElement.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => {
      setDockFraction((moveEvent.clientY - bounds.top) / bounds.height);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };
  const dockSplitterKey = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    setDockFraction(dockSplit() + (event.key === 'ArrowDown' ? 0.05 : -0.05));
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
    let pointerLocked = false;
    let frame: number | null = null;
    let lastFrameTime = 0;
    const flyKeys = new Set<string>();

    const updateCursor = (clientX: number, clientY: number) => {
      const hit = hitView(clientX, clientY);
      const next = coordinateDefaults(pointerLocked);
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
      if (!camera || !pointerLocked || flyKeys.size === 0) {
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
      if (frame === null && flyKeys.size > 0 && pointerLocked) {
        lastFrameTime = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const updateFlyState = () => {
      const active = pointerLocked;
      setFlyActive(active);
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
      if (output.editing !== undefined) {
        renderer.setEditing(output.editing);
      }
      if (output.handles !== undefined) {
        renderer.setHandles(output.handles);
      }
      if (output.hover !== undefined) {
        app.setGroupHover(output.hover ?? null);
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
                'Pointer lock failed. The 3D camera can only be inspected from its current position.',
              );
            });
          } catch {
            app.log(
              'warning',
              'Pointer lock failed. The 3D camera can only be inspected from its current position.',
            );
          }
        }
        return;
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
      if (!pan && !pointerLocked && event.buttons === 0) {
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
      if (pointerLocked && (event.movementX !== 0 || event.movementY !== 0)) {
        const camera = perspectiveCamera();
        if (camera) {
          controller.setCamera(
            '3d',
            lookPerspective(camera, event.movementX, event.movementY, mouseLook()),
          );
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
    };

    const wheel = (event: WheelEvent) => {
      const hit = hitView(event.clientX, event.clientY);
      if (!hit) {
        return;
      }
      if (hit.view === '3d') {
        const camera = perspectiveCamera();
        if (!camera) {
          return;
        }
        event.preventDefault();
        // One wheel notch moves the step chosen in the Settings dialog (T1.15).
        const distance = (-event.deltaY / 120) * wheelStep();
        controller.setCamera('3d', dollyPerspective(camera, distance));
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
      // Fly keys come before every shortcut while the pointer is locked
      // (T15.2): otherwise S would be taken by the Select tool.
      const fly = flyKey(event.key, pointerLocked);
      if (fly) {
        flyKeys.add(fly);
        event.preventDefault();
        ensureMovement();
        return;
      }
      if (
        app.activeTool === 'clip' &&
        (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') &&
        !pointerLocked
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
      if (action === 'delete') {
        event.preventDefault();
        app.deleteSelection();
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
      if (action === 'group') {
        // Ctrl+G is the browser's find-next, so it must not fall through.
        event.preventDefault();
        app.groupSelection();
        return;
      }
      if (action === 'ungroup') {
        event.preventDefault();
        app.ungroupSelection();
        return;
      }
      if (action === 'toggle-group-pick' && !pointerLocked) {
        event.preventDefault();
        setGroupPick(app.toggleGroupPick());
        return;
      }
      if (action === 'settings') {
        event.preventDefault();
        setSettingsOpen(true);
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
        !pointerLocked
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
      if (action && action.startsWith('tool-') && !pointerLocked) {
        event.preventDefault();
        return;
      }
      if (action) {
        // Commands whose work packages have not arrived yet are still
        // captured here so the browser never performs its own Ctrl/Cmd action.
        event.preventDefault();
        return;
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
        renderer.setEditing(new Set());
        clearToolFeedback();
        setActiveTool(app.activeTool);
        setBrushPrimitive(app.brushPrimitive);
        setBrushSides(app.brushSides);
        setTextureLock(app.textureLockEnabled);
        setCurrentTexture(app.currentTextureName);
        if (event.source === 'user') {
          showToolHint();
        }
      }
      if (
        event.type === 'document' ||
        event.type === 'selection' ||
        event.type === 'tool' ||
        event.type === 'game'
      ) {
        setPanelVersion((v) => v + 1);
      }
      // The handle dots follow every document, selection and tool change
      // (T15.3): the end of a drag, undo and redo, choosing the tool.
      if (event.type === 'document' || event.type === 'selection' || event.type === 'tool') {
        renderer.setHandles(app.handleDots());
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
        onDelete={() => app.deleteSelection()}
        onGroup={() => app.groupSelection()}
        onUngroup={() => app.ungroupSelection()}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleGroupPick={() => setGroupPick(app.toggleGroupPick())}
        groupPick={groupPick}
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
                    <Show when={groupPick()}>
                      <span class={styles.groupChip} data-testid="group-pick-chip">
                        Group
                      </span>
                    </Show>
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
            <Show when={toolHint()}>
              {(hint) => (
                <ToolHint
                  name={hint().name}
                  shortcut={hint().shortcut}
                  description={hint().description}
                  icon={hint().icon}
                />
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
            <Show when={bottomTab() === 'tree'}>
              <TreeView app={app} version={panelVersion} />
            </Show>
            <Show when={bottomTab() === 'prefabs'}>
              <PrefabBrowser app={app} version={panelVersion} />
            </Show>
            <Show when={bottomTab() === 'log'}>
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
        <aside
          class={styles.dock}
          aria-label="Properties and textures"
          ref={(el) => (dockElement = el)}
        >
          <div
            class={styles.dockProperties}
            style={
              propertiesCollapsed()
                ? undefined
                : texturesCollapsed()
                  ? { flex: '1' }
                  : { height: `${dockSplit() * 100}%` }
            }
          >
            <DockSection
              title="Properties"
              testId="dock-properties"
              collapsed={propertiesCollapsed()}
              onToggle={() => {
                const next = !propertiesCollapsed();
                setPropertiesCollapsed(next);
                reportSetting('propertiesCollapsed', next);
              }}
            >
              <PropertiesPanel
                app={app}
                mapName={mapName()}
                gameOpen={gameOpen()}
                version={panelVersion}
              />
            </DockSection>
          </div>
          <Show when={!propertiesCollapsed() && !texturesCollapsed()}>
            <div
              class={[styles.splitter, styles.horizontalSplitter]}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize dock sections"
              aria-valuenow={Math.round(dockSplit() * 100)}
              tabindex="0"
              onPointerDown={beginDockSplitterDrag}
              onKeyDown={dockSplitterKey}
            />
          </Show>
          <div
            class={styles.dockTextures}
            style={
              texturesCollapsed() ? undefined : propertiesCollapsed() ? { flex: '1' } : undefined
            }
            data-testid="dock-textures-wrap"
          >
            <DockSection
              title="Textures"
              testId="dock-textures"
              collapsed={texturesCollapsed()}
              onToggle={() => {
                const next = !texturesCollapsed();
                setTexturesCollapsed(next);
                reportSetting('texturesCollapsed', next);
              }}
            >
              <div class={styles.textureControls}>
                <label class={styles.textureSliderLabel}>
                  Thumbnail size
                  <input
                    type="range"
                    min="32"
                    max="128"
                    step="16"
                    value={thumbSize()}
                    aria-label="Thumbnail size"
                    data-testid="thumb-size-slider"
                    onInput={(event) => {
                      const next = Number(event.currentTarget.value);
                      setThumbSize(next);
                      reportSetting('thumbSize', next);
                    }}
                  />
                </label>
              </div>
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
                  thumbSize={thumbSize}
                  onSelect={(name) => app.chooseTexture(name)}
                  load={(name) => app.loadTexture(name)}
                />
              </Show>
            </DockSection>
          </div>
        </aside>
      </div>
      <Show when={settingsOpen()}>
        <SettingsDialog
          values={{
            theme: theme(),
            wheelStep: wheelStep(),
            mouseLookSensitivity: mouseLook(),
            gridSize: gridSize(),
            thumbSize: thumbSize(),
            showToolOverlay: showToolOverlay(),
            groupCsgResults: groupCsgResults(),
            handleSize: handleSize(),
          }}
          onChange={applySettingsChange}
          onReset={() => applySettingsChange({ ...DEFAULT_SETTINGS })}
          onClose={() => setSettingsOpen(false)}
        />
      </Show>
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
