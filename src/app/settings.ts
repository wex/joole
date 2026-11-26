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
  readonly [key: string]: unknown;
}

export const DEFAULT_SETTINGS: EditorSettings = {
  gridSize: 8,
  rightWidth: 320,
  bottomHeight: 200,
  dockSplit: 0.5,
  propertiesCollapsed: false,
  texturesCollapsed: false,
  thumbSize: 64,
  theme: 'dark',
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
  texturesCollapsed: (value) => typeof value === 'boolean',
  thumbSize: (value) => typeof value === 'number' && value >= 32 && value <= 128,
  theme: (value) => value === 'dark' || value === 'light',
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
