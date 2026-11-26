// SPDX-License-Identifier: GPL-2.0-or-later
import type { Vec3 } from '@core/types/index';

/** Rounds a value to the nearest multiple of the grid, never negative zero. */
export function snap(value: number, grid: number): number {
  const snapped = Math.round(value / grid) * grid;
  return snapped === 0 ? 0 : snapped;
}

/** Snaps a copy of the point on the given axes, leaving the rest untouched. */
export function snapAxes(point: Vec3, axes: readonly (0 | 1 | 2)[], grid: number): Vec3 {
  const out = [...point] as Vec3;
  for (const axis of axes) {
    out[axis] = snap(out[axis]!, grid);
  }
  return out;
}

/**
 * The depth range of a new brush perpendicular to the drawing view. The
 * depth is the smallest multiple of the grid that is at least `minimum`
 * units, placed so that both faces lie on grid lines. At grid sizes up to
 * 32 this is the symmetric ±32 around the view plane; at larger grids the
 * range shifts off centre, because a centred 64-unit range cannot sit on a
 * 64-or-larger grid.
 */
export function snapDepthExtent(
  center: number,
  grid: number,
  minimum = 64,
): readonly [number, number] {
  const extent = Math.max(grid, Math.ceil(minimum / grid) * grid);
  const min = snap(center - extent / 2, grid);
  return [min, min + extent];
}
