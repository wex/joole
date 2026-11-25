/** The four views, in the design system's 2 × 2 order: 3D, Top, Front, Side. */
export type ViewId = '3d' | 'top' | 'front' | 'side';

export const VIEW_ORDER: readonly ViewId[] = ['3d', 'top', 'front', 'side'];

/** A rectangle in device pixels with a top-left origin, like the DOM. */
export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The view rectangles inside one canvas: a 2 × 2 grid separated by a gap
 * (the splitter), or one maximised view filling the canvas. Hidden views are
 * absent from the result. Sizes are whole pixels, and the right column and
 * the bottom row take the odd pixel.
 */
export function layoutViews(
  width: number,
  height: number,
  maximized: ViewId | null,
  gap: number,
): Map<ViewId, ViewRect> {
  const rects = new Map<ViewId, ViewRect>();
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  if (maximized) {
    rects.set(maximized, { x: 0, y: 0, width: w, height: h });
    return rects;
  }
  const g = Math.min(Math.max(0, Math.round(gap)), Math.min(w, h));
  const leftWidth = Math.floor((w - g) / 2);
  const rightWidth = w - g - leftWidth;
  const topHeight = Math.floor((h - g) / 2);
  const bottomHeight = h - g - topHeight;
  const right = leftWidth + g;
  const bottom = topHeight + g;
  rects.set('3d', { x: 0, y: 0, width: leftWidth, height: topHeight });
  rects.set('top', { x: right, y: 0, width: rightWidth, height: topHeight });
  rects.set('front', { x: 0, y: bottom, width: leftWidth, height: bottomHeight });
  rects.set('side', { x: right, y: bottom, width: rightWidth, height: bottomHeight });
  return rects;
}

/** The scissor and viewport origin in WebGL's bottom-left convention. */
export function glRect(rect: ViewRect, canvasHeight: number): [number, number, number, number] {
  return [rect.x, canvasHeight - rect.y - rect.height, rect.width, rect.height];
}
