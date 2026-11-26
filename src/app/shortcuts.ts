export type ShortcutAction =
  | 'tool-select'
  | 'tool-brush'
  | 'tool-entity'
  | 'tool-clip'
  | 'tool-vertex-edge'
  | 'tool-face'
  | 'tool-texture'
  | 'tool-entity'
  | 'undo'
  | 'redo'
  | 'save'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'hide'
  | 'lock'
  | 'grid-down'
  | 'grid-up'
  | 'next-leak'
  | 'toggle-group-pick'
  | 'group'
  | 'ungroup'
  | 'settings'
  | 'frame-selection';

export interface ShortcutInput {
  readonly key: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

/**
 * The platform-convention keyboard map. Ctrl on Windows/Linux and Cmd on
 * macOS are both normalised to `ctrl` by the UI. Tool keys never fire while
 * 3D fly mode owns WASD.
 */
export function shortcutAction(input: ShortcutInput): ShortcutAction | null {
  if (input.alt) {
    return null;
  }
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  if (input.ctrl) {
    if (key === 'z') return input.shift ? 'redo' : 'undo';
    if (key === 'y' && !input.shift) return 'redo';
    if (key === 's' && !input.shift) return 'save';
    if (key === 'x' && !input.shift) return 'cut';
    if (key === 'c' && !input.shift) return 'copy';
    if (key === 'v' && !input.shift) return 'paste';
    if (key === 'd' && !input.shift) return 'duplicate';
    if (key === 'h' && !input.shift) return 'hide';
    if (key === 'l' && !input.shift) return 'lock';
    if (key === 'g' && !input.shift) return 'group';
    if (key === ',' && !input.shift) return 'settings';
    return null;
  }
  if (input.shift) {
    if (key === 'g') return 'ungroup';
    return null;
  }
  switch (key) {
    case 'Delete':
    case 'Backspace':
      return 'delete';
    case 's':
      return 'tool-select';
    case 'b':
      return 'tool-brush';
    case 'e':
      return 'tool-entity';
    case 'c':
      return 'tool-clip';
    case 'v':
      return 'tool-vertex-edge';
    case 'f':
      return 'tool-face';
    case 't':
      return 'tool-texture';
    case '[':
      return 'grid-down';
    case ']':
      return 'grid-up';
    case 'n':
      return 'next-leak';
    case 'g':
      return 'toggle-group-pick';
    case ' ':
      return 'frame-selection';
    default:
      return null;
  }
}
