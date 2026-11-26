import type { Id, MapDocument, MapNode, Patch, Vec3 } from '@core/types/index';
import { RangeAllocator } from './allocator';
import {
  HANDLE_STRIDE,
  boxEdges,
  buildBrushMesh,
  entityBox,
  entityOrigin,
  FACE_OFFSET_INDEX,
  FACE_OFFSET_NORMAL,
  FACE_OFFSET_POSITION,
  FACE_OFFSET_UV,
  FACE_STRIDE,
  LINE_OFFSET_A,
  LINE_OFFSET_B,
  LINE_OFFSET_INDEX,
  LINE_STRIDE,
  writeLines,
  type FaceClass,
} from './brushMesh';
import { unionAabb, type Aabb } from './camera';

/** Bits of a node's byte in the state texture, read by the shaders. */
/**
 * The polygon's outward unit normal times the highlight lift, by Newell's
 * method. Brush windings are clockwise viewed from outside, so the Newell
 * normal points into the brush and is negated.
 */
function faceLift(polygon: readonly Vec3[]): Vec3 {
  const LIFT = 0.05;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) {
    return [0, 0, 0];
  }
  return [(-nx / len) * LIFT, (-ny / len) * LIFT, (-nz / len) * LIFT];
}

function sameSegments(a: readonly LineSegment[], b: readonly LineSegment[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const [a0, a1] = a[i]!;
    const [b0, b1] = b[i]!;
    for (let k = 0; k < 3; k++) {
      if (a0[k] !== b0[k] || a1[k] !== b1[k]) return false;
    }
  }
  return true;
}

function samePolygons(a: readonly (readonly Vec3[])[], b: readonly (readonly Vec3[])[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i]!;
    const pb = b[i]!;
    if (pa.length !== pb.length) return false;
    for (let j = 0; j < pa.length; j++) {
      if (pa[j]![0] !== pb[j]![0] || pa[j]![1] !== pb[j]![1] || pa[j]![2] !== pb[j]![2]) {
        return false;
      }
    }
  }
  return true;
}

export const STATE_SELECTED = 1;
export const STATE_ENTITY = 2;
export const STATE_INVALID = 4;
export const STATE_DIMMED = 8;
export const STATE_LEAK = 16;
export const STATE_HANDLE = 64;
export const STATE_EDITING = 32;
export const STATE_FACE = 128;

/** The state texture is this many texels wide, one byte per node index. */
const STATE_WIDTH = 1024;
const INITIAL_CAPACITY = 1024;
type LineSegment = readonly [Vec3, Vec3];

interface Range {
  offset: number;
  count: number;
}

/**
 * One growable GPU buffer of fixed-stride elements, with the element ranges
 * of each node. A freed range is zeroed, which draws as degenerate triangles
 * or zero-length lines, so a batch is always drawn up to its high-water mark.
 */
export class GpuStore {
  buffer: WebGLBuffer;
  readonly vao: WebGLVertexArrayObject;
  readonly ranges = new Map<Id, Range>();
  private readonly allocator: RangeAllocator;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly stride: number,
    private readonly bindAttributes: (buffer: WebGLBuffer) => void,
  ) {
    this.allocator = new RangeAllocator(INITIAL_CAPACITY);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, INITIAL_CAPACITY * stride, gl.DYNAMIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    bindAttributes(this.buffer);
    gl.bindVertexArray(null);
  }

  /** The number of elements to draw. */
  get drawCount(): number {
    return this.allocator.highWater;
  }

  write(id: Id, data: ArrayBuffer, count: number): void {
    this.remove(id);
    if (count === 0) {
      return;
    }
    let offset = this.allocator.alloc(count);
    if (offset === null) {
      this.grow(Math.max(this.allocator.capacity * 2, this.allocator.capacity + count));
      offset = this.allocator.alloc(count)!;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      offset * this.stride,
      new Uint8Array(data, 0, count * this.stride),
    );
    this.ranges.set(id, { offset, count });
  }

  remove(id: Id): void {
    const range = this.ranges.get(id);
    if (!range) {
      return;
    }
    this.ranges.delete(id);
    this.allocator.release(range.offset, range.count);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      range.offset * this.stride,
      new Uint8Array(range.count * this.stride),
    );
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteVertexArray(this.vao);
  }

  private grow(capacity: number): void {
    const gl = this.gl;
    const old = this.buffer;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, buffer);
    gl.bufferData(gl.COPY_WRITE_BUFFER, capacity * this.stride, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.COPY_READ_BUFFER, old);
    gl.copyBufferSubData(
      gl.COPY_READ_BUFFER,
      gl.COPY_WRITE_BUFFER,
      0,
      0,
      this.allocator.capacity * this.stride,
    );
    gl.bindBuffer(gl.COPY_READ_BUFFER, null);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
    gl.deleteBuffer(old);
    this.buffer = buffer;
    this.allocator.grow(capacity);
    gl.bindVertexArray(this.vao);
    this.bindAttributes(buffer);
    gl.bindVertexArray(null);
  }
}

export interface FaceBatch {
  readonly key: string;
  readonly cls: FaceClass;
  readonly texture: string;
  readonly store: GpuStore;
}

/** A drawn node: a brush, or a point entity drawn as a box. */
export interface NodeRecord {
  readonly kind: 'brush' | 'entity';
  readonly index: number;
  readonly aabb: Aabb | null;
  readonly batchKeys: readonly string[];
}

/**
 * The brush geometry cache of the spec: each brush's polygons are built once
 * after a change and stored in per-texture vertex buffers, and a patch
 * rebuilds only the nodes it touches.
 */
export class GeometryCache {
  readonly batches = new Map<string, FaceBatch>();
  readonly records = new Map<Id, NodeRecord>();
  readonly lines: GpuStore;
  private readonly cornerBuffer: WebGLBuffer;
  private readonly stateTexture: WebGLTexture;
  /** RGBA per node index: R flags, GBA the class colour for entities. */
  private state = new Uint8Array(STATE_WIDTH * 4);
  private stateDirty = true;
  private stateRowsOnGpu = 0;
  private readonly freeIndices: number[] = [];
  private nextIndex = 1;
  private selected = new Set<Id>();
  private editing = new Set<Id>();
  private toolSegments: readonly LineSegment[] = [];
  private linkSegments: readonly LineSegment[] = [];
  private invalidSegments: readonly LineSegment[] = [];
  private readonly invalidIndex: number;
  private readonly leakIndex: number;
  private readonly cursorIndex: number;
  private readonly groupIndex: number;
  private readonly groupHoverIndex: number;
  private groupSegments: readonly LineSegment[] = [];
  private groupHoverSegments: readonly LineSegment[] = [];
  private leakSegments: readonly LineSegment[] = [];
  private cursorPoint: readonly [number, number, number] | null = null;
  readonly handles: GpuStore;
  private readonly handleCornerBuffer: WebGLBuffer;
  private handleKey = '';
  /** The current handle dots, for the test hook. */
  handleList: readonly { point: Vec3; state: 0 | 1 | 2 }[] = [];
  private readonly faceHighlightIndex: number;
  private facePolygons: readonly (readonly Vec3[])[] = [];
  readonly faceHighlight: GpuStore;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    /** Class colour lookup for point entities, injected from the app layer. */
    private readonly entityColorOf: (
      node: MapNode,
    ) => readonly [number, number, number] | null = () => null,
    /** Wireframe edges in model space for point entities with an md2, injected from the app layer. */
    private readonly entityWireframeOf: (
      node: MapNode,
    ) =>
      | readonly (readonly [readonly [number, number, number], readonly [number, number, number]])[]
      | null = () => null,
  ) {
    this.invalidIndex = this.takeIndex();
    this.state[this.invalidIndex * 4] = STATE_SELECTED | STATE_INVALID;
    this.leakIndex = this.takeIndex();
    this.state[this.leakIndex * 4] = STATE_SELECTED | STATE_LEAK;
    this.cursorIndex = this.takeIndex();
    this.state[this.cursorIndex * 4] = STATE_SELECTED | STATE_HANDLE;
    this.groupIndex = this.takeIndex();
    this.state[this.groupIndex * 4] = STATE_HANDLE;
    this.groupHoverIndex = this.takeIndex();
    this.state[this.groupHoverIndex * 4] = STATE_SELECTED;
    this.faceHighlightIndex = this.takeIndex();
    this.state[this.faceHighlightIndex * 4] = STATE_FACE;
    this.faceHighlight = new GpuStore(gl, FACE_STRIDE, (buffer) => this.bindFaceAttributes(buffer));
    this.cornerBuffer = gl.createBuffer();
    this.handleCornerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.lines = new GpuStore(gl, LINE_STRIDE, (buffer) => this.bindLineAttributes(buffer));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.handleCornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.handles = new GpuStore(gl, HANDLE_STRIDE, (buffer) => this.bindHandleAttributes(buffer));
    this.stateTexture = gl.createTexture();
  }

  /** Replaces everything with the nodes of a new document. */
  setDocument(doc: Readonly<MapDocument>): void {
    for (const id of [...this.records.keys()]) {
      this.removeNode(id);
    }
    for (const node of doc.nodes.values()) {
      this.addNode(doc, node);
    }
  }

  /** Rebuilds only the nodes that a patch created, changed or removed. */
  applyPatch(doc: Readonly<MapDocument>, patch: Patch): void {
    // Hidden group flags propagate down the tree, so descendants must be
    // re-evaluated when the inheritance can change: a group in the patch (its
    // flag may have toggled) or a reparented node (its ancestors changed).
    // Entity containers like worldspawn never carry the flags, so the hot
    // path of adding and editing brushes stays patch-sized.
    const affected = new Set<Id>();
    const walk = (id: Id) => {
      if (affected.has(id)) return;
      affected.add(id);
      const node = doc.nodes.get(id);
      if (node && (node.kind === 'entity' || node.kind === 'group')) {
        for (const child of node.children) walk(child);
      }
    };
    for (const id of patch.after.keys()) {
      const node = doc.nodes.get(id);
      if (node?.kind === 'group') walk(id);
    }
    for (const id of patch.parentAfter.keys()) walk(id);
    for (const id of patch.after.keys()) {
      affected.add(id);
    }
    for (const id of affected) {
      this.removeNode(id);
      const node = doc.nodes.get(id);
      if (node) {
        this.addNode(doc, node);
      }
    }
    this.rebuildOverlay();
  }

  /**
   * Marks the selection: the given nodes and, for entities and groups, every
   * brush and point entity below them.
   */
  private scopeId: Id | null = null;
  private scopeMembers = new Set<Id>();

  /** Sets the entered scope: nodes outside it are dimmed. null shows everything. */
  setScope(doc: Readonly<MapDocument>, scopeId: Id | null): void {
    this.scopeId = scopeId;
    this.scopeMembers.clear();
    if (scopeId) {
      const walk = (at: Id) => {
        this.scopeMembers.add(at);
        const node = doc.nodes.get(at);
        if (node && (node.kind === 'entity' || node.kind === 'group')) {
          for (const child of node.children) walk(child);
        }
      };
      walk(scopeId);
    }
    this.refreshStates();
    this.rebuildOverlay();
  }

  /** Rewrites every node's state bits from the selection and the scope. */
  private refreshStates(): void {
    for (const [id, record] of this.records) {
      const dimmed = this.scopeId !== null && !this.scopeMembers.has(id);
      this.setState(record.index, record.kind, this.selected.has(id), dimmed, this.editing.has(id));
    }
    this.stateDirty = true;
  }

  setSelection(doc: Readonly<MapDocument>, ids: Iterable<Id>): void {
    const selected = new Set<Id>();
    const walk = (id: Id) => {
      const node = doc.nodes.get(id);
      if (!node || selected.has(id)) {
        return;
      }
      selected.add(id);
      if (node.kind !== 'brush') {
        node.children.forEach(walk);
      }
    };
    for (const id of ids) {
      walk(id);
    }
    for (const id of new Set([...this.selected, ...selected])) {
      const record = this.records.get(id);
      if (record) {
        const dimmed = this.scopeId !== null && !this.scopeMembers.has(id);
        this.setState(record.index, record.kind, selected.has(id), dimmed, this.editing.has(id));
      }
    }
    this.selected = selected;
    this.rebuildOverlay();
  }

  /**
   * The brushes a drag is currently editing (T1.7): their lines and faces
   * draw in the selection style in every view. Returns false when nothing
   * changed. Editing is transient and never affects the document.
   */
  setEditing(ids: ReadonlySet<Id>): boolean {
    let same = ids.size === this.editing.size;
    if (same) {
      for (const id of ids) {
        if (!this.editing.has(id)) {
          same = false;
          break;
        }
      }
    }
    if (same) {
      return false;
    }
    for (const id of new Set([...this.editing, ...ids])) {
      const record = this.records.get(id);
      if (record) {
        const dimmed = this.scopeId !== null && !this.scopeMembers.has(id);
        this.setState(record.index, record.kind, this.selected.has(id), dimmed, ids.has(id));
      }
    }
    this.editing = new Set(ids);
    return true;
  }

  /** Replaces the transient editing preview: brush ghosts and drag rectangles. */
  setToolPreview(segments: readonly LineSegment[], invalid: readonly LineSegment[] = []): boolean {
    if (sameSegments(segments, this.toolSegments) && sameSegments(invalid, this.invalidSegments)) {
      return false;
    }
    this.toolSegments = segments;
    this.invalidSegments = invalid;
    this.rebuildOverlay();
    return true;
  }

  /**
   * The vertex/edge/face handle dots (T1.8), drawn as screen-space squares
   * after everything else in every view. Returns false when nothing changed.
   */
  setHandles(handles: readonly { point: Vec3; state: 0 | 1 | 2 }[]): boolean {
    let key = '';
    for (const handle of handles) {
      key += `${handle.point[0]},${handle.point[1]},${handle.point[2]},${handle.state};`;
    }
    if (key === this.handleKey) {
      return false;
    }
    this.handleKey = key;
    this.handleList = handles;
    if (handles.length === 0) {
      this.handles.remove('__handles');
      return true;
    }
    const data = new ArrayBuffer(handles.length * HANDLE_STRIDE);
    const f32 = new Float32Array(data);
    const u32 = new Uint32Array(data);
    handles.forEach((handle, i) => {
      const base = (i * HANDLE_STRIDE) / 4;
      f32[base] = handle.point[0];
      f32[base + 1] = handle.point[1];
      f32[base + 2] = handle.point[2];
      u32[base + 3] = handle.state;
    });
    this.handles.write('__handles', data, handles.length);
    return true;
  }

  /**
   * The texture tool's picked faces: a translucent fill in 3D and a
   * vp-select outline in every view. Returns false when nothing changed.
   */
  setFaceHighlight(polygons: readonly (readonly Vec3[])[]): boolean {
    if (samePolygons(polygons, this.facePolygons)) {
      return false;
    }
    this.facePolygons = polygons;
    // Fan-triangulated fill in the face vertex format.
    let vertexCount = 0;
    for (const polygon of polygons) {
      vertexCount += Math.max(0, polygon.length - 2) * 3;
    }
    if (vertexCount === 0) {
      this.faceHighlight.remove('__faceHighlight');
    } else {
      const data = new ArrayBuffer(vertexCount * FACE_STRIDE);
      const f32 = new Float32Array(data);
      const u32 = new Uint32Array(data);
      let v = 0;
      const put = (point: Vec3) => {
        const base = (v * FACE_STRIDE) / 4;
        f32[base] = point[0];
        f32[base + 1] = point[1];
        f32[base + 2] = point[2];
        // uv zeros at +12, normal zeros at +20: shading is off for the fill.
        u32[(v * FACE_STRIDE + 24) / 4] = this.faceHighlightIndex;
        v++;
      };
      for (const polygon of polygons) {
        // The fill floats a hair above the face along its normal: a coplanar
        // fill loses the depth test against the face itself (T15.7), and a
        // polygon offset does not help on every GL implementation.
        const lift = faceLift(polygon);
        const at = (point: readonly number[]): Vec3 => [
          point[0]! + lift[0],
          point[1]! + lift[1],
          point[2]! + lift[2],
        ];
        for (let i = 1; i + 1 < polygon.length; i++) {
          put(at(polygon[0]!));
          put(at(polygon[i]!));
          put(at(polygon[i + 1]!));
        }
      }
      this.faceHighlight.write('__faceHighlight', data, vertexCount);
    }
    // Outlines in the selected-line pass of every view, lifted with the fill.
    const segments: LineSegment[] = [];
    for (const polygon of polygons) {
      const lift = faceLift(polygon);
      const at = (point: readonly number[]): Vec3 => [
        point[0]! + lift[0],
        point[1]! + lift[1],
        point[2]! + lift[2],
      ];
      for (let i = 0; i < polygon.length; i++) {
        segments.push([at(polygon[i]!), at(polygon[(i + 1) % polygon.length]!)]);
      }
    }
    if (segments.length === 0) {
      this.lines.remove('__overlayFaces');
    } else {
      this.lines.write(
        '__overlayFaces',
        writeLines(segments, this.faceHighlightIndex),
        segments.length,
      );
    }
    return true;
  }

  /** The snapped-cursor cross of the creation tools (null hides it). */
  setCursor(point: readonly [number, number, number] | null): boolean {
    const same =
      (point === null && this.cursorPoint === null) ||
      (point !== null &&
        this.cursorPoint !== null &&
        point[0] === this.cursorPoint[0] &&
        point[1] === this.cursorPoint[1] &&
        point[2] === this.cursorPoint[2]);
    if (same) return false;
    this.cursorPoint = point;
    this.rebuildOverlay();
    return true;
  }

  /** Persistent target–targetname link lines, recomputed by the app on document changes. */
  setTargetLinks(segments: readonly LineSegment[]): void {
    this.linkSegments = segments;
    this.rebuildOverlay();
  }

  /** The leak polyline from a qbsp3 pointfile, drawn in the leak colour. */
  setLeakPath(segments: readonly LineSegment[]): void {
    this.leakSegments = segments;
    this.rebuildOverlay();
  }

  /** Group-pick mode boxes (T1.13): every group in scope in the handle colour, the hovered one in the selection colour. */
  setGroupOverlay(segments: readonly LineSegment[], hover: readonly LineSegment[]): void {
    this.groupSegments = segments;
    this.groupHoverSegments = hover;
    this.rebuildOverlay();
  }

  private rebuildOverlay(): void {
    const segments: LineSegment[] = [...this.toolSegments, ...this.linkSegments];
    // Handles are small world-space crosses at every selected brush's corners.
    for (const id of this.selected) {
      const box = this.records.get(id)?.aabb;
      if (!box) continue;
      for (const x of [box.min[0], box.max[0]]) {
        for (const y of [box.min[1], box.max[1]]) {
          for (const z of [box.min[2], box.max[2]]) {
            segments.push(
              [
                [x - 4, y, z],
                [x + 4, y, z],
              ],
              [
                [x, y - 4, z],
                [x, y + 4, z],
              ],
              [
                [x, y, z - 4],
                [x, y, z + 4],
              ],
            );
          }
        }
      }
    }
    if (segments.length === 0) {
      this.lines.remove('__overlay');
    } else {
      this.lines.write('__overlay', writeLines(segments, 0), segments.length);
    }
    if (this.invalidSegments.length === 0) {
      this.lines.remove('__overlayInvalid');
    } else {
      this.lines.write(
        '__overlayInvalid',
        writeLines(this.invalidSegments, this.invalidIndex),
        this.invalidSegments.length,
      );
    }
    if (this.leakSegments.length === 0) {
      this.lines.remove('__overlayLeak');
    } else {
      this.lines.write(
        '__overlayLeak',
        writeLines(this.leakSegments, this.leakIndex),
        this.leakSegments.length,
      );
    }
    if (this.cursorPoint === null) {
      this.lines.remove('__overlayCursor');
    } else {
      const [cx, cy, cz] = this.cursorPoint;
      const arm = 4;
      const cross: LineSegment[] = [
        [
          [cx - arm, cy, cz],
          [cx + arm, cy, cz],
        ],
        [
          [cx, cy - arm, cz],
          [cx, cy + arm, cz],
        ],
        [
          [cx, cy, cz - arm],
          [cx, cy, cz + arm],
        ],
      ];
      this.lines.write('__overlayCursor', writeLines(cross, this.cursorIndex), cross.length);
    }
    if (this.groupSegments.length === 0) {
      this.lines.remove('__overlayGroup');
    } else {
      this.lines.write(
        '__overlayGroup',
        writeLines(this.groupSegments, this.groupIndex),
        this.groupSegments.length,
      );
    }
    if (this.groupHoverSegments.length === 0) {
      this.lines.remove('__overlayGroupHover');
    } else {
      this.lines.write(
        '__overlayGroupHover',
        writeLines(this.groupHoverSegments, this.groupHoverIndex),
        this.groupHoverSegments.length,
      );
    }
    this.state[0] = STATE_SELECTED;
    this.stateDirty = true;
  }

  /** The bounds of everything drawn. */
  bounds(): Aabb | null {
    return unionAabb([...this.records.values()].map((record) => record.aabb));
  }

  /** Uploads the state texture if it changed and binds it to a texture unit. */
  bindState(unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTexture);
    if (!this.stateDirty) {
      return;
    }
    const rows = this.state.length / 4 / STATE_WIDTH;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (rows !== this.stateRowsOnGpu) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8UI,
        STATE_WIDTH,
        rows,
        0,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_BYTE,
        this.state,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.stateRowsOnGpu = rows;
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        STATE_WIDTH,
        rows,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_BYTE,
        this.state,
      );
    }
    this.stateDirty = false;
  }

  dispose(): void {
    for (const batch of this.batches.values()) {
      batch.store.dispose();
    }
    this.faceHighlight.dispose();
    this.handles.dispose();
    this.batches.clear();
    this.records.clear();
    this.lines.dispose();
    this.gl.deleteBuffer(this.cornerBuffer);
    this.gl.deleteTexture(this.stateTexture);
  }

  /**
   * The facing arrow of a point entity: a stem in the yaw direction of the
   * angle key with two barbs, drawn only when the entity has an angle.
   * Quake 2 yaw: 0 is +x (east), 90 is +y (north).
   */
  private entityAngleArrow(
    props: readonly (readonly [string, string])[],
    origin: readonly [number, number, number],
    box: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    },
  ): LineSegment[] | null {
    const raw = props.find(([k]) => k === 'angle')?.[1];
    if (raw === undefined) return null;
    const degrees = Number(raw);
    if (!Number.isFinite(degrees)) return null;
    const yaw = (degrees * Math.PI) / 180;
    const dx = Math.cos(yaw);
    const dy = Math.sin(yaw);
    const size = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1]) / 2;
    const len = size + 16;
    const tip: [number, number, number] = [origin[0] + dx * len, origin[1] + dy * len, origin[2]];
    const barbLen = len * 0.3;
    const barbAngle = (30 * Math.PI) / 180;
    const barb = (sign: number): LineSegment => {
      const a = yaw + sign * (Math.PI - barbAngle);
      const end: [number, number, number] = [
        tip[0] + Math.cos(a) * barbLen,
        tip[1] + Math.sin(a) * barbLen,
        tip[2],
      ];
      return [[tip[0], tip[1], tip[2]], end];
    };
    const start: [number, number, number] = [origin[0], origin[1], origin[2]];
    const stem: LineSegment = [start, [tip[0], tip[1], tip[2]]];
    return [stem, barb(1), barb(-1)];
  }

  /** A node inside a hidden group chain is not drawn (Qoole's group hide). */
  private isHidden(doc: Readonly<MapDocument>, id: Id): boolean {
    let at: Id | undefined = doc.parent.get(id);
    while (at !== undefined) {
      const node = doc.nodes.get(at);
      if (node?.kind === 'group' && node.hidden) return true;
      at = doc.parent.get(at);
    }
    return false;
  }

  private addNode(doc: Readonly<MapDocument>, node: MapNode): void {
    if (this.isHidden(doc, node.id)) {
      this.removeNode(node.id);
      return;
    }
    if (node.kind === 'brush') {
      const index = this.takeIndex();
      const mesh = buildBrushMesh(node, index);
      for (const part of mesh.parts) {
        this.batch(part.key, part.cls, part.texture).store.write(
          node.id,
          part.data,
          part.vertexCount,
        );
      }
      this.lines.write(node.id, mesh.lines, mesh.lineCount);
      this.records.set(node.id, {
        kind: 'brush',
        index,
        aabb: mesh.aabb,
        batchKeys: mesh.parts.map((part) => part.key),
      });
      this.setState(index, 'brush', this.selected.has(node.id), false, this.editing.has(node.id));
      return;
    }
    // A point entity: an entity without brushes, drawn as a box at its origin.
    if (node.kind !== 'entity' || node.id === doc.worldspawn || node.children.length > 0) {
      return;
    }
    const origin = entityOrigin(node.props);
    if (!origin) {
      return;
    }
    const index = this.takeIndex();
    const box = entityBox(origin);
    const wireframe = this.entityWireframeOf(node);
    let edges: LineSegment[];
    if (wireframe && wireframe.length > 0) {
      // The model replaces the box, translated to the entity origin. md2 models
      // are Z-up like the map, and frame 0 stands at the origin.
      edges = wireframe.map(
        ([a, b]) =>
          [
            [a[0] + origin[0], a[1] + origin[1], a[2] + origin[2]],
            [b[0] + origin[0], b[1] + origin[1], b[2] + origin[2]],
          ] as LineSegment,
      );
    } else {
      edges = boxEdges(box);
    }
    const arrow = this.entityAngleArrow(node.props, origin, box);
    const segments = arrow ? [...edges, ...arrow] : edges;
    this.lines.write(node.id, writeLines(segments, index), segments.length);
    this.records.set(node.id, { kind: 'entity', index, aabb: box, batchKeys: [] });
    this.setState(index, 'entity', this.selected.has(node.id), false, this.editing.has(node.id));
    this.setEntityColor(index, this.entityColorOf(node));
  }

  /** Rebuilds one node's geometry, e.g. when its model finished loading. */
  refreshNode(doc: Readonly<MapDocument>, id: Id): void {
    const node = doc.nodes.get(id);
    this.removeNode(id);
    if (node) this.addNode(doc, node);
    this.rebuildOverlay();
  }

  private removeNode(id: Id): void {
    const record = this.records.get(id);
    if (!record) {
      return;
    }
    for (const key of record.batchKeys) {
      this.batches.get(key)?.store.remove(id);
    }
    this.lines.remove(id);
    this.records.delete(id);
    // The R byte of the index's texel: GBA keep the stale class colour, which
    // is harmless because the state texture is only read through live indices.
    this.state[record.index * 4] = 0;
    this.stateDirty = true;
    this.freeIndices.push(record.index);
  }

  private batch(key: string, cls: FaceClass, texture: string): FaceBatch {
    let batch = this.batches.get(key);
    if (!batch) {
      const store = new GpuStore(this.gl, FACE_STRIDE, (buffer) => this.bindFaceAttributes(buffer));
      batch = { key, cls, texture, store };
      this.batches.set(key, batch);
    }
    return batch;
  }

  private takeIndex(): number {
    const index = this.freeIndices.pop() ?? this.nextIndex++;
    if (index >= this.state.length) {
      const grown = new Uint8Array(this.state.length * 2);
      grown.set(this.state);
      this.state = grown;
      // (stride is RGBA per node index)
    }
    return index;
  }

  private setState(
    index: number,
    kind: NodeRecord['kind'],
    selected: boolean,
    dimmed = false,
    editing = false,
  ): void {
    this.state[index * 4] =
      (kind === 'entity' ? STATE_ENTITY : 0) |
      (selected ? STATE_SELECTED : 0) |
      (dimmed ? STATE_DIMMED : 0) |
      (editing ? STATE_EDITING : 0);
    this.stateDirty = true;
  }

  /** Writes the definition colour of an entity into the state's GBA bytes. */
  private setEntityColor(index: number, rgb: readonly [number, number, number] | null): void {
    const at = index * 4;
    if (rgb) {
      this.state[at + 1] = Math.round(Math.max(0, Math.min(1, rgb[0])) * 255);
      this.state[at + 2] = Math.round(Math.max(0, Math.min(1, rgb[1])) * 255);
      this.state[at + 3] = Math.round(Math.max(0, Math.min(1, rgb[2])) * 255);
    } else {
      this.state[at + 1] = 0;
      this.state[at + 2] = 0;
      this.state[at + 3] = 0;
    }
    this.stateDirty = true;
  }

  private bindFaceAttributes(buffer: WebGLBuffer): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, FACE_STRIDE, FACE_OFFSET_POSITION);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, FACE_STRIDE, FACE_OFFSET_UV);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.BYTE, true, FACE_STRIDE, FACE_OFFSET_NORMAL);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 1, gl.UNSIGNED_INT, FACE_STRIDE, FACE_OFFSET_INDEX);
  }

  private bindLineAttributes(buffer: WebGLBuffer): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, LINE_STRIDE, LINE_OFFSET_A);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, LINE_STRIDE, LINE_OFFSET_B);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 1, gl.UNSIGNED_INT, LINE_STRIDE, LINE_OFFSET_INDEX);
    gl.vertexAttribDivisor(3, 1);
  }

  private bindHandleAttributes(buffer: WebGLBuffer): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.handleCornerBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, HANDLE_STRIDE, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, HANDLE_STRIDE, 12);
    gl.vertexAttribDivisor(2, 1);
  }
}
