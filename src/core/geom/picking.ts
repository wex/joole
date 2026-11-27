import type { BrushNode, Id, Patch, Plane, Vec3 } from '@core/types/index';
import { analyzeBrush, extractWireframe, type AnalyzedBrush, type BrushWireframe } from './brush';
import { PLANE_EPS } from './constants';
import { dot, ma } from './vec3';

export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

export type PickAxis = 'xy' | 'xz' | 'yz';

export interface RayBrushHit {
  readonly id: Id;
  readonly t: number;
  readonly point: Vec3;
  /** The entering face, or null when the ray starts inside the brush. */
  readonly faceIndex: number | null;
}

export interface BrushPick2D {
  readonly id: Id;
  readonly kind: 'edge' | 'inside';
  readonly distance: number;
  /**
   * Closeness to the orthographic viewer along the hidden axis. Larger is
   * closer: +Z in Top, -Y in Front and +X in Side.
   */
  readonly closeness: number;
}

function union(a: Aabb, b: Aabb): Aabb {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  };
}

function intersects(a: Aabb, b: Aabb): boolean {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

function area(box: Aabb): number {
  const x = box.max[0] - box.min[0];
  const y = box.max[1] - box.min[1];
  const z = box.max[2] - box.min[2];
  return 2 * (x * y + x * z + y * z);
}

function rayAabb(origin: Vec3, dir: Vec3, box: Aabb): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis]!;
    const d = dir[axis]!;
    const min = box.min[axis]!;
    const max = box.max[axis]!;
    if (Math.abs(d) < 1e-15) {
      if (o < min || o > max) {
        return null;
      }
      continue;
    }
    let t1 = (min - o) / d;
    let t2 = (max - o) / d;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) {
      return null;
    }
  }
  return tmax >= 0 ? Math.max(0, tmin) : null;
}

function planesOf(brush: BrushNode): (Plane | null)[] {
  return analyzeBrush(brush).planes;
}

/** Whether every outward plane of an analyzed convex brush contains the point. */
export function containsPoint(analysis: AnalyzedBrush, point: Vec3): boolean {
  return analysis.planes.every(
    (plane) => plane !== null && dot(point, plane.n) - plane.d <= PLANE_EPS,
  );
}

/**
 * Intersects a ray with the half-space intersection of a convex brush. This
 * is the plane-side test of Qoole's HitGeometry expressed in the plane model.
 */
function rayIntersectPlanes(
  planes: readonly (Plane | null)[],
  origin: Vec3,
  direction: Vec3,
): Omit<RayBrushHit, 'id'> | null {
  let enter = -Infinity;
  let exit = Infinity;
  let enterFace: number | null = null;
  for (let i = 0; i < planes.length; i++) {
    const plane = planes[i];
    if (!plane) {
      return null;
    }
    const denom = dot(plane.n, direction);
    const dist = dot(plane.n, origin) - plane.d;
    if (Math.abs(denom) < 1e-15) {
      if (dist > PLANE_EPS) {
        return null;
      }
      continue;
    }
    const t = -dist / denom;
    if (denom < 0) {
      if (t > enter) {
        enter = t;
        enterFace = i;
      }
    } else {
      exit = Math.min(exit, t);
    }
    if (enter - exit > PLANE_EPS) {
      return null;
    }
  }
  if (exit < 0) {
    return null;
  }
  const t = enter > 0 ? enter : 0;
  return { t, point: ma(origin, direction, t), faceIndex: enter > 0 ? enterFace : null };
}

export function rayIntersectBrush(
  brush: BrushNode,
  origin: Vec3,
  direction: Vec3,
): Omit<RayBrushHit, 'id'> | null {
  return rayIntersectPlanes(planesOf(brush), origin, direction);
}

interface LeafData {
  readonly id: Id;
  readonly brush: BrushNode;
  readonly analysis: AnalyzedBrush;
  readonly wireframe: BrushWireframe;
}

interface TreeNode {
  box: Aabb;
  parent: TreeNode | null;
  left?: TreeNode;
  right?: TreeNode;
  leaf?: LeafData;
}

function isLeaf(node: TreeNode): boolean {
  return node.leaf !== undefined;
}

function leafData(id: Id, brush: BrushNode): LeafData | null {
  const analysis = analyzeBrush(brush);
  if (!analysis.aabb) {
    return null;
  }
  return { id, brush, analysis, wireframe: extractWireframe(analysis.polygons) };
}

function planarBox(axis: PickAxis, point: Vec3, tolerance: number): Aabb {
  const width = 1_000_000;
  const min: Vec3 = [point[0], point[1], point[2]];
  const max: Vec3 = [point[0], point[1], point[2]];
  const axes: [number, number] = axis === 'xy' ? [0, 1] : axis === 'xz' ? [0, 2] : [1, 2];
  for (const a of axes) {
    min[a] = min[a]! - tolerance;
    max[a] = max[a]! + tolerance;
  }
  const depth = [0, 1, 2].find((a) => !axes.includes(a))!;
  min[depth] = -width;
  max[depth] = width;
  return { min, max };
}

function project(point: Vec3, axis: PickAxis): [number, number] {
  return axis === 'xy'
    ? [point[0], point[1]]
    : axis === 'xz'
      ? [point[0], point[2]]
      : [point[1], point[2]];
}

function segmentDistance2D(point: Vec3, a: Vec3, b: Vec3, axis: PickAxis): number {
  const [px, py] = project(point, axis);
  const [ax, ay] = project(a, axis);
  const [bx, by] = project(b, axis);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const x = ax + t * dx - px;
  const y = ay + t * dy - py;
  return Math.sqrt(x * x + y * y);
}

function lineIntersectsAnalysis(analysis: AnalyzedBrush, point: Vec3, depthAxis: number): boolean {
  let enter = -Infinity;
  let exit = Infinity;
  for (const plane of analysis.planes) {
    if (!plane) {
      return false;
    }
    const denom = plane.n[depthAxis]!;
    const dist = dot(plane.n, point) - plane.d;
    if (Math.abs(denom) < 1e-15) {
      if (dist > PLANE_EPS) {
        return false;
      }
      continue;
    }
    const t = -dist / denom;
    if (denom < 0) {
      enter = Math.max(enter, t);
    } else {
      exit = Math.min(exit, t);
    }
    if (enter - exit > PLANE_EPS) {
      return false;
    }
  }
  return enter <= exit;
}

function edgeDistance(data: LeafData, point: Vec3, axis: PickAxis): number {
  let best = Infinity;
  for (const [ia, ib] of data.wireframe.edges) {
    best = Math.min(
      best,
      segmentDistance2D(point, data.wireframe.vertices[ia]!, data.wireframe.vertices[ib]!, axis),
    );
  }
  return best;
}

/** Closeness to the orthographic viewer; larger values are visually above. */
function depthCloseness(data: LeafData, axis: PickAxis): number {
  const depthAxis = axis === 'xy' ? 2 : axis === 'xz' ? 1 : 0;
  let min = Infinity;
  let max = -Infinity;
  for (const vertex of data.wireframe.vertices) {
    min = Math.min(min, vertex[depthAxis]!);
    max = Math.max(max, vertex[depthAxis]!);
  }
  // Front looks along +Y, so smaller Y is closer. Top and Side look towards
  // -Z/-X respectively, so their larger coordinate is closer.
  return axis === 'xz' ? -min : max;
}

function comparePick2D(a: BrushPick2D, b: BrushPick2D): number {
  return (
    b.closeness - a.closeness || a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * A dynamic binary AABB tree over brush geometry. Leaves cache the analyzed
 * polygons and wireframe, so ray, edge and point picking share exactly the
 * same geometry as the renderer's CPU-side mesh builder.
 */
export class BrushBvh {
  private root: TreeNode | null = null;
  private readonly leaves = new Map<Id, TreeNode>();

  get size(): number {
    return this.leaves.size;
  }

  clear(): void {
    this.root = null;
    this.leaves.clear();
  }

  insert(id: Id, brush: BrushNode): void {
    this.remove(id);
    const data = leafData(id, brush);
    if (!data || !data.analysis.aabb) {
      return;
    }
    const leaf: TreeNode = { box: data.analysis.aabb, parent: null, leaf: data };
    this.leaves.set(id, leaf);
    this.insertLeaf(leaf);
  }

  update(id: Id, brush: BrushNode): void {
    this.insert(id, brush);
  }

  remove(id: Id): void {
    const leaf = this.leaves.get(id);
    if (!leaf) {
      return;
    }
    this.leaves.delete(id);
    this.removeLeaf(leaf);
  }

  /** Incrementally applies the brush additions, replacements and removals of a document patch. */
  applyPatch(patch: Patch): void {
    for (const [id, after] of patch.after) {
      const before = patch.before.get(id);
      if (after?.kind === 'brush') {
        this.update(id, after);
      } else if (before?.kind === 'brush' && after === null) {
        this.remove(id);
      }
    }
  }

  queryAabb(box: Aabb): Id[] {
    const out: Id[] = [];
    const visit = (node: TreeNode | null) => {
      if (!node || !intersects(node.box, box)) {
        return;
      }
      if (node.leaf) {
        out.push(node.leaf.id);
        return;
      }
      visit(node.left ?? null);
      visit(node.right ?? null);
    };
    visit(this.root);
    return out;
  }

  /** All positive brush ray intersections, front to back. */
  rayHits(origin: Vec3, direction: Vec3): RayBrushHit[] {
    const hits: RayBrushHit[] = [];
    const visit = (node: TreeNode | null) => {
      if (!node || rayAabb(origin, direction, node.box) === null) {
        return;
      }
      if (node.leaf) {
        const hit = rayIntersectPlanes(node.leaf.analysis.planes, origin, direction);
        if (hit) {
          hits.push({ id: node.leaf.id, ...hit });
        }
        return;
      }
      visit(node.left ?? null);
      visit(node.right ?? null);
    };
    visit(this.root);
    return hits.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /**
   * Orthographic picking: edges nearer than tolerance win first; if no edge
   * is near, all brushes containing the world point are returned. Edge and
   * inside lists are stable so repeated clicks can cycle them.
   */
  pick2D(point: Vec3, axis: PickAxis, tolerance: number): BrushPick2D[] {
    const candidates = this.queryAabb(planarBox(axis, point, tolerance));
    const edges: BrushPick2D[] = [];
    const inside: BrushPick2D[] = [];
    for (const id of candidates) {
      const leaf = this.leaves.get(id)?.leaf;
      if (!leaf) {
        continue;
      }
      const edge = edgeDistance(leaf, point, axis);
      const closeness = depthCloseness(leaf, axis);
      if (edge <= tolerance) {
        edges.push({ id, kind: 'edge', distance: edge, closeness });
      } else {
        const depthAxis = axis === 'xy' ? 2 : axis === 'xz' ? 1 : 0;
        if (lineIntersectsAnalysis(leaf.analysis, point, depthAxis)) {
          inside.push({ id, kind: 'inside', distance: 0, closeness });
        }
      }
    }
    edges.sort(comparePick2D);
    inside.sort(comparePick2D);
    return edges.length > 0 ? edges : inside;
  }

  private insertLeaf(leaf: TreeNode): void {
    if (!this.root) {
      this.root = leaf;
      return;
    }
    let current = this.root;
    while (!isLeaf(current)) {
      const left = current.left!;
      const right = current.right!;
      const leftCost = area(union(left.box, leaf.box)) - area(left.box);
      const rightCost = area(union(right.box, leaf.box)) - area(right.box);
      current = leftCost < rightCost ? left : right;
    }
    const sibling = current;
    const parent: TreeNode = {
      box: union(sibling.box, leaf.box),
      parent: sibling.parent,
      left: sibling,
      right: leaf,
    };
    sibling.parent = parent;
    leaf.parent = parent;
    if (parent.parent) {
      if (parent.parent.left === sibling) {
        parent.parent.left = parent;
      } else {
        parent.parent.right = parent;
      }
    } else {
      this.root = parent;
    }
    this.refit(parent.parent);
  }

  private removeLeaf(leaf: TreeNode): void {
    const parent = leaf.parent;
    if (!parent) {
      this.root = null;
      return;
    }
    const sibling = parent.left === leaf ? parent.right! : parent.left!;
    const grandparent = parent.parent;
    sibling.parent = grandparent;
    if (!grandparent) {
      this.root = sibling;
    } else {
      if (grandparent.left === parent) {
        grandparent.left = sibling;
      } else {
        grandparent.right = sibling;
      }
      this.refit(grandparent);
    }
  }

  private refit(node: TreeNode | null): void {
    let current = node;
    while (current) {
      if (!isLeaf(current)) {
        current.box = union(current.left!.box, current.right!.box);
      }
      current = current.parent;
    }
  }
}

/** Cycles overlapping hit candidates when clicks repeat at the same quantized location. */
export class OverlapCycler {
  private key: string | null = null;
  private index = 0;

  choose(hits: readonly Id[], locationKey: string): Id | null {
    if (hits.length === 0) {
      this.key = locationKey;
      this.index = 0;
      return null;
    }
    if (this.key !== locationKey) {
      this.key = locationKey;
      this.index = 0;
    }
    const hit = hits[this.index % hits.length]!;
    this.index = (this.index + 1) % hits.length;
    return hit;
  }

  reset(): void {
    this.key = null;
    this.index = 0;
  }
}
