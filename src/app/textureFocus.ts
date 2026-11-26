import { analyzeBrush } from '@core/geom/index';
import type { BrushNode, MapDocument } from '@core/types/index';

export interface FacePick {
  readonly brush: string;
  readonly face: number;
}

/**
 * The texture tool's focus navigation (T1.6): with a brush or a face
 * selected, the Properties panel steps through the brush as a whole and
 * then each of its faces. The sequence is [brush, face 0, …, face n−1]
 * in document face order, skipping faces with an empty derived polygon,
 * and wraps around at both ends.
 */
export interface TextureFocus {
  /** The anchor brush, or null when navigation is unavailable. */
  readonly brush: string | null;
  /** The face indices of the anchor in document order, empty polygons skipped. */
  readonly faces: readonly number[];
  /** 0 is the whole brush, i+1 is faces[i]. -1 when there is no anchor. */
  readonly position: number;
  /** The total step count: 1 (brush) + faces. 0 when there is no anchor. */
  readonly length: number;
}

/** Resolves the anchor brush: the face picks' brush, or the single selected brush. */
export function textureFocus(
  doc: Readonly<MapDocument>,
  selection: ReadonlySet<string>,
  facePicks: readonly FacePick[],
): TextureFocus {
  const none: TextureFocus = { brush: null, faces: [], position: -1, length: 0 };
  let anchor: string | null = null;
  if (facePicks.length > 0) {
    anchor = facePicks[0]!.brush;
    if (!facePicks.every((pick) => pick.brush === anchor)) {
      return none;
    }
  } else if (selection.size === 1) {
    const only = [...selection][0]!;
    if (doc.nodes.get(only)?.kind === 'brush') {
      anchor = only;
    }
  }
  if (!anchor) {
    return none;
  }
  const node = doc.nodes.get(anchor);
  if (node?.kind !== 'brush') {
    return none;
  }
  const brush = node as BrushNode;
  const polygons = analyzeBrush(brush).polygons;
  const faces: number[] = [];
  brush.faces.forEach((_face, i) => {
    const polygon = polygons[i];
    if (polygon && polygon.length >= 3) {
      faces.push(i);
    }
  });
  const length = 1 + faces.length;
  let position = 0;
  if (facePicks.length === 1) {
    const index = faces.indexOf(facePicks[0]!.face);
    if (index >= 0) {
      position = index + 1;
    }
  } else if (facePicks.length > 1) {
    // A multi-face pick has no single position; stepping starts from the brush.
    position = 0;
  }
  return { brush: anchor, faces, position, length };
}

/** The step target: -1 clears the face picks (whole brush), otherwise the face index. */
export function stepTextureFocus(focus: TextureFocus, direction: 1 | -1): number {
  if (!focus.brush || focus.length === 0) {
    return -1;
  }
  const next = (focus.position + direction + focus.length) % focus.length;
  return next === 0 ? -1 : focus.faces[next - 1]!;
}
