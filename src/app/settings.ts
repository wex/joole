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
  texturesCollapsed: (value) => typeof value === 'boolean',
  thumbSize: (value) => typeof value === 'number' && value >= 32 && value <= 128,
  theme: (value) => value === 'dark' || value === 'light',
  wheelStep: num(8, 512),
  mouseLookSensitivity: num(0.02, 1),
  showToolOverlay: (value) => typeof value === 'boolean',
  groupCsgResults: (value) => typeof value === 'boolean',
  handleSize: num(7, 28),
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
  return out as EditorSettings;
}

/** A merge-safe partial update: only the given keys change. */
export function updateSettings(
  settings: EditorSettings,
  partial: Partial<EditorSettings>,
): EditorSettings {
  return parseSettings({ ...settings, ...partial });
}
