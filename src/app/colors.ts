/**
 * The configurable colour tokens (T15.10): every colour of the editor
 * with its default per theme. The unit test keeps this catalogue in step
 * with docs/design-system/tokens.json; shadows, spacing, sizes and fonts
 * are not colours and are not configurable.
 */
export interface ColorToken {
  readonly name: string;
  readonly label: string;
  readonly group: 'views' | 'interface';
  readonly dark: string;
  readonly light: string;
}

export const COLOR_TOKENS: readonly ColorToken[] = [
  { name: 'surface-0', label: 'Surface 0', group: 'interface', dark: '#101214', light: '#b8bcc2' },
  { name: 'surface-1', label: 'Surface 1', group: 'interface', dark: '#1a1d21', light: '#d9dce0' },
  { name: 'surface-2', label: 'Surface 2', group: 'interface', dark: '#252a30', light: '#eef0f2' },
  { name: 'surface-3', label: 'Surface 3', group: 'interface', dark: '#313740', light: '#ffffff' },
  { name: 'line', label: 'Line', group: 'interface', dark: '#3a4049', light: '#9aa0a8' },
  {
    name: 'line-strong',
    label: 'Line strong',
    group: 'interface',
    dark: '#6b7380',
    light: '#5f6670',
  },
  { name: 'ink', label: 'Ink', group: 'interface', dark: '#e7eaee', light: '#14171a' },
  { name: 'ink-muted', label: 'Ink muted', group: 'interface', dark: '#9ba3ae', light: '#4c535c' },
  {
    name: 'ink-disabled',
    label: 'Ink disabled',
    group: 'interface',
    dark: '#6a717b',
    light: '#7c838c',
  },
  { name: 'accent', label: 'Accent', group: 'interface', dark: '#7b93ff', light: '#2c43b8' },
  { name: 'on-accent', label: 'On accent', group: 'interface', dark: '#0b1030', light: '#ffffff' },
  {
    name: 'accent-soft',
    label: 'Accent soft',
    group: 'interface',
    dark: '#252f5c',
    light: '#d4dafb',
  },
  {
    name: 'focus-ring',
    label: 'Focus ring',
    group: 'interface',
    dark: '#a9b8ff',
    light: '#1e33a3',
  },
  { name: 'select', label: 'Select', group: 'interface', dark: '#cf2b22', light: '#c8261d' },
  { name: 'on-select', label: 'On select', group: 'interface', dark: '#ffffff', light: '#ffffff' },
  { name: 'warn', label: 'Warn', group: 'interface', dark: '#f0a43a', light: '#8a5300' },
  { name: 'error', label: 'Error', group: 'interface', dark: '#ff7a70', light: '#b3261e' },
  { name: 'ok', label: 'Ok', group: 'interface', dark: '#5cc8ff', light: '#0b5e91' },
  { name: 'vp-bg', label: 'Viewport bg', group: 'views', dark: '#000000', light: '#000000' },
  {
    name: 'vp-grid-minor',
    label: 'Viewport grid minor',
    group: 'views',
    dark: '#262626',
    light: '#262626',
  },
  {
    name: 'vp-grid-major',
    label: 'Viewport grid major',
    group: 'views',
    dark: '#4d4d4d',
    light: '#4d4d4d',
  },
  { name: 'vp-axis', label: 'Viewport axis', group: 'views', dark: '#6e6a32', light: '#6e6a32' },
  { name: 'vp-brush', label: 'Viewport brush', group: 'views', dark: '#e6e6e6', light: '#e6e6e6' },
  {
    name: 'vp-select',
    label: 'Viewport select',
    group: 'views',
    dark: '#ff2b1f',
    light: '#ff2b1f',
  },
  {
    name: 'vp-entity',
    label: 'Viewport entity',
    group: 'views',
    dark: '#3ccaff',
    light: '#3ccaff',
  },
  {
    name: 'vp-target',
    label: 'Viewport target',
    group: 'views',
    dark: '#1c86b3',
    light: '#1c86b3',
  },
  {
    name: 'vp-handle',
    label: 'Viewport handle',
    group: 'views',
    dark: '#ffd60a',
    light: '#ffd60a',
  },
  { name: 'vp-face', label: 'Viewport face', group: 'views', dark: '#ffd60a', light: '#ffd60a' },
  {
    name: 'vp-invalid',
    label: 'Viewport invalid',
    group: 'views',
    dark: '#ff9f0a',
    light: '#ff9f0a',
  },
  { name: 'vp-leak', label: 'Viewport leak', group: 'views', dark: '#e040fb', light: '#e040fb' },
  { name: 'vp-sky', label: 'Viewport sky', group: 'views', dark: '#5f7898', light: '#5f7898' },
  {
    name: 'vp-toolface',
    label: 'Viewport toolface',
    group: 'views',
    dark: '#7a52c7',
    light: '#7a52c7',
  },
  {
    name: 'vp-scope-dim',
    label: 'Viewport scope dim',
    group: 'views',
    dark: '#5a5a5a',
    light: '#5a5a5a',
  },
  { name: 'vp-label', label: 'Viewport label', group: 'views', dark: '#c9c9c9', light: '#c9c9c9' },
];

/** A token's default value for a theme. */
export function defaultColor(name: string, theme: 'dark' | 'light'): string {
  return COLOR_TOKENS.find((token) => token.name === name)?.[theme] ?? '#000000';
}

/** The valid six-digit hex colours the color input understands. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}
