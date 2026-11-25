import type { MapDocument, MapNode, Patch } from '@core/types/index';

/**
 * Structural history-estimate constants, in bytes. These are approximate V8
 * heap sizes, not semantic sizes; the calibration is recorded in the spec.
 */
export const HISTORY_MEMORY_CONSTANTS = {
  nodeOverheadBytes: 72,
  childEntryBytes: 16,
  brushFaceBytes: 185,
  propertyEntryBytes: 16,
  stringBaseBytes: 16,
  stringBytesPerChar: 1,
} as const;

function stringBytes(text: string): number {
  return (
    HISTORY_MEMORY_CONSTANTS.stringBaseBytes +
    text.length * HISTORY_MEMORY_CONSTANTS.stringBytesPerChar
  );
}

/** The deterministic structural estimate of one immutable node version. */
export function estimateNodeBytes(node: MapNode): number {
  let bytes = HISTORY_MEMORY_CONSTANTS.nodeOverheadBytes;
  if (node.kind === 'brush') {
    bytes += node.faces.length * HISTORY_MEMORY_CONSTANTS.brushFaceBytes;
    for (const face of node.faces) {
      bytes += stringBytes(face.tex.name);
    }
    return bytes;
  }
  bytes += node.children.length * HISTORY_MEMORY_CONSTANTS.childEntryBytes;
  if (node.kind === 'group') {
    bytes += stringBytes(node.name);
  }
  for (const [key, value] of node.props) {
    bytes += HISTORY_MEMORY_CONSTANTS.propertyEntryBytes + stringBytes(key) + stringBytes(value);
  }
  return bytes;
}

/**
 * Charges a patch for the distinct node versions it retains that are no
 * longer the current document's object for that id. Identity, not deep
 * equality, is the sharing rule because document nodes are immutable.
 */
export function estimatePatchBytes(patch: Patch, doc: Readonly<MapDocument>): number {
  const charged = new Set<MapNode>();
  let bytes = 0;
  for (const versions of [patch.before, patch.after]) {
    for (const [id, node] of versions) {
      if (node === null || doc.nodes.get(id) === node || charged.has(node)) {
        continue;
      }
      charged.add(node);
      bytes += estimateNodeBytes(node);
    }
  }
  return bytes;
}
