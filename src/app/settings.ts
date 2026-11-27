import { COLOR_TOKENS, isHexColor } from './colors';
import {
  DEFAULT_WORKSPACE_LAYOUT,
  normalizeNamedLayouts,
  normalizeWorkspaceLayout,
  type NamedLayout,
  type WorkspaceLayout,
} from './layout';

/**
 * The persisted editor settings (T1.12): one typed object with defaults.
 * Unknown keys survive a round trip, so a newer build's settings are not
 * lost when an older build saves its own.
 */
export interface EditorSettings {
  readonly gridSize: number;
  /** The right dock's width in CSS pixels. */
  readonly rightWidth: number;
  /** The bottom panel's height in CSS pixels. */
  readonly bottomHeight: number;
  /** The vertical splitter position inside the right dock, as a fraction. */
  readonly dockSplit: number;
  /** The Properties section of the right dock is collapsed. */
  readonly propertiesCollapsed: boolean;
  /** The Textures section of the right dock is collapsed. */
  readonly texturesCollapsed: boolean;
  /** The texture thumbnail size in CSS pixels. */
  readonly thumbSize: number;
  /** The UI theme. */
  readonly theme: 'dark' | 'light';
  /** The 3D wheel step in units per notch (T1.15). */
  readonly wheelStep: number;
  /** The mouse-look sensitivity in degrees per pixel (T1.15). */
  readonly mouseLookSensitivity: number;
  /** The tool overlay is visible (T1.16). */
  readonly showToolOverlay: boolean;
  /** Hollow and Subtract group their fragments (T1.14). */
  readonly groupCsgResults: boolean;
  /** The idle vertex/edge/face handle dot diameter in CSS pixels (T15.3). */
  readonly handleSize: number;
  /** The bottom panel shows only its tab strip (T15.9). */
  readonly bottomCollapsed: boolean;
  /** The bounded arrangement of docks, sections, tabs and maximized viewport (T2.7). */
  readonly layout: WorkspaceLayout;
  /** Saved named arrangements (T2.8). */
  readonly layouts: readonly NamedLayout[];
  /** The last applied named layout, or null for a customized/default arrangement. */
  readonly activeLayoutId: string | null;
  /** Colour overrides per theme, only the changed tokens (T15.10). */
  readonly colors: {
    readonly dark: Record<string, string>;
    readonly light: Record<string, string>;
  };
  readonly [key: string]: unknown;
}

export const DEFAULT_SETTINGS: EditorSettings = {
  gridSize: 8,
  rightWidth: 320,
  bottomHeight: 160,
  dockSplit: 0.5,
  propertiesCollapsed: false,
  texturesCollapsed: false,
  thumbSize: 64,
  theme: 'dark',
  wheelStep: 64,
  mouseLookSensitivity: 0.15,
  showToolOverlay: true,
  groupCsgResults: true,
  handleSize: 14,
  bottomCollapsed: true,
  layout: DEFAULT_WORKSPACE_LAYOUT,
  layouts: [],
  activeLayoutId: null,
  colors: { dark: {}, light: {} },
};

function num(min: number, max: number) {
  return (value: unknown) => typeof value === 'number' && value >= min && value <= max;
}

const checks: Record<string, (value: unknown) => boolean> = {
  gridSize: (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 256,
  rightWidth: num(224, 640),
  bottomHeight: num(96, 640),
  dockSplit: num(0.15, 0.85),
  propertiesCollapsed: (value) => typeof value === 'boolean',
  bottomCollapsed: (value) => typeof value === 'boolean',
  colors: (value) => {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const themes = value as Record<string, unknown>;
    for (const theme of ['dark', 'light']) {
      if (!(theme in themes) || typeof themes[theme] !== 'object' || themes[theme] === null) {
        return false;
      }
    }
    return true;
  },
  texturesCollapsed: (value) => typeof value === 'boolean',
  thumbSize: (value) => typeof value === 'number' && value >= 32 && value <= 128,
  theme: (value) => value === 'dark' || value === 'light',
  wheelStep: num(8, 512),
  mouseLookSensitivity: num(0.02, 1),
  showToolOverlay: (value) => typeof value === 'boolean',
  groupCsgResults: (value) => typeof value === 'boolean',
  handleSize: num(7, 28),
  layout: (value) => !!value && typeof value === 'object',
  layouts: (value) => Array.isArray(value),
  activeLayoutId: (value) => typeof value === 'string' || value === null,
};

/**
 * Validates a stored object field by field: invalid values fall back to
 * their defaults and unknown keys are kept as they are.
 */
export function parseSettings(stored: unknown): EditorSettings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  if (stored && typeof stored === 'object') {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      const check = checks[key];
      if (check) {
        out[key] = check(value) ? value : DEFAULT_SETTINGS[key as keyof EditorSettings];
      } else {
        out[key] = value;
      }
    }
  }
  // The nested colour map keeps only known tokens with valid hex values, so a
  // corrupt or foreign entry cannot break the color inputs (T15.10).
  const raw = out['colors'] as Record<string, unknown>;
  const clean: Record<string, Record<string, string>> = { dark: {}, light: {} };
  for (const theme of ['dark', 'light'] as const) {
    const entries = raw[theme];
    if (entries && typeof entries === 'object') {
      for (const [token, color] of Object.entries(entries as Record<string, unknown>)) {
        if (COLOR_TOKENS.some((t) => t.name === token) && isHexColor(color)) {
          clean[theme]![token] = color.toLowerCase();
        }
      }
    }
  }
  out['colors'] = clean;
  out['layout'] = normalizeWorkspaceLayout(out['layout']);
  const layouts = normalizeNamedLayouts(out['layouts']);
  out['layouts'] = layouts;
  out['activeLayoutId'] = layouts.some((layout) => layout.id === out['activeLayoutId'])
    ? out['activeLayoutId']
    : null;
  return out as EditorSettings;
}

/** A merge-safe partial update: only the given keys change. */
export function updateSettings(
  settings: EditorSettings,
  partial: Partial<EditorSettings>,
): EditorSettings {
  return parseSettings({ ...settings, ...partial });
}
