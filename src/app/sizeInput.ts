import type { PickAxis } from '@core/geom/index';

export type SizeResult =
  | { readonly ok: true; readonly value: readonly [number, number, number] }
  | { readonly ok: false; readonly error: string };

const SIZE_ERROR = 'Enter three sizes, such as 128 64 32';

/**
 * Parses a typed brush size (T15.4): three positive, finite numbers
 * separated by spaces, commas or both. The values are not snapped; a typed
 * size is explicit.
 */
export function parseSizeInput(text: string): SizeResult {
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter((part) => part.length > 0);
  if (parts.length !== 3) return { ok: false, error: SIZE_ERROR };
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return { ok: false, error: SIZE_ERROR };
  }
  return { ok: true, value: [values[0]!, values[1]!, values[2]!] };
}

/**
 * The world axes of a typed size's width, height and depth in a 2D view:
 * the view's horizontal axis, its vertical axis, then the depth axis.
 */
export function sizeAxes(view: PickAxis): readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2] {
  return view === 'xy' ? [0, 1, 2] : view === 'xz' ? [0, 2, 1] : [1, 2, 0];
}

/** A size as the input shows it: up to four decimals, trailing zeros trimmed. */
export function formatSize(size: readonly number[]): string {
  return size.map((value) => String(Number(value.toFixed(4)))).join(' ');
}
