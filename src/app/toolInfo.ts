import type { EditorToolMode } from './editor';

export interface ToolInfo {
  readonly id: EditorToolMode | 'edge';
  readonly name: string;
  readonly shortcut: string;
  readonly description: string;
}

/**
 * The one table of tool metadata (T1.16): the toolbar titles and the tool
 * overlay both read it, so the texts exist in one place. `edge` is the
 * vertex tool's edge submode, toggled by pressing V again.
 */
export const TOOL_INFO: readonly ToolInfo[] = [
  {
    id: 'select',
    name: 'Select',
    shortcut: 'S',
    description: 'Click picks a brush, drag moves it. Ctrl rotates, a corner resizes.',
  },
  {
    id: 'brush',
    name: 'Brush',
    shortcut: 'B',
    description: 'Drag a rectangle in a 2D view to paint a new brush.',
  },
  {
    id: 'entity',
    name: 'Entity',
    shortcut: 'E',
    description: 'Click in a view to place the chosen entity class.',
  },
  {
    id: 'clip',
    name: 'Clip',
    shortcut: 'C',
    description: 'Click two points in a 2D view. Tab picks the side to keep, Enter clips.',
  },
  {
    id: 'vertex',
    name: 'Vertex',
    shortcut: 'V',
    description: 'Drag the corner dots to reshape the brush. V switches to edges.',
  },
  {
    id: 'edge',
    name: 'Edge',
    shortcut: 'V',
    description: 'Drag the edge-midpoint dots to reshape the brush. V switches back.',
  },
  {
    id: 'face',
    name: 'Face',
    shortcut: 'F',
    description: 'Drag the face-center dots to move whole faces.',
  },
  {
    id: 'texture',
    name: 'Texture',
    shortcut: 'T',
    description: 'Click picks faces, Ctrl is the eyedropper. Arrows shift the texture.',
  },
];

export function toolInfo(id: ToolInfo['id']): ToolInfo {
  return TOOL_INFO.find((info) => info.id === id)!;
}
