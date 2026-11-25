import type { BrushNode, Command, Id, MapDocument, MapNode, Patch } from '@core/types/index';
import { applyPatch, createId, replaceNodePatch } from '@core/doc/index';
import { analyzeBrush, flipBrush, rotate90Brush, type Aabb } from '@core/geom/index';
import { brushTargets } from './transformCommands';

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

function boundsOf(brushes: readonly BrushNode[]): Aabb | null {
  let out: Aabb | null = null;
  for (const brush of brushes) {
    const box = analyzeBrush(brush).aabb;
    if (!box) continue;
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

const axisNames = ['X', 'Y', 'Z'] as const;

/**
 * Flips the selected brushes in place across the axis-aligned plane through
 * the selection's center on that axis, so the operation is its own inverse.
 */
export function createFlipCommand(ids: readonly Id[], axis: 0 | 1 | 2): Command {
  const label = `Flip ${axisNames[axis]}`;
  return {
    label,
    run(doc) {
      const targets = brushTargets(doc, ids);
      const bounds = boundsOf(targets);
      if (!bounds) throw new Error('nothing to flip');
      const center = (bounds.min[axis]! + bounds.max[axis]!) / 2;
      const patch = emptyPatch();
      for (const brush of targets) {
        const result = flipBrush(brush, axis, center);
        if (!result.ok) throw new Error(`${label} would make brush ${brush.id} invalid`);
        mergeIndependent(patch, replaceNodePatch(doc, brush.id, result.value));
      }
      return patch;
    },
  };
}

/** Rotates the selection exactly 90° counterclockwise about Z through its center. */
export function createRotate90Command(ids: readonly Id[]): Command {
  return {
    label: 'Rotate 90°',
    run(doc) {
      const targets = brushTargets(doc, ids);
      const bounds = boundsOf(targets);
      if (!bounds) throw new Error('nothing to rotate');
      const center: readonly [number, number] = [
        (bounds.min[0] + bounds.max[0]) / 2,
        (bounds.min[1] + bounds.max[1]) / 2,
      ];
      const patch = emptyPatch();
      for (const brush of targets) {
        const result = rotate90Brush(brush, center);
        if (!result.ok) throw new Error(`Rotate 90° would make brush ${brush.id} invalid`);
        mergeIndependent(patch, replaceNodePatch(doc, brush.id, result.value));
      }
      return patch;
    },
  };
}

export interface MirrorResult {
  readonly patch: Patch;
  readonly ids: Id[];
  readonly targets: number;
}

function record(patch: Patch, id: Id, before: MapNode | null, after: MapNode | null): void {
  patch.before.set(id, before);
  patch.after.set(id, after);
}

/**
 * Qoole's mirror semantics: the selected brushes are duplicated and the
 * copies are flipped across the axis plane through the selection center. The
 * originals stay untouched; the copies become the new selection.
 */
export function mirrorSelectionPatch(
  doc: Readonly<MapDocument>,
  selection: ReadonlySet<Id>,
  axis: 0 | 1 | 2,
): MirrorResult | null {
  const targets = brushTargets(doc, [...selection]);
  if (targets.length === 0) return null;
  const bounds = boundsOf(targets);
  if (!bounds) return null;
  const center = (bounds.min[axis]! + bounds.max[axis]!) / 2;

  let patch: Patch | null = null;
  let working = doc;
  const copyIds: Id[] = [];
  for (const target of targets) {
    const flipped = flipBrush({ ...target, id: createId() }, axis, center);
    if (!flipped.ok) throw new Error(`Mirror would make brush ${target.id} invalid`);
    const copy = flipped.value;
    const parentId = working.parent.get(target.id);
    const parent = parentId ? working.nodes.get(parentId) : undefined;
    if (!parentId || !parent || parent.kind === 'brush') {
      throw new Error('mirrored brush has no container parent');
    }
    const effective = emptyPatch();
    record(effective, copy.id, null, copy);
    effective.parentBefore.set(copy.id, null);
    effective.parentAfter.set(copy.id, parentId);
    const index = parent.children.indexOf(target.id);
    const children = [...parent.children];
    children.splice(index + 1, 0, copy.id);
    record(effective, parentId, parent, { ...parent, children });
    patch = patch ? mergePatches(patch, effective) : effective;
    working = applyPatch(working, effective);
    copyIds.push(copy.id);
  }
  return patch ? { patch, ids: copyIds, targets: targets.length } : null;
}

function mergePatches(a: Patch, b: Patch): Patch {
  const out = emptyPatch();
  mergeIndependent(out, a);
  mergeIndependent(out, b);
  return out;
}
