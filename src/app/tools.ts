import type { Command, Id, MapDocument, Patch, Vec3 } from '@core/types/index';
import {
  analyzeBrush,
  BrushBvh,
  mat4Multiply,
  mat4RotationX,
  mat4RotationY,
  mat4RotationZ,
  mat4Scaling,
  mat4Translation,
  OverlapCycler,
  type Aabb,
  type Mat4,
  type PickAxis,
} from '@core/geom/index';
import { createTransformCommand } from './transformCommands';

export type ToolView = PickAxis | '3d';

export interface ToolPointerEvent {
  readonly type: 'down' | 'move' | 'up';
  readonly button: number;
  readonly view: ToolView;
  /** The world point on the 2D view plane, or the camera position in 3D. */
  readonly point: Vec3;
  /** A perspective picking ray direction in 3D. */
  readonly direction?: Vec3;
  /** Edge/handle tolerance in world units. */
  readonly tolerance: number;
  readonly shift: boolean;
  readonly ctrl: boolean;
}

export interface ToolOutput {
  readonly commands: Command[];
  readonly selection?: ReadonlySet<Id>;
}

export interface BoxPreview {
  readonly kind: 'box';
  readonly view: PickAxis;
  readonly start: Vec3;
  readonly current: Vec3;
}

export type ToolPreview = BoxPreview;

type Mode =
  | { kind: 'idle' }
  | { kind: 'box'; start: Vec3; view: PickAxis }
  | { kind: 'move'; last: Vec3; view: ToolView; key: string }
  | { kind: 'rotate'; last: Vec3; center: Vec3; view: ToolView; key: string }
  | { kind: 'scale'; anchor: Vec3; start: Vec3; view: ToolView; key: string };

function planeAxes(view: ToolView): [number, number] {
  return view === 'xy' ? [0, 1] : view === 'xz' ? [0, 2] : view === 'yz' ? [1, 2] : [0, 1];
}

function depthAxis(view: ToolView): number {
  return view === 'xy' ? 2 : view === 'xz' ? 1 : view === 'yz' ? 0 : 2;
}

function snap(value: number, grid: number): number {
  const snapped = Math.round(value / grid) * grid;
  return snapped === 0 ? 0 : snapped;
}

function boundsOf(doc: Readonly<MapDocument>, ids: ReadonlySet<Id>): Aabb | null {
  let out: Aabb | null = null;
  for (const id of ids) {
    const node = doc.nodes.get(id);
    if (node?.kind !== 'brush') {
      continue;
    }
    const box = analyzeBrush(node).aabb;
    if (!box) {
      continue;
    }
    out = out
      ? {
          min: [
            Math.min(out.min[0], box.min[0]),
            Math.min(out.min[1], box.min[1]),
            Math.min(out.min[2], box.min[2]),
          ],
          max: [
            Math.max(out.max[0], box.max[0]),
            Math.max(out.max[1], box.max[1]),
            Math.max(out.max[2], box.max[2]),
          ],
        }
      : box;
  }
  return out;
}

function centerOf(box: Aabb): Vec3 {
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}

function around(point: Vec3, linear: Mat4): Mat4 {
  return mat4Multiply(
    mat4Translation(point),
    mat4Multiply(linear, mat4Translation([-point[0], -point[1], -point[2]])),
  );
}

function rotationFor(view: ToolView, degrees: number): Mat4 {
  return view === 'xz'
    ? mat4RotationY(degrees)
    : view === 'yz'
      ? mat4RotationX(degrees)
      : mat4RotationZ(degrees);
}

/**
 * The Select tool state machine. It is DOM-free: views provide world-space
 * points/rays and execute the returned commands through the SelectionManager.
 */
export class SelectTool {
  private readonly bvh = new BrushBvh();
  private readonly cycler = new OverlapCycler();
  private selected = new Set<Id>();
  private doc: Readonly<MapDocument>;
  private mode: Mode = { kind: 'idle' };
  private dragSerial = 0;
  private preview: ToolPreview | null = null;

  private readonly gridSize: () => number;

  constructor(
    private readonly getDocument: () => Readonly<MapDocument>,
    gridSize: number | (() => number) = 8,
  ) {
    this.gridSize = typeof gridSize === 'function' ? gridSize : () => gridSize;
    this.doc = getDocument();
    this.rebuild();
  }

  /** Rebuilds after a wholesale document open. */
  syncDocument(doc: Readonly<MapDocument>): void {
    this.doc = doc;
    this.rebuild();
  }

  /** Incrementally updates picking after a command patch. */
  applyPatch(doc: Readonly<MapDocument>, patch: Patch): void {
    this.doc = doc;
    this.bvh.applyPatch(patch);
  }

  setSelection(ids: Iterable<Id>): void {
    this.selected = new Set(ids);
  }

  get selection(): ReadonlySet<Id> {
    return this.selected;
  }

  get currentPreview(): ToolPreview | null {
    return this.preview;
  }

  pointer(event: ToolPointerEvent): ToolOutput {
    if (event.button !== 0 && event.type === 'down') {
      return { commands: [] };
    }
    if (event.type === 'down') {
      return this.pointerDown(event);
    }
    if (event.type === 'move') {
      return this.pointerMove(event);
    }
    return this.pointerUp(event);
  }

  cancel(): void {
    this.mode = { kind: 'idle' };
    this.preview = null;
  }

  private rebuild(): void {
    this.bvh.clear();
    for (const node of this.doc.nodes.values()) {
      if (node.kind === 'brush') {
        this.bvh.insert(node.id, node);
      }
    }
  }

  private hit(event: ToolPointerEvent): Id | null {
    const hits =
      event.view === '3d'
        ? this.bvh.rayHits(event.point, event.direction ?? [1, 0, 0]).map((hit) => hit.id)
        : this.bvh.pick2D(event.point, event.view, event.tolerance).map((hit) => hit.id);
    const key = event.point.map((x) => Math.round(x / Math.max(1, this.gridSize()))).join(':');
    return this.cycler.choose(hits, `${event.view}:${key}`);
  }

  private pointerDown(event: ToolPointerEvent): ToolOutput {
    this.doc = this.getDocument();
    const hit = this.hit(event);
    const key = `drag-${++this.dragSerial}`;
    const bounds = boundsOf(this.doc, this.selected);
    if (bounds && this.nearCorner(event, bounds)) {
      const corner = this.nearCorner(event, bounds)!;
      const anchor: Vec3 = [
        corner[0] === bounds.min[0] ? bounds.max[0] : bounds.min[0],
        corner[1] === bounds.min[1] ? bounds.max[1] : bounds.min[1],
        corner[2] === bounds.min[2] ? bounds.max[2] : bounds.min[2],
      ];
      this.mode = { kind: 'scale', anchor, start: corner, view: event.view, key };
      return { commands: [] };
    }
    if (!hit) {
      if (event.view !== '3d') {
        this.mode = { kind: 'box', start: event.point, view: event.view };
        this.preview = { kind: 'box', view: event.view, start: event.point, current: event.point };
      }
      if (!event.shift && this.selected.size > 0) {
        this.selected = new Set();
        return { commands: [], selection: this.selected };
      }
      return { commands: [] };
    }

    let selectionChanged = false;
    if (event.shift) {
      this.selected = new Set(this.selected);
      if (this.selected.has(hit)) {
        this.selected.delete(hit);
      } else {
        this.selected.add(hit);
      }
      selectionChanged = true;
    } else if (!this.selected.has(hit)) {
      this.selected = new Set([hit]);
      selectionChanged = true;
    }
    if (this.selected.has(hit)) {
      if (event.ctrl) {
        const box = boundsOf(this.doc, this.selected);
        this.mode = {
          kind: 'rotate',
          last: event.point,
          center: box ? centerOf(box) : event.point,
          view: event.view,
          key,
        };
      } else {
        this.mode = { kind: 'move', last: event.point, view: event.view, key };
      }
    }
    return { commands: [], ...(selectionChanged ? { selection: this.selected } : {}) };
  }

  private nearCorner(event: ToolPointerEvent, bounds: Aabb): Vec3 | null {
    if (event.view === '3d') {
      return null;
    }
    const axes = planeAxes(event.view);
    let best: Vec3 | null = null;
    let bestDistance = Infinity;
    for (const a of [bounds.min[axes[0]]!, bounds.max[axes[0]]!]) {
      for (const b of [bounds.min[axes[1]]!, bounds.max[axes[1]]!]) {
        const corner: Vec3 = [event.point[0], event.point[1], event.point[2]];
        corner[axes[0]] = a;
        corner[axes[1]] = b;
        corner[depthAxis(event.view)] = event.point[depthAxis(event.view)]!;
        const d = Math.hypot(
          corner[axes[0]]! - event.point[axes[0]]!,
          corner[axes[1]]! - event.point[axes[1]]!,
        );
        if (d < bestDistance) {
          bestDistance = d;
          best = corner;
        }
      }
    }
    return bestDistance <= event.tolerance ? best : null;
  }

  private pointerMove(event: ToolPointerEvent): ToolOutput {
    if (this.mode.kind === 'box') {
      this.preview = {
        kind: 'box',
        view: this.mode.view,
        start: this.mode.start,
        current: event.point,
      };
      return { commands: [] };
    }
    if (this.mode.kind === 'move') {
      const axes = planeAxes(this.mode.view);
      const grid = this.gridSize();
      const delta: Vec3 = [0, 0, 0];
      let nonzero = false;
      for (const axis of axes) {
        const amount = snap(event.point[axis]! - this.mode.last[axis]!, grid);
        delta[axis] = amount;
        nonzero ||= amount !== 0;
      }
      if (!nonzero) {
        return { commands: [] };
      }
      this.mode.last = [
        this.mode.last[0] + delta[0],
        this.mode.last[1] + delta[1],
        this.mode.last[2] + delta[2],
      ];
      return {
        commands: [
          createTransformCommand(
            'Move selection',
            [...this.selected],
            mat4Translation(delta),
            this.mode.key,
          ),
        ],
      };
    }
    if (this.mode.kind === 'rotate') {
      const axes = planeAxes(this.mode.view);
      const c = this.mode.center;
      const before = Math.atan2(
        this.mode.last[axes[1]]! - c[axes[1]]!,
        this.mode.last[axes[0]]! - c[axes[0]]!,
      );
      const after = Math.atan2(
        event.point[axes[1]]! - c[axes[1]]!,
        event.point[axes[0]]! - c[axes[0]]!,
      );
      const degrees = ((after - before) * 180) / Math.PI;
      if (Math.abs(degrees) < 1e-9) {
        return { commands: [] };
      }
      this.mode.last = event.point;
      return {
        commands: [
          createTransformCommand(
            'Rotate selection',
            [...this.selected],
            around(c, rotationFor(this.mode.view, degrees)),
            this.mode.key,
          ),
        ],
      };
    }
    if (this.mode.kind === 'scale') {
      const factors: Vec3 = [1, 1, 1];
      const axes = planeAxes(this.mode.view);
      let valid = false;
      for (const axis of axes) {
        const start = this.mode.start[axis]! - this.mode.anchor[axis]!;
        const now = event.point[axis]! - this.mode.anchor[axis]!;
        factors[axis] = Math.abs(start) < 1e-9 ? 1 : now / start;
        valid ||= Math.abs(factors[axis]! - 1) > 1e-9;
      }
      if (!valid || factors.some((factor) => Math.abs(factor) < 1e-9)) {
        return { commands: [] };
      }
      this.mode.start = event.point;
      return {
        commands: [
          createTransformCommand(
            'Scale selection',
            [...this.selected],
            around(this.mode.anchor, mat4Scaling(factors)),
            this.mode.key,
          ),
        ],
      };
    }
    return { commands: [] };
  }

  private pointerUp(event: ToolPointerEvent): ToolOutput {
    if (this.mode.kind === 'box') {
      const selection = this.boxSelection(this.mode.start, event.point, this.mode.view);
      this.selected = selection;
      this.mode = { kind: 'idle' };
      this.preview = null;
      return { commands: [], selection };
    }
    this.mode = { kind: 'idle' };
    return { commands: [] };
  }

  private boxSelection(start: Vec3, end: Vec3, view: PickAxis): Set<Id> {
    const axes = planeAxes(view);
    const minA = Math.min(start[axes[0]]!, end[axes[0]]!);
    const maxA = Math.max(start[axes[0]]!, end[axes[0]]!);
    const minB = Math.min(start[axes[1]]!, end[axes[1]]!);
    const maxB = Math.max(start[axes[1]]!, end[axes[1]]!);
    const out = new Set<Id>();
    for (const node of this.doc.nodes.values()) {
      if (node.kind !== 'brush') {
        continue;
      }
      const box = analyzeBrush(node).aabb;
      if (
        box &&
        box.max[axes[0]]! >= minA &&
        box.min[axes[0]]! <= maxA &&
        box.max[axes[1]]! >= minB &&
        box.min[axes[1]]! <= maxB
      ) {
        out.add(node.id);
      }
    }
    return out;
  }
}
