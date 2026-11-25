/** A colour as red, green, blue and alpha in 0..1, ready for a uniform. */
export type Rgba = readonly [number, number, number, number];

/**
 * The design system tokens the renderer reads. The vp-* tokens colour the
 * views; surface-0 is the ground between the views, as between the panels.
 */
export const VIEWPORT_COLOR_TOKENS = [
  'vp-bg',
  'vp-grid-minor',
  'vp-grid-major',
  'vp-axis',
  'vp-brush',
  'vp-select',
  'vp-entity',
  'vp-target',
  'vp-handle',
  'vp-invalid',
  'vp-leak',
  'vp-sky',
  'vp-toolface',
  'vp-scope-dim',
  'vp-label',
  'surface-0',
] as const;

export type ViewportColorToken = (typeof VIEWPORT_COLOR_TOKENS)[number];
export type ViewportColors = Readonly<Record<ViewportColorToken, Rgba>>;

function channel(text: string): number {
  return parseInt(text, 16) / 255;
}

/**
 * Parses the CSS colour forms the token files use: #rgb, #rgba, #rrggbb,
 * #rrggbbaa, rgb() and rgba() with comma or space separators. Returns null
 * for anything else.
 */
export function parseCssColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a = 'f'] = hex.split('');
      return [channel(r! + r!), channel(g! + g!), channel(b! + b!), channel(a + a)];
    }
    if (hex.length === 6 || hex.length === 8) {
      const a = hex.length === 8 ? channel(hex.slice(6, 8)) : 1;
      return [channel(hex.slice(0, 2)), channel(hex.slice(2, 4)), channel(hex.slice(4, 6)), a];
    }
    return null;
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(text)?.[1];
  if (fn) {
    const parts = fn.split(/[\s,/]+/).filter((part) => part.length > 0);
    if (parts.length !== 3 && parts.length !== 4) {
      return null;
    }
    const numbers = parts.map((part, i) => {
      const n = parseFloat(part);
      if (part.endsWith('%')) {
        return n / 100;
      }
      return i < 3 ? n / 255 : n;
    });
    if (numbers.some((n) => !Number.isFinite(n))) {
      return null;
    }
    return [numbers[0]!, numbers[1]!, numbers[2]!, numbers[3] ?? 1];
  }
  return null;
}

/**
 * Reads the colour tokens from a computed style, so WebGL and the panels share
 * one source. Called at start-up and whenever the theme changes. A missing or
 * unparsable token is an error: the token file was not loaded.
 */
export function readViewportColors(
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
): ViewportColors {
  const colors: Partial<Record<ViewportColorToken, Rgba>> = {};
  for (const token of VIEWPORT_COLOR_TOKENS) {
    const value = style.getPropertyValue(`--${token}`);
    const color = parseCssColor(value);
    if (!color) {
      throw new Error(`design token --${token} is missing or not a colour: "${value}"`);
    }
    colors[token] = color;
  }
  return colors as ViewportColors;
}
