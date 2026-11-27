import type {
  BrushNode,
  Command,
  EntityNode,
  Id,
  MapDocument,
  MapNode,
  Patch,
  Vec3,
} from '@core/types/index';
import { allBrushesOf, replaceNodePatch } from '@core/doc/index';
import {
  mat4ApplyPoint,
  snapBrushToGrid,
  transformBrush,
  transformBrushTextureLock,
  type Mat4,
} from '@core/geom/index';
import { entityOrigin, formatEntityPoint, withEntityProp } from './entities';

function emptyPatch(): Patch {
  return {
    before: new Map(),
    after: new Map(),
    parentBefore: new Map(),
    parentAfter: new Map(),
  };
}

function mergeIndependent(into: Patch, patch: Patch): void {
  for (const [id, node] of patch.before) into.before.set(id, node);
  for (const [id, node] of patch.after) into.after.set(id, node);
  for (const [id, node] of patch.parentBefore) into.parentBefore.set(id, node);
  for (const [id, node] of patch.parentAfter) into.parentAfter.set(id, node);
}

/** Brush descendants of the requested nodes, deduplicated when a group and its child are both selected. */
export function brushTargets(doc: Readonly<MapDocument>, ids: readonly Id[]): BrushNode[] {
  const out = new Map<Id, BrushNode>();
  for (const id of ids) {
    const node: MapNode | undefined = doc.nodes.get(id);
    if (!node) {
      continue;
    }
    if (node.kind === 'brush') {
      out.set(id, node);
    } else {
      for (const brush of allBrushesOf(doc, id)) {
        out.set(brush.id, brush);
      }
    }
  }
  return [...out.values()];
}

/** Point entities at or below the requested nodes, deduplicated. */
export function pointEntityTargets(doc: Readonly<MapDocument>, ids: readonly Id[]): EntityNode[] {
  const out = new Map<Id, EntityNode>();
  const visit = (id: Id, depth: number): void => {
    if (depth > 64) return;
    const node: MapNode | undefined = doc.nodes.get(id);
    if (!node || node.kind === 'brush') return;
    if (node.kind === 'entity' && id !== doc.worldspawn && node.children.length === 0) {
      if (entityOrigin(node)) out.set(id, node);
    }
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const id of ids) visit(id, 0);
  return [...out.values()];
}

/**
 * Creates a move/rotate/scale command. Groups and entities are expanded to
 * their descendant brushes because the document has no local transform
 * matrices; point-entity origins are transformed as positions.
 */
export interface TransformOptions {
  readonly mergeKey?: string;
  /** Texture lock: recompute texture parameters so textures stick to the surface. */
  readonly textureLock?: boolean;
  /** Reports the worst texture lock error in texels when it exceeds the limit. */
  readonly onLockWarning?: (errorTexels: number) => void;
}

export function createTransformCommand(
  label: string,
  ids: readonly Id[],
  matrix: Mat4,
  mergeKeyOrOptions?: string | TransformOptions,
): Command {
  const options: TransformOptions =
    typeof mergeKeyOrOptions === 'string'
      ? { mergeKey: mergeKeyOrOptions }
      : (mergeKeyOrOptions ?? {});
  return {
    label,
    mergeKey: options.mergeKey,
    run(doc) {
      const patch = emptyPatch();
      let worstError = 0;
      let flagged = 0;
      for (const brush of brushTargets(doc, ids)) {
        if (options.textureLock) {
          const result = transformBrushTextureLock(brush, matrix);
          if (!result.ok) {
            throw new Error(`${label} would make brush ${brush.id} invalid`);
          }
          worstError = Math.max(worstError, result.value.maxErrorTexels);
          flagged += result.value.flaggedFaces.length;
          mergeIndependent(patch, replaceNodePatch(doc, brush.id, result.value.brush));
        } else {
          const result = transformBrush(brush, matrix);
          if (!result.ok) {
            throw new Error(`${label} would make brush ${brush.id} invalid`);
          }
          mergeIndependent(patch, replaceNodePatch(doc, brush.id, result.value));
        }
      }
      for (const entity of pointEntityTargets(doc, ids)) {
        const origin = entityOrigin(entity);
        if (!origin) continue;
        const moved = mat4ApplyPoint(matrix, origin);
        mergeIndependent(
          patch,
          replaceNodePatch(
            doc,
            entity.id,
            withEntityProp(entity, 'origin', formatEntityPoint(moved)),
          ),
        );
      }
      if (flagged > 0 && options.onLockWarning) {
        options.onLockWarning(worstError);
      }
      return patch;
    },
  };
}

/** Explicit snap command; there is deliberately no automatic rounding after rotations. */
export function createSnapToGridCommand(ids: readonly Id[], grid: number): Command {
  return {
    label: 'Snap to grid',
    run(doc) {
      const patch = emptyPatch();
      for (const brush of brushTargets(doc, ids)) {
        const result = snapBrushToGrid(brush, grid);
        if (!result.ok) {
          throw new Error(`Snap to grid would make brush ${brush.id} invalid`);
        }
        mergeIndependent(patch, replaceNodePatch(doc, brush.id, result.value));
      }
      for (const entity of pointEntityTargets(doc, ids)) {
        const origin = entityOrigin(entity);
        if (!origin) continue;
        const snapped = origin.map((value) => Math.round(value / grid) * grid) as Vec3;
        mergeIndependent(
          patch,
          replaceNodePatch(
            doc,
            entity.id,
            withEntityProp(entity, 'origin', formatEntityPoint(snapped)),
          ),
        );
      }
      return patch;
    },
  };
}
