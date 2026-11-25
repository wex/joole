import { applyPatch, createId, mergePatches } from '@core/doc/index';
import { analyzeBrush, intersectBrushes, subtractBrush } from '@core/geom/index';
import { PLANE_EPS } from '@core/geom/constants';
import type { BrushNode, Id, MapDocument, MapNode, Patch } from '@core/types/index';

export interface CsgSubtractResult {
  readonly patch: Patch;
  readonly ids: Id[];
  readonly targets: number;
}

function aabbOverlap(a: BrushNode, b: BrushNode): boolean {
  const aa = analyzeBrush(a).aabb;
  const bb = analyzeBrush(b).aabb;
  if (!aa || !bb) return false;
  return [0, 1, 2].every(
    (axis) =>
      aa.min[axis]! < bb.max[axis]! - PLANE_EPS && bb.min[axis]! < aa.max[axis]! - PLANE_EPS,
  );
}

function record(patch: Patch, id: Id, before: MapNode | null, after: MapNode | null): void {
  patch.before.set(id, before);
  patch.after.set(id, after);
}

function emptyPatch(): Patch {
  return { before: new Map(), after: new Map(), parentBefore: new Map(), parentAfter: new Map() };
}

/**
 * Builds Qoole's CSG Subtract edit: the selected brushes are cutters and
 * every overlapping non-selected brush in the document is cut. The first
 * fragment keeps the target id; later fragments receive fresh ids.
 */
export function subtractSelectionPatch(
  doc: Readonly<MapDocument>,
  selection: ReadonlySet<Id>,
): CsgSubtractResult | null {
  const cutters = [...selection]
    .map((id) => doc.nodes.get(id))
    .filter((node): node is BrushNode => node?.kind === 'brush');
  if (cutters.length === 0) return null;
  const targets = [...doc.nodes.values()].filter(
    (node): node is BrushNode => node.kind === 'brush' && !selection.has(node.id),
  );

  let patch: Patch | null = null;
  let working = doc;
  const fragmentIds: Id[] = [];
  let changedTargets = 0;

  for (const target of targets) {
    const activeCutters = cutters.filter((cutter) => aabbOverlap(target, cutter));
    if (activeCutters.length === 0) continue;
    let pieces: BrushNode[] = [target];
    for (const cutter of activeCutters) {
      const next: BrushNode[] = [];
      for (const piece of pieces) {
        const result = subtractBrush(piece, cutter);
        if (!result.ok) throw new Error(`CSG subtract failed: ${result.error}`);
        next.push(...result.value);
      }
      pieces = next;
    }
    const removedVolume =
      analyzeBrush(target).volume -
      pieces.reduce((sum, piece) => sum + analyzeBrush(piece).volume, 0);
    if (removedVolume <= PLANE_EPS) continue;

    const parentId = working.parent.get(target.id);
    const parent = parentId ? working.nodes.get(parentId) : undefined;
    if (!parentId || !parent || parent.kind === 'brush')
      throw new Error('target brush has no container parent');

    const ids = pieces.map((_, index) => (index === 0 ? target.id : createId()));
    const replacements = pieces.map((piece, index) => ({ ...piece, id: ids[index]! }));
    const children = parent.children.flatMap((child) => (child === target.id ? ids : [child]));
    const effective = emptyPatch();
    record(effective, target.id, target, replacements[0] ?? null);
    effective.parentBefore.set(target.id, parentId);
    effective.parentAfter.set(target.id, replacements.length > 0 ? parentId : null);
    for (let i = 1; i < replacements.length; i++) {
      record(effective, replacements[i]!.id, null, replacements[i]!);
      effective.parentBefore.set(replacements[i]!.id, null);
      effective.parentAfter.set(replacements[i]!.id, parentId);
    }
    record(effective, parentId, parent, { ...parent, children });
    patch = patch ? mergePatches(patch, effective) : effective;
    working = applyPatch(working, effective);
    fragmentIds.push(...ids);
    changedTargets++;
  }
  return patch ? { patch, ids: fragmentIds, targets: changedTargets } : null;
}

/**
 * Builds Qoole's CSG Intersect edit: all selected brushes are replaced by
 * their single convex intersection. The current document has no scope support
 * yet, so the brushes must share one container parent.
 */
export function intersectSelectionPatch(
  doc: Readonly<MapDocument>,
  selection: ReadonlySet<Id>,
): CsgSubtractResult | null {
  const brushes = [...selection]
    .map((id) => doc.nodes.get(id))
    .filter((node): node is BrushNode => node?.kind === 'brush');
  if (brushes.length < 2) return null;
  const parentId = doc.parent.get(brushes[0]!.id);
  if (!parentId || brushes.some((brush) => doc.parent.get(brush.id) !== parentId)) return null;
  const parent = doc.nodes.get(parentId);
  if (!parent || parent.kind === 'brush') return null;
  const intersection = intersectBrushes(brushes);
  if (!intersection.ok) return null;

  const keepId = brushes[0]!.id;
  const replacement: BrushNode = { ...intersection.value, id: keepId };
  const effective = emptyPatch();
  record(effective, keepId, brushes[0]!, replacement);
  effective.parentBefore.set(keepId, parentId);
  effective.parentAfter.set(keepId, parentId);
  for (const brush of brushes.slice(1)) {
    record(effective, brush.id, brush, null);
    effective.parentBefore.set(brush.id, parentId);
    effective.parentAfter.set(brush.id, null);
  }
  const removed = new Set(brushes.slice(1).map((brush) => brush.id));
  record(effective, parentId, parent, {
    ...parent,
    children: parent.children.filter((child) => !removed.has(child)),
  });
  return { patch: effective, ids: [keepId], targets: brushes.length };
}
