import { For, Show } from 'solid-js';
import type { Vec3 } from '@core/types/index';
import { dot } from '@core/geom/index';
import { orthoBasis, VIEW_AXES, type OrthoCamera, type ViewId, type ViewRect } from '@render/index';
import styles from './MeasureOverlay.module.css';

export interface MeasureBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface MeasureOverlayProps {
  readonly measure: () => MeasureBox | null;
  readonly camera: (view: ViewId) => OrthoCamera | null;
  /** The view rectangles in device pixels with a top-left origin. */
  readonly rects: () => Map<ViewId, ViewRect>;
  /** Canvas backing-store pixels per CSS pixel. */
  readonly ratio: () => number;
}

const ORTHO_VIEWS = ['top', 'front', 'side'] as const;
const HIDE_BELOW_PX = 30;

function planeAxes(axis: 'xy' | 'xz' | 'yz'): readonly [0 | 1 | 2, 0 | 1 | 2] {
  return axis === 'xy' ? [0, 1] : axis === 'xz' ? [0, 2] : [1, 2];
}

interface Label {
  readonly key: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/**
 * The size labels of an in-progress brush edit: the in-plane extents next
 * to the box edges of every 2D view. Positions are computed from the same
 * ortho cameras as the input conversion, in CSS pixels relative to the
 * viewport element.
 */
export function MeasureOverlay(props: MeasureOverlayProps) {
  const labels = (): Label[] => {
    const box = props.measure();
    if (!box) return [];
    const ratio = props.ratio();
    const rects = props.rects();
    const out: Label[] = [];
    for (const view of ORTHO_VIEWS) {
      const camera = props.camera(view);
      const rect = rects.get(view);
      if (!camera || !rect) continue;
      const [a0, a1] = planeAxes(VIEW_AXES[view]);
      const { right, up } = orthoBasis(camera.axis);
      const zoomCss = camera.zoom / ratio;
      const project = (world: Vec3): { x: number; y: number } => ({
        x:
          rect.x / ratio +
          rect.width / ratio / 2 +
          (dot(world, right) - dot(camera.center, right)) * zoomCss,
        y:
          rect.y / ratio +
          rect.height / ratio / 2 -
          (dot(world, up) - dot(camera.center, up)) * zoomCss,
      });
      const widthUnits = box.max[a0]! - box.min[a0]!;
      const heightUnits = box.max[a1]! - box.min[a1]!;
      const at = (v0: number, v1: number): Vec3 => {
        const world: Vec3 = [0, 0, 0];
        world[a0] = v0;
        world[a1] = v1;
        return world;
      };
      const mid0 = (box.min[a0]! + box.max[a0]!) / 2;
      const mid1 = (box.min[a1]! + box.max[a1]!) / 2;
      if (widthUnits * zoomCss >= HIDE_BELOW_PX) {
        // Below whichever horizontal edge is lower on screen.
        const lowMin = project(at(mid0, box.min[a1]!));
        const lowMax = project(at(mid0, box.max[a1]!));
        const lower = lowMin.y > lowMax.y ? lowMin : lowMax;
        out.push({
          key: `${view}-w`,
          text: String(Math.round(widthUnits)),
          x: lower.x,
          y: lower.y + 14,
        });
      }
      if (heightUnits * zoomCss >= HIDE_BELOW_PX) {
        // Right of whichever vertical edge is further right on screen.
        const rightMin = project(at(box.min[a0]!, mid1));
        const rightMax = project(at(box.max[a0]!, mid1));
        const righter = rightMin.x > rightMax.x ? rightMin : rightMax;
        out.push({
          key: `${view}-h`,
          text: String(Math.round(heightUnits)),
          x: righter.x + 10,
          y: righter.y,
        });
      }
    }
    return out;
  };

  return (
    <Show when={props.measure()}>
      <div class={styles.overlay} data-testid="measure-overlay" aria-hidden="true">
        <For each={labels()}>
          {(label) => (
            <span
              class={styles.label}
              ref={(el) => {
                el.style.left = `${label.x}px`;
                el.style.top = `${label.y}px`;
              }}
            >
              {label.text}
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}
