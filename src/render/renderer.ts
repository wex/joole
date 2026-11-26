import { dot } from '@core/geom/index';
import type { Mat4 } from '@core/geom/index';
import type { MapNode, Id, MapDocument, Patch, Vec3 } from '@core/types/index';
import type { FaceClass } from './brushMesh';
import {
  aabbInFrustum,
  framePerspective,
  frustumPlanes,
  orthoBasis,
  toGlMatrix,
  viewProjection,
  type Aabb,
  type Camera,
  type OrthoCamera,
} from './camera';
import { readViewportColors, type Rgba, type ViewportColors } from './colors';
import { GeometryCache, type FaceBatch } from './geometryCache';
import { createProgram, uniformLocations, type Uniforms } from './gl';
import { glRect, layoutViews, VIEW_ORDER, type ViewId, type ViewRect } from './layout';
import { TextureManager, type TextureLoader } from './textures';
import faceFragment from './shaders/face.frag.glsl?raw';
import faceVertex from './shaders/face.vert.glsl?raw';
import gridFragment from './shaders/grid.frag.glsl?raw';
import gridVertex from './shaders/grid.vert.glsl?raw';
import lineFragment from './shaders/line.frag.glsl?raw';
import lineVertex from './shaders/line.vert.glsl?raw';

/** The draw modes of the 3D view. */
export type Mode3d = 'wireframe' | 'flat' | 'textured';

/** Whether nodraw, clip, hint and skip faces are dimmed or hidden in 3D. */
export type ToolFaceMode = 'dim' | 'hide';

export interface RendererOptions {
  /** Loads textures for the textured mode; without it, faces show the checker. */
  readonly loadTexture?: TextureLoader;
  /** The element whose computed style holds the design tokens. */
  readonly colorSource?: Element;
  /** The wireframe line width in CSS pixels. */
  readonly lineWidth?: number;
  /** The gap between the four views in CSS pixels: the splitter size. */
  readonly gap?: number;
  /** Class colour lookup for point entities (0..1 rgb). */
  readonly entityColorOf?: (node: MapNode) => readonly [number, number, number] | null;
  readonly entityWireframeOf?: (
    node: MapNode,
  ) =>
    | readonly (readonly [readonly [number, number, number], readonly [number, number, number]])[]
    | null;
}

export interface RendererStats {
  readonly frames: number;
  readonly nodes: number;
  readonly batches: number;
  readonly pendingTextures: number;
  readonly textures: readonly { name: string; width: number; height: number }[];
}

/** The 2D view axes: Top is XY, Front is XZ and Side is YZ. */
export const VIEW_AXES = { top: 'xy', front: 'xz', side: 'yz' } as const;

/** The design system's size-splitter. */
const DEFAULT_GAP = 4;
const STATE_UNIT = 1;
const TOOL_FACE_OPACITY = 0.35;
const FACE_OPACITY: Readonly<Record<FaceClass, number>> = {
  opaque: 1,
  sky: 1,
  trans33: 0.33,
  trans66: 0.66,
  tool: TOOL_FACE_OPACITY,
};

const FACE_UNIFORMS = [
  'uViewProjection',
  'uTextureSize',
  'uState',
  'uTexture',
  'uColor',
  'uTextured',
  'uShaded',
  'uSelectColor',
] as const;
const LINE_UNIFORMS = [
  'uViewProjection',
  'uViewportSize',
  'uWidth',
  'uPass',
  'uEntitiesOnly',
  'uState',
  'uBrushColor',
  'uEntityColor',
  'uSelectColor',
  'uInvalidColor',
  'uLeakColor',
  'uHandleColor',
] as const;
const GRID_UNIFORMS = [
  'uViewportOrigin',
  'uWorldOrigin',
  'uUnitsPerPixel',
  'uGridSize',
  'uMajorA',
  'uMajorB',
  'uBackground',
  'uMinorColor',
  'uMajorColor',
  'uAxisColor',
] as const;

interface Program<T extends string> {
  readonly program: WebGLProgram;
  readonly uniforms: Uniforms<T>;
}

function defaultCamera(view: ViewId): Camera {
  if (view === '3d') {
    return framePerspective(null, 1);
  }
  return { kind: 'ortho', axis: VIEW_AXES[view], center: [0, 0, 0], zoom: 1 };
}

/**
 * Draws the document in four views from one WebGL2 context and one canvas,
 * with gl.scissor and gl.viewport (spec, Rendering with WebGL2). It accepts
 * only core types and camera data, and draws only on demand: every change
 * calls invalidate(), which schedules a single frame.
 */
export class Renderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly cache: GeometryCache;
  private readonly textures: TextureManager;
  private readonly face: Program<(typeof FACE_UNIFORMS)[number]>;
  private readonly line: Program<(typeof LINE_UNIFORMS)[number]>;
  private readonly grid: Program<(typeof GRID_UNIFORMS)[number]>;
  private readonly emptyVao: WebGLVertexArrayObject;
  private readonly multiDraw: WEBGL_multi_draw | null;
  private readonly resizeObserver: ResizeObserver;
  private readonly colorSource: Element;
  private readonly lineWidth: number;
  private readonly gap: number;
  private readonly matrix = new Float32Array(16);
  private readonly cameras = new Map<ViewId, Camera>(
    VIEW_ORDER.map((view) => [view, defaultCamera(view)]),
  );
  private colors: ViewportColors;
  private doc: Readonly<MapDocument> | null = null;
  private mode3d: Mode3d = 'textured';
  private toolFaces: ToolFaceMode = 'dim';
  private maximized: ViewId | null = null;
  private gridSize = 8;
  private frameRequest: number | null = null;
  private frames = 0;
  private idleWaiters: (() => void)[] = [];
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: RendererOptions = {},
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: true,
      premultipliedAlpha: false,
    });
    if (!gl) {
      throw new Error('WebGL2 is not available');
    }
    this.gl = gl;
    this.colorSource = options.colorSource ?? document.documentElement;
    this.lineWidth = options.lineWidth ?? 1;
    this.gap = options.gap ?? DEFAULT_GAP;
    this.colors = readViewportColors(getComputedStyle(this.colorSource));
    this.multiDraw = gl.getExtension('WEBGL_multi_draw');

    const face = createProgram(gl, faceVertex, faceFragment);
    const line = createProgram(gl, lineVertex, lineFragment);
    const grid = createProgram(gl, gridVertex, gridFragment);
    this.face = { program: face, uniforms: uniformLocations(gl, face, FACE_UNIFORMS) };
    this.line = { program: line, uniforms: uniformLocations(gl, line, LINE_UNIFORMS) };
    this.grid = { program: grid, uniforms: uniformLocations(gl, grid, GRID_UNIFORMS) };
    this.emptyVao = gl.createVertexArray();

    this.cache = new GeometryCache(gl, options.entityColorOf, options.entityWireframeOf);
    this.textures = new TextureManager(
      gl,
      options.loadTexture ?? null,
      () => this.invalidate(),
      this.placeholderColors(),
    );

    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) {
        return;
      }
      const box = entry.devicePixelContentBoxSize?.[0];
      const ratio = window.devicePixelRatio || 1;
      const width = box ? box.inlineSize : Math.round(entry.contentRect.width * ratio);
      const height = box ? box.blockSize : Math.round(entry.contentRect.height * ratio);
      this.resize(width, height);
    });
    this.resizeObserver.observe(canvas);
    const ratio = window.devicePixelRatio || 1;
    this.resize(Math.round(canvas.clientWidth * ratio), Math.round(canvas.clientHeight * ratio));
  }

  setDocument(doc: Readonly<MapDocument>): void {
    this.doc = doc;
    this.cache.setDocument(doc);
    this.invalidate();
  }

  /** Updates only the nodes a patch reports; doc is the state after it. */
  applyPatch(doc: Readonly<MapDocument>, patch: Patch): void {
    this.doc = doc;
    this.cache.applyPatch(doc, patch);
    this.invalidate();
  }

  setSelection(ids: Iterable<Id>): void {
    if (this.doc) {
      this.cache.setSelection(this.doc, ids);
      this.invalidate();
    }
  }

  /** Draws the qbsp3 leak polyline in the leak colour (empty clears it). */
  setLeakPath(segments: readonly (readonly [Vec3, Vec3])[]): void {
    this.cache.setLeakPath(segments);
  }

  /** Rebuilds one node's geometry, e.g. when its model finished loading. */
  refreshNode(id: string): void {
    if (!this.doc) return;
    this.cache.refreshNode(this.doc, id);
  }

  /** Dims everything outside the entered scope (null clears the scope). */
  setScope(scopeId: string | null): void {
    if (!this.doc) return;
    this.cache.setScope(this.doc, scopeId);
  }

  /** Transient editing lines: ghost previews and drag rectangles. */
  setToolPreview(
    segments: readonly (readonly [Vec3, Vec3])[],
    invalid: readonly (readonly [Vec3, Vec3])[] = [],
  ): void {
    if (this.cache.setToolPreview(segments, invalid)) {
      this.invalidate();
    }
  }

  /** The snapped-cursor cross of the creation tools (null hides it). */
  setCursor(point: Vec3 | null): void {
    if (this.cache.setCursor(point)) {
      this.invalidate();
    }
  }

  /** The texture tool's picked faces: a translucent fill in 3D, outlines in 2D. */
  setFaceHighlight(polygons: readonly (readonly Vec3[])[]): void {
    if (this.cache.setFaceHighlight(polygons)) {
      this.invalidate();
    }
  }

  /** Persistent target–targetname link lines in the 2D views. */
  setTargetLinks(segments: readonly (readonly [Vec3, Vec3])[]): void {
    this.cache.setTargetLinks(segments);
  }

  setCamera(view: ViewId, camera: Camera): void {
    this.cameras.set(view, camera);
    this.invalidate();
  }

  getCamera(view: ViewId): Camera {
    return this.cameras.get(view)!;
  }

  setMode3d(mode: Mode3d): void {
    this.mode3d = mode;
    this.invalidate();
  }

  setToolFaces(mode: ToolFaceMode): void {
    this.toolFaces = mode;
    this.invalidate();
  }

  /** Maximises one view to the whole canvas, or restores the 2 × 2 grid. */
  setMaximized(view: ViewId | null): void {
    this.maximized = view;
    this.invalidate();
  }

  /** The grid size of the 2D views in units: a power of two from 1 to 256. */
  setGridSize(size: number): void {
    this.gridSize = size;
    this.invalidate();
  }

  /** Re-requests every texture, used when game data becomes available. */
  reloadTextures(): void {
    this.textures.reset();
    this.invalidate();
  }

  /** Re-reads the design tokens; call it whenever the theme changes. */
  refreshColors(): void {
    this.colors = readViewportColors(getComputedStyle(this.colorSource));
    this.textures.setPlaceholderColors(this.placeholderColors());
    this.invalidate();
  }

  /**
   * The ratio of canvas backing-store pixels to CSS pixels. This is not
   * necessarily window.devicePixelRatio: the backing store is sized from
   * devicePixelContentBoxSize, and the two disagree wherever the browser
   * rasterises the canvas 1:1 despite a higher devicePixelRatio. Input
   * conversion must use this ratio so the picking maths always matches what
   * is actually on screen.
   */
  backingRatio(): number {
    const css = this.canvas.getBoundingClientRect().width;
    return css > 0 && this.canvas.width > 0 ? this.canvas.width / css : 1;
  }

  /** The view rectangles in device pixels with a top-left origin. */
  viewRects(): Map<ViewId, ViewRect> {
    const ratio = window.devicePixelRatio || 1;
    return layoutViews(this.canvas.width, this.canvas.height, this.maximized, this.gap * ratio);
  }

  /** The bounds of everything drawn, for framing the cameras. */
  bounds(): Aabb | null {
    return this.cache.bounds();
  }

  stats(): RendererStats {
    return {
      frames: this.frames,
      nodes: this.cache.records.size,
      batches: this.cache.batches.size,
      pendingTextures: this.textures.pending,
      textures: this.textures.loadedTextures(),
    };
  }

  /** Schedules one frame. Nothing is drawn without a change. */
  invalidate(): void {
    if (this.frameRequest === null && !this.disposed) {
      this.frameRequest = requestAnimationFrame(() => this.draw());
    }
  }

  /** Resolves after a frame when no frame is scheduled and no texture is loading. */
  whenIdle(): Promise<void> {
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
      if (this.frames > 0) {
        this.settleIdle();
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameRequest !== null) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }
    this.resizeObserver.disconnect();
    this.cache.dispose();
    this.textures.dispose();
    const gl = this.gl;
    gl.deleteProgram(this.face.program);
    gl.deleteProgram(this.line.program);
    gl.deleteProgram(this.grid.program);
    gl.deleteVertexArray(this.emptyVao);
  }

  private placeholderColors(): readonly [Rgba, Rgba] {
    return [this.colors['vp-scope-dim'], this.colors['vp-label']];
  }

  private resize(width: number, height: number): void {
    if (width > 0 && height > 0 && (this.canvas.width !== width || this.canvas.height !== height)) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.invalidate();
  }

  private settleIdle(): void {
    if (this.frameRequest === null && this.textures.pending === 0) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }

  private draw(): void {
    this.frameRequest = null;
    const gl = this.gl;
    const { width, height } = this.canvas;
    const surface = this.colors['surface-0'];
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, width, height);
    gl.clearColor(surface[0], surface[1], surface[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    this.cache.bindState(STATE_UNIT);

    const background = this.colors['vp-bg'];
    for (const [view, rect] of this.viewRects()) {
      if (rect.width < 1 || rect.height < 1) {
        continue;
      }
      const [x, y, w, h] = glRect(rect, height);
      gl.viewport(x, y, w, h);
      gl.scissor(x, y, w, h);
      gl.clearColor(background[0], background[1], background[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const camera = this.cameras.get(view)!;
      const vp = viewProjection(camera, w, h);
      if (camera.kind === 'ortho') {
        this.drawGrid(camera, x, y, w, h);
        this.drawLines(vp, w, h, false);
      } else {
        this.draw3d(vp, w, h);
      }
    }
    gl.disable(gl.SCISSOR_TEST);
    this.frames++;
    this.settleIdle();
  }

  private drawGrid(camera: OrthoCamera, x: number, y: number, w: number, h: number): void {
    const gl = this.gl;
    const { program, uniforms: u } = this.grid;
    const { right, up } = orthoBasis(camera.axis);
    const unitsPerPixel = 1 / camera.zoom;
    const grid = this.gridSize;
    gl.useProgram(program);
    gl.uniform2f(u.uViewportOrigin, x, y);
    gl.uniform2f(
      u.uWorldOrigin,
      dot(camera.center, right) - (w / 2) * unitsPerPixel,
      dot(camera.center, up) - (h / 2) * unitsPerPixel,
    );
    gl.uniform1f(u.uUnitsPerPixel, unitsPerPixel);
    gl.uniform1f(u.uGridSize, grid);
    gl.uniform1f(u.uMajorA, grid * 8);
    gl.uniform1f(u.uMajorB, grid < 64 ? 64 : grid * 8);
    gl.uniform4fv(u.uBackground, this.colors['vp-bg']);
    gl.uniform4fv(u.uMinorColor, this.colors['vp-grid-minor']);
    gl.uniform4fv(u.uMajorColor, this.colors['vp-grid-major']);
    gl.uniform4fv(u.uAxisColor, this.colors['vp-axis']);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawLines(vp: Mat4, w: number, h: number, entitiesOnly: boolean): void {
    const count = this.cache.lines.drawCount;
    if (count === 0) {
      return;
    }
    const gl = this.gl;
    const { program, uniforms: u } = this.line;
    gl.useProgram(program);
    gl.uniformMatrix4fv(u.uViewProjection, false, toGlMatrix(vp, this.matrix));
    gl.uniform2f(u.uViewportSize, w, h);
    gl.uniform1f(u.uWidth, this.lineWidth * this.backingRatio());
    gl.uniform1i(u.uEntitiesOnly, entitiesOnly ? 1 : 0);
    gl.uniform1i(u.uState, STATE_UNIT);
    gl.uniform4fv(u.uBrushColor, this.colors['vp-brush']);
    gl.uniform4fv(u.uEntityColor, this.colors['vp-entity']);
    gl.uniform4fv(u.uSelectColor, this.colors['vp-select']);
    gl.uniform4fv(u.uInvalidColor, this.colors['vp-invalid']);
    gl.uniform4fv(u.uHandleColor, this.colors['vp-handle']);
    gl.uniform4fv(u.uLeakColor, this.colors['vp-leak']);
    gl.bindVertexArray(this.cache.lines.vao);
    for (const pass of [0, 1]) {
      gl.uniform1i(u.uPass, pass);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    }
  }

  private draw3d(vp: Mat4, w: number, h: number): void {
    if (this.mode3d === 'wireframe') {
      this.drawLines(vp, w, h, false);
      return;
    }
    const gl = this.gl;
    const planes = frustumPlanes(vp);
    const visible = new Set<Id>();
    for (const [id, record] of this.cache.records) {
      if (record.kind === 'brush' && record.aabb && aabbInFrustum(planes, record.aabb)) {
        visible.add(id);
      }
    }
    const { program, uniforms: u } = this.face;
    gl.useProgram(program);
    gl.uniformMatrix4fv(u.uViewProjection, false, toGlMatrix(vp, this.matrix));
    gl.uniform1i(u.uState, STATE_UNIT);
    gl.uniform1i(u.uTexture, 0);
    gl.uniform4fv(u.uSelectColor, this.colors['vp-select']);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    // Opaque faces and sky first, then the transparent and tool faces last,
    // blended over them without writing depth.
    const batches = [...this.cache.batches.values()];
    for (const batch of batches) {
      if (batch.cls === 'opaque' || batch.cls === 'sky') {
        this.drawBatch(batch, visible);
      }
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const batch of batches) {
      const transparent = batch.cls === 'trans33' || batch.cls === 'trans66';
      if (transparent || (batch.cls === 'tool' && this.toolFaces === 'dim')) {
        this.drawBatch(batch, visible);
      }
    }
    // The texture tool's picked faces: a translucent vp-select fill over
    // the faces themselves, depth-tested but not writing depth.
    const highlightCount = this.cache.faceHighlight.drawCount;
    if (highlightCount > 0) {
      const select = this.colors['vp-select'];
      gl.uniform1i(u.uTextured, 0);
      gl.uniform1i(u.uShaded, 0);
      gl.uniform4f(u.uColor, select[0], select[1], select[2], 0.35);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1, -1);
      gl.bindVertexArray(this.cache.faceHighlight.vao);
      gl.drawArrays(gl.TRIANGLES, 0, highlightCount);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    // Point entity boxes, hidden behind the walls in front of them.
    this.drawLines(vp, w, h, true);
    gl.disable(gl.DEPTH_TEST);
  }

  private drawBatch(batch: FaceBatch, visible: ReadonlySet<Id>): void {
    const ranges: [number, number][] = [];
    for (const [id, range] of batch.store.ranges) {
      if (visible.has(id)) {
        ranges.push([range.offset, range.count]);
      }
    }
    if (ranges.length === 0) {
      return;
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const firsts: number[] = [];
    const counts: number[] = [];
    for (const [offset, count] of ranges) {
      const last = firsts.length - 1;
      if (last >= 0 && firsts[last]! + counts[last]! === offset) {
        counts[last]! += count;
      } else {
        firsts.push(offset);
        counts.push(count);
      }
    }

    const gl = this.gl;
    const u = this.face.uniforms;
    const opacity = FACE_OPACITY[batch.cls];
    if (batch.cls === 'sky' || batch.cls === 'tool') {
      const color = this.colors[batch.cls === 'sky' ? 'vp-sky' : 'vp-toolface'];
      gl.uniform1i(u.uTextured, 0);
      gl.uniform1i(u.uShaded, batch.cls === 'tool' ? 1 : 0);
      gl.uniform4f(u.uColor, color[0], color[1], color[2], opacity);
    } else if (this.mode3d === 'textured') {
      const texture = this.textures.get(batch.texture);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.uniform2f(u.uTextureSize, texture.width, texture.height);
      gl.uniform1i(u.uTextured, 1);
      gl.uniform1i(u.uShaded, 1);
      gl.uniform4f(u.uColor, 1, 1, 1, opacity);
    } else {
      const color = this.colors['vp-brush'];
      gl.uniform1i(u.uTextured, 0);
      gl.uniform1i(u.uShaded, 1);
      gl.uniform4f(u.uColor, color[0], color[1], color[2], opacity);
    }
    gl.bindVertexArray(batch.store.vao);
    if (this.multiDraw) {
      this.multiDraw.multiDrawArraysWEBGL(gl.TRIANGLES, firsts, 0, counts, 0, firsts.length);
    } else {
      for (let i = 0; i < firsts.length; i++) {
        gl.drawArrays(gl.TRIANGLES, firsts[i]!, counts[i]!);
      }
    }
  }
}
