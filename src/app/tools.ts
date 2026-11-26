import type { Command, FaceTexture, Id, MapDocument, Patch, Vec3 } from '@core/types/index';
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
  createPrimitiveBrush,
  type PrimitiveKind,
} from '@core/geom/index';
import { createId } from '@core/doc/index';
import { addNodePatch } from '@core/doc/commands';
import { DEFAULT_TEXTURE } from '@game/q2/index';
import { createTransformCommand } from './transformCommands';
import { clipSelectionPatch } from './csg';
import { clipPlaneFromPoints } from '@core/geom/csg';
import { moveVertices } from '@core/geom/vertexEdit';
import { createPointEntityPatch } from './entities';
import { extractWireframe } from '@core/geom/brush';
import { snap, snapAxes, snapDepthExtent } from './snap';

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

export type PreviewSegment = readonly [Vec3, Vec3];

export interface ToolOutput {
  readonly commands: Command[];
  readonly selection?: ReadonlySet<Id>;
  readonly preview?: readonly PreviewSegment[];
  /** Rejected-edit segments, drawn dashed in `vp-invalid`. */
  readonly invalid?: readonly PreviewSegment[];
  /** Face selection reported by the texture tool (application state). */
  readonly faces?: readonly { brush: Id; face: number }[];
  /** Texture name picked by the eyedropper. */
  readonly pickedTexture?: string;
  /** The snapped world point under the cursor, when the tool tracks it. */
  readonly cursor?: Vec3 | null;
  /** The size box of the in-progress edit, when the tool has one. */
  readonly measure?: { readonly min: Vec3; readonly max: Vec3 } | null;
}

function boxSegments(min: Vec3, max: Vec3): PreviewSegment[] {
  const v: Vec3[] = [];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) v.push([x, y, z]);
  const at = (x: number, y: number, z: number) => (x * 2 + y) * 2 + z;
  const out: PreviewSegment[] = [];
  for (const x of [0, 1]) for (const y of [0, 1]) out.push([v[at(x, y, 0)]!, v[at(x, y, 1)]!]);
  for (const x of [0, 1]) for (const z of [0, 1]) out.push([v[at(x, 0, z)]!, v[at(x, 1, z)]!]);
  for (const y of [0, 1]) for (const z of [0, 1]) out.push([v[at(0, y, z)]!, v[at(1, y, z)]!]);
  return out;
}

/** The four edges of a 2D drag rectangle in its view plane. */
function rectSegments(start: Vec3, current: Vec3, view: ToolView): PreviewSegment[] {
  const [axis0, axis1] = planeAxes(view);
  const depth = depthAxis(view);
  const at = (a: number, b: number): Vec3 => {
    const point = [...start] as Vec3;
    point[axis0] = a;
    point[axis1] = b;
    point[depth] = start[depth]!;
    return point;
  };
  const x0 = Math.min(start[axis0]!, current[axis0]!);
  const x1 = Math.max(start[axis0]!, current[axis0]!);
  const y0 = Math.min(start[axis1]!, current[axis1]!);
  const y1 = Math.max(start[axis1]!, current[axis1]!);
  return [
    [at(x0, y0), at(x1, y0)],
    [at(x1, y0), at(x1, y1)],
    [at(x1, y1), at(x0, y1)],
    [at(x0, y1), at(x0, y0)],
  ];
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

function planeAxes(view: ToolView): [0 | 1 | 2, 0 | 1 | 2] {
  return view === 'xy' ? [0, 1] : view === 'xz' ? [0, 2] : view === 'yz' ? [1, 2] : [0, 1];
}

function depthAxis(view: ToolView): 0 | 1 | 2 {
  return view === 'xy' ? 2 : view === 'xz' ? 1 : view === 'yz' ? 0 : 2;
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

const DEFAULT_FACE_TEXTURE: FaceTexture = {
  name: DEFAULT_TEXTURE,
  offset: [0, 0],
  rotation: 0,
  scale: [1, 1],
  contents: 0,
  flags: 0,
  value: 0,
  attribsInFile: false,
};

type BrushMode = { kind: 'idle' } | { kind: 'draw'; start: Vec3; view: PickAxis };

/**
 * The Brush tool state machine. Dragging a rectangle in a 2D view creates the
 * selected primitive; the dimension perpendicular to that view defaults to 64
 * units centred on the view plane until the multi-view height workflow arrives.
 */
export class BrushTool {
  primitive: PrimitiveKind = 'box';
  sides = 8;
  private mode: BrushMode = { kind: 'idle' };

  constructor(
    private readonly getDocument: () => Readonly<MapDocument>,
    private readonly getGridSize: () => number,
    private readonly texture: FaceTexture = DEFAULT_FACE_TEXTURE,
    private readonly getInsertParent?: () => string,
  ) {}

  pointer(event: ToolPointerEvent): ToolOutput {
    if (event.view === '3d') {
      return { commands: [], cursor: null };
    }
    // Move events carry button -1 in the browser; the drag state lives in
    // this.mode, so only the down event is filtered by button.
    if (event.type === 'down' && event.button !== 0) {
      return { commands: [] };
    }
    const grid = this.getGridSize();
    const [axis0, axis1] = planeAxes(event.view);
    const point = [...event.point] as Vec3;
    point[axis0] = snap(point[axis0], grid);
    point[axis1] = snap(point[axis1], grid);

    if (event.type === 'down') {
      this.mode = { kind: 'draw', start: point, view: event.view };
      return { commands: [], cursor: point };
    }
    if (event.type === 'move') {
      if (this.mode.kind !== 'draw') return { commands: [], cursor: point, measure: null };
      const [min, max] = this.box(point);
      return {
        commands: [],
        preview: boxSegments(min, max),
        measure: { min, max },
        cursor: point,
      };
    }
    if (event.type !== 'up' || this.mode.kind !== 'draw') {
      return { commands: [] };
    }

    const [min, max] = this.box(point);
    this.mode = { kind: 'idle' };
    for (const axis of [axis0, axis1]) {
      if (min[axis] === max[axis]) {
        return { commands: [], measure: null, cursor: point };
      }
    }

    const result = createPrimitiveBrush(this.primitive, {
      id: createId(),
      min,
      max,
      texture: this.texture,
      sides: this.sides,
    });
    if (!result.ok) {
      return { commands: [] };
    }
    const brush = result.value;
    return {
      commands: [
        {
          label: `Add ${this.primitive}`,
          run: (doc) => addNodePatch(doc, this.getInsertParent?.() ?? doc.worldspawn, brush),
        },
      ],
      selection: new Set([brush.id]),
      measure: null,
      cursor: point,
    };
  }

  /** The box of the in-progress draw: in-plane snapped, depth on the grid. */
  private box(point: Vec3): [Vec3, Vec3] {
    if (this.mode.kind !== 'draw') return [point, point];
    const grid = this.getGridSize();
    const start = this.mode.start;
    const [axis0, axis1] = planeAxes(this.mode.view);
    const depth = depthAxis(this.mode.view);
    const min: Vec3 = [...point] as Vec3;
    const max: Vec3 = [...point] as Vec3;
    for (const axis of [axis0, axis1]) {
      min[axis] = Math.min(start[axis], point[axis]);
      max[axis] = Math.max(start[axis], point[axis]);
    }
    const [depthMin, depthMax] = snapDepthExtent(snap(start[depth], grid), grid);
    min[depth] = depthMin;
    max[depth] = depthMax;
    return [min, max];
  }

  cancel(): void {
    this.mode = { kind: 'idle' };
  }
}

type ClipMode =
  | { kind: 'idle' }
  | { kind: 'first'; first: Vec3; current: Vec3; view: PickAxis }
  | { kind: 'defined'; first: Vec3; second: Vec3; view: PickAxis; side: 'front' | 'back' | 'both' };

/** The plane Clip tool: two clicks define the plane, Tab cycles the kept side and Enter applies. */
export class ClipTool {
  private mode: ClipMode = { kind: 'idle' };
  private selected = new Set<Id>();

  constructor(
    private readonly getDocument: () => Readonly<MapDocument>,
    private readonly gridSize: () => number,
  ) {}

  setSelection(ids: Iterable<Id>): void {
    this.selected = new Set(ids);
  }

  cancel(): void {
    this.mode = { kind: 'idle' };
  }

  get side(): 'front' | 'back' | 'both' | null {
    return this.mode.kind === 'defined' ? this.mode.side : null;
  }

  private snapped(point: Vec3, view: PickAxis): Vec3 {
    return snapAxes(point, planeAxes(view), this.gridSize());
  }

  private previewSegments(): PreviewSegment[] {
    if (this.mode.kind === 'first') return [[this.mode.first, this.mode.current]];
    if (this.mode.kind === 'defined') return [[this.mode.first, this.mode.second]];
    return [];
  }

  pointer(event: ToolPointerEvent): ToolOutput {
    if (event.view === '3d' || (event.type === 'down' && event.button !== 0)) {
      return { commands: [] };
    }
    const point = this.snapped(event.point, event.view);
    if (event.type === 'down') {
      if (this.mode.kind === 'first') {
        const axes = planeAxes(this.mode.view);
        const sameView = event.view === this.mode.view;
        const separated =
          sameView &&
          Math.hypot(
            point[axes[0]]! - this.mode.first[axes[0]]!,
            point[axes[1]]! - this.mode.first[axes[1]]!,
          ) > 0;
        if (separated) {
          this.mode = {
            kind: 'defined',
            first: this.mode.first,
            second: point,
            view: this.mode.view,
            side: 'front',
          };
        }
      } else {
        this.mode = { kind: 'first', first: point, current: point, view: event.view };
      }
    } else if (
      event.type === 'move' &&
      this.mode.kind === 'first' &&
      event.view === this.mode.view
    ) {
      this.mode = { ...this.mode, current: point };
    } else if (event.type === 'up') {
      // The tool is click-click rather than drag-based; mouse-up only preserves state.
    }
    return { commands: [], preview: this.previewSegments() };
  }

  key(key: string): ToolOutput {
    if (key === 'Escape') {
      this.cancel();
      return { commands: [], preview: [] };
    }
    if (this.mode.kind !== 'defined') return { commands: [], preview: this.previewSegments() };
    if (key === 'Tab') {
      const side =
        this.mode.side === 'front' ? 'back' : this.mode.side === 'back' ? 'both' : 'front';
      this.mode = { ...this.mode, side };
      return { commands: [], preview: this.previewSegments() };
    }
    if (key !== 'Enter') return { commands: [], preview: this.previewSegments() };
    const plane = clipPlaneFromPoints(this.mode.first, this.mode.second, this.mode.view);
    if (!plane) return { commands: [], preview: this.previewSegments() };
    const result = clipSelectionPatch(this.getDocument(), this.selected, plane, this.mode.side);
    if (!result) return { commands: [], preview: this.previewSegments() };
    this.cancel();
    return {
      commands: [{ label: 'Clip selection', run: () => result.patch }],
      selection: new Set(result.ids),
      preview: [],
    };
  }
}

export type VertexSubmode = 'vertex' | 'edge' | 'face';

type VertexDrag = {
  readonly brush: Id;
  positions: Vec3[];
  readonly kind: VertexSubmode;
  readonly key: string;
  last: Vec3;
  view: ToolView;
};

/** Splits a segment into dash-length pieces for the invalid-edit preview. */
export function dashedSegment(a: Vec3, b: Vec3, dash = 4): PreviewSegment[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (length <= 1e-9) return [];
  const count = Math.max(1, Math.floor(length / (dash * 2)));
  const out: PreviewSegment[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = (i * 2) / (count * 2);
    const t1 = Math.min(1, (i * 2 + 1) / (count * 2));
    out.push([
      [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0],
      [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1],
    ]);
  }
  return out;
}

function segmentDistance(point: Vec3, a: Vec3, b: Vec3, axes: readonly [number, number]): number {
  const pa = [point[axes[0]]! - a[axes[0]]!, point[axes[1]]! - a[axes[1]]!];
  const ba = [b[axes[0]]! - a[axes[0]]!, b[axes[1]]! - a[axes[1]]!];
  const len2 = ba[0]! * ba[0]! + ba[1]! * ba[1]!;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, (pa[0]! * ba[0]! + pa[1]! * ba[1]!) / len2));
  return Math.hypot(pa[0]! - ba[0]! * t, pa[1]! - ba[1]! * t);
}

function cross3(center: Vec3, size: number): PreviewSegment[] {
  return [
    [
      [center[0] - size, center[1], center[2]],
      [center[0] + size, center[1], center[2]],
    ],
    [
      [center[0], center[1] - size, center[2]],
      [center[0], center[1] + size, center[2]],
    ],
    [
      [center[0], center[1], center[2] - size],
      [center[0], center[1], center[2] + size],
    ],
  ];
}

/**
 * The vertex/edge/face editing tool. V toggles between vertex and edge
 * submodes; F is the face submode. Dragging a handle of a selected brush
 * recomputes the touching planes through `moveVertices`; a rejected edit
 * applies nothing and shows the drag as dashed `vp-invalid` segments.
 */
export class VertexTool {
  submode: VertexSubmode = 'vertex';
  private drag: VertexDrag | null = null;
  private serial = 0;

  constructor(
    private readonly getDocument: () => Readonly<MapDocument>,
    private readonly gridSize: () => number,
    private readonly getSelection: () => ReadonlySet<Id>,
  ) {}

  toggleVertexEdge(): void {
    this.submode = this.submode === 'edge' ? 'vertex' : 'edge';
  }

  cancel(): void {
    this.drag = null;
  }

  private brushAt(id: Id) {
    const node = this.getDocument().nodes.get(id);
    return node?.kind === 'brush' ? node : null;
  }

  /** Handle positions of the selected brushes for the current submode. */
  handles(): { brush: Id; positions: Vec3[]; kind: VertexSubmode }[] {
    const out: { brush: Id; positions: Vec3[]; kind: VertexSubmode }[] = [];
    for (const id of this.getSelection()) {
      const brush = this.brushAt(id);
      if (!brush) continue;
      const analysis = analyzeBrush(brush);
      if (this.submode === 'vertex') {
        for (const v of extractWireframe(analysis.polygons).vertices) {
          out.push({ brush: id, positions: [v], kind: 'vertex' });
        }
      } else if (this.submode === 'edge') {
        const wire = extractWireframe(analysis.polygons);
        for (const [a, b] of wire.edges) {
          out.push({ brush: id, positions: [wire.vertices[a]!, wire.vertices[b]!], kind: 'edge' });
        }
      } else {
        for (const polygon of analysis.polygons) {
          if (!polygon) continue;
          const center: Vec3 = [0, 0, 0];
          for (const p of polygon) {
            center[0] += p[0] / polygon.length;
            center[1] += p[1] / polygon.length;
            center[2] += p[2] / polygon.length;
          }
          out.push({ brush: id, positions: [...polygon], kind: 'face' });
        }
      }
    }
    return out;
  }

  /** Small crosses at every handle, drawn while the tool is idle. */
  handlePreview(size: number): PreviewSegment[] {
    const out: PreviewSegment[] = [];
    for (const handle of this.handles()) {
      const center: Vec3 = [0, 0, 0];
      for (const p of handle.positions) {
        center[0] += p[0] / handle.positions.length;
        center[1] += p[1] / handle.positions.length;
        center[2] += p[2] / handle.positions.length;
      }
      out.push(...cross3(center, size));
    }
    return out;
  }

  private pickHandle(
    event: ToolPointerEvent,
  ): { brush: Id; positions: Vec3[]; kind: VertexSubmode } | null {
    if (event.view === '3d') return null;
    const axes = planeAxes(event.view) as readonly [number, number];
    let best: { brush: Id; positions: Vec3[]; kind: VertexSubmode } | null = null;
    let bestDistance = Infinity;
    for (const handle of this.handles()) {
      let d: number;
      if (handle.kind === 'vertex') {
        const v = handle.positions[0]!;
        d = Math.hypot(v[axes[0]]! - event.point[axes[0]]!, v[axes[1]]! - event.point[axes[1]]!);
      } else if (handle.kind === 'edge') {
        d = segmentDistance(event.point, handle.positions[0]!, handle.positions[1]!, axes);
      } else {
        const center: Vec3 = [0, 0, 0];
        for (const p of handle.positions) {
          center[0] += p[0] / handle.positions.length;
          center[1] += p[1] / handle.positions.length;
          center[2] += p[2] / handle.positions.length;
        }
        d = Math.hypot(
          center[axes[0]]! - event.point[axes[0]]!,
          center[axes[1]]! - event.point[axes[1]]!,
        );
      }
      if (d < bestDistance) {
        bestDistance = d;
        best = handle;
      }
    }
    return bestDistance <= event.tolerance ? best : null;
  }

  pointer(event: ToolPointerEvent): ToolOutput {
    if (event.button !== 0 && event.type === 'down') return { commands: [] };
    if (event.type === 'down') {
      const handle = this.pickHandle(event);
      if (!handle) return { commands: [], preview: this.handlePreview(event.tolerance) };
      this.drag = {
        brush: handle.brush,
        positions: handle.positions.map((p) => [...p] as Vec3),
        kind: handle.kind,
        key: `vertex-${++this.serial}`,
        last: event.point,
        view: event.view,
      };
      return { commands: [] };
    }
    if (event.type === 'move') {
      if (!this.drag) return { commands: [], preview: this.handlePreview(event.tolerance) };
      if (event.view !== this.drag.view) return { commands: [] };
      const axes = planeAxes(this.drag.view);
      const grid = this.gridSize();
      const delta: Vec3 = [0, 0, 0];
      let nonzero = false;
      for (const axis of axes) {
        const amount = snap(event.point[axis]! - this.drag.last[axis]!, grid);
        delta[axis] = amount;
        nonzero ||= amount !== 0;
      }
      if (!nonzero) return { commands: [] };
      const brush = this.brushAt(this.drag.brush);
      if (!brush) {
        this.drag = null;
        return { commands: [] };
      }
      const result = moveVertices(brush, this.drag.positions, delta);
      if (!result.ok) {
        // Rejected: nothing is applied; the drag is shown dashed instead.
        const preview: PreviewSegment[] = [];
        for (const pos of this.drag.positions) {
          preview.push(
            ...dashedSegment(pos, [pos[0] + delta[0], pos[1] + delta[1], pos[2] + delta[2]]),
          );
        }
        return { commands: [], invalid: preview };
      }
      this.drag.last = [
        this.drag.last[0] + delta[0],
        this.drag.last[1] + delta[1],
        this.drag.last[2] + delta[2],
      ];
      this.drag.positions = this.drag.positions.map(
        (p) => [p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]] as Vec3,
      );
      const positions = this.drag.positions.map((p) => [...p] as Vec3);
      const before = positions.map(
        (p) => [p[0] - delta[0], p[1] - delta[1], p[2] - delta[2]] as Vec3,
      );
      return {
        invalid: [],
        commands: [
          {
            label: `Move ${this.drag.kind}`,
            mergeKey: this.drag.key,
            run: (doc) => {
              const node = doc.nodes.get(this.drag!.brush);
              if (node?.kind !== 'brush') throw new Error('edited brush is gone');
              const applied = moveVertices(node, before, delta);
              if (!applied.ok) throw new Error(`Move ${this.drag!.kind} was rejected`);
              const patch = {
                before: new Map([[node.id, node]]),
                after: new Map([[node.id, applied.value]]),
                parentBefore: new Map(),
                parentAfter: new Map(),
              };
              return patch;
            },
          },
        ],
      };
    }
    const hadDrag = this.drag !== null;
    this.drag = null;
    return hadDrag ? { commands: [], invalid: [] } : { commands: [] };
  }
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
    private readonly textureLock: () => boolean = () => false,
    private readonly onLockWarning: (errorTexels: number) => void = () => {},
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
    const selectedHit = hits.find((id) => this.selected.has(id));
    if (selectedHit !== undefined) {
      return selectedHit;
    }
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
      return { commands: [], preview: rectSegments(this.mode.start, event.point, this.mode.view) };
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
          createTransformCommand('Move selection', [...this.selected], mat4Translation(delta), {
            mergeKey: this.mode.key,
            textureLock: this.textureLock(),
            onLockWarning: this.onLockWarning,
          }),
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
            {
              mergeKey: this.mode.key,
              textureLock: this.textureLock(),
              onLockWarning: this.onLockWarning,
            },
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
            { mergeKey: this.mode.key },
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
      return { commands: [], selection, preview: [] };
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

/**
 * Texture tool (T): picks faces in the 3D view. A plain click replaces the
 * face selection, Shift adds or removes, and Ctrl is the eyedropper: it
 * reports the clicked face's texture instead of changing the selection.
 * The face selection itself is application state; the tool only reports it.
 */
export class TextureTool {
  private readonly bvh = new BrushBvh();
  private doc: Readonly<MapDocument>;
  private faces: FacePick[] = [];
  private readonly cycler = new OverlapCycler();

  constructor(
    private readonly getDocument: () => Readonly<MapDocument>,
    private readonly gridSize: () => number = () => 8,
  ) {
    this.doc = getDocument();
    this.rebuild();
  }

  syncDocument(doc: Readonly<MapDocument>): void {
    this.doc = doc;
    this.rebuild();
    this.faces = this.faces.filter((ref) => this.valid(ref));
  }

  applyPatch(doc: Readonly<MapDocument>, patch: Patch): void {
    this.doc = doc;
    this.bvh.applyPatch(patch);
    this.faces = this.faces.filter((ref) => this.valid(ref));
  }

  get faceSelection(): readonly FacePick[] {
    return this.faces;
  }

  /** Replaces the face selection from the application side, validating it. */
  setFaceSelection(faces: readonly FacePick[]): void {
    this.faces = faces.filter((ref) => this.valid(ref));
  }

  clearFaceSelection(): void {
    this.faces = [];
  }

  cancel(): void {
    // The texture tool has no drag state; face picking happens on click.
  }

  pointer(event: ToolPointerEvent): ToolOutput {
    if (event.type !== 'down' || event.button !== 0) {
      return { commands: [] };
    }
    if (event.view !== '3d') {
      // Faces are picked in 3D only (spec: texture tool section).
      return { commands: [] };
    }
    this.doc = this.getDocument();
    const hit = this.hitFace(event);
    if (!hit) {
      if (!event.shift && !event.ctrl) {
        this.faces = [];
        return { commands: [], faces: [] };
      }
      return { commands: [] };
    }
    const node = this.doc.nodes.get(hit.brush);
    const face = node?.kind === 'brush' ? node.faces[hit.face] : undefined;
    if (event.ctrl) {
      return face ? { commands: [], pickedTexture: face.tex.name } : { commands: [] };
    }
    const existing = this.faces.findIndex(
      (ref) => ref.brush === hit.brush && ref.face === hit.face,
    );
    if (event.shift) {
      this.faces =
        existing >= 0 ? this.faces.filter((_, i) => i !== existing) : [...this.faces, hit];
    } else {
      this.faces = existing >= 0 && this.faces.length === 1 ? [] : [hit];
    }
    return { commands: [], faces: [...this.faces] };
  }

  private rebuild(): void {
    this.bvh.clear();
    for (const node of this.doc.nodes.values()) {
      if (node.kind === 'brush') {
        this.bvh.insert(node.id, node);
      }
    }
  }

  private valid(ref: FacePick): boolean {
    const node = this.doc.nodes.get(ref.brush);
    return node?.kind === 'brush' && ref.face >= 0 && ref.face < node.faces.length;
  }

  private hitFace(event: ToolPointerEvent): FacePick | null {
    const hits = this.bvh.rayHits(event.point, event.direction ?? [1, 0, 0]);
    const usable = hits.filter((hit) => hit.faceIndex !== null);
    if (usable.length === 0) {
      return null;
    }
    const key = event.point.map((x) => Math.round(x / Math.max(1, this.gridSize()))).join(':');
    const chosen = this.cycler.choose(
      usable.map((hit) => hit.id),
      `tex:${event.view}:${key}`,
    );
    const hit = usable.find((candidate) => candidate.id === chosen) ?? usable[0]!;
    return { brush: hit.id, face: hit.faceIndex ?? 0 };
  }
}

/** A face picked by the texture tool: the brush and its face index. */
export interface FacePick {
  readonly brush: Id;
  readonly face: number;
}

/**
 * The entity tool (E): a click places a point entity of the current class at
 * the clicked world point, snapped to the grid, in every view. Brush entity
 * classes are not placed — they are made by converting selected brushes.
 */
export class EntityTool {
  private readonly gridSize: () => number;

  constructor(
    private readonly getDocument: () => Readonly<MapDocument>,
    private readonly currentClass: () => string,
    private readonly scopeParent: () => Id,
    gridSize: number | (() => number) = 8,
  ) {
    this.gridSize = typeof gridSize === 'function' ? gridSize : () => gridSize;
    void this.getDocument;
  }

  syncDocument(doc: Readonly<MapDocument>): void {
    void doc;
  }

  applyPatch(doc: Readonly<MapDocument>, patch: Patch): void {
    void doc;
    void patch;
  }

  setSelection(ids: Iterable<Id>): void {
    void ids;
  }
  cancel(): void {}

  pointer(event: ToolPointerEvent): ToolOutput {
    if (event.type !== 'down' || event.button !== 0) return { commands: [] };
    const classname = this.currentClass();
    if (!classname) return { commands: [] };
    const grid = this.gridSize();
    const snapped = event.point.map((value) => snap(value, grid)) as Vec3;
    const doc = this.getDocument();
    let placement: { patch: Patch; id: Id };
    try {
      placement = createPointEntityPatch(doc, classname, snapped, this.scopeParent());
    } catch {
      return { commands: [] };
    }
    const id = placement.id;
    return {
      commands: [
        {
          label: `Add ${classname}`,
          run: () => placement.patch,
        },
      ],
      selection: new Set([id]),
    };
  }
}
