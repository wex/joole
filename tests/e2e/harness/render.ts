/**
 * The renderer's E2E harness, served by the dev server: it renders the
 * fixture map tests/fixtures/room.map in the four views without the UI
 * shell (which is P1.11).
 *
 * Query parameters: map (a fixture name, room by default), mode (wireframe,
 * flat or textured), max (a view to maximise), select (node ids to select,
 * comma-separated), toolfaces (dim or hide) and theme.
 * The texture e2u1/mine10_1 goes through the real pipeline (fetch, the
 * texture worker, upload); every other texture stays the checker.
 * When everything is drawn, html gets data-render-ready="true".
 */
import '../../../docs/design-system/tokens.css';
import './harness.css';
import { applyPatch, invertPatch } from '@core/doc/index';
import { parseMap, readPcxPalette } from '@core/formats/index';
import type { MapDocument, Patch } from '@core/types/index';
import { TextureClient } from '@platform/index';
import {
  DEFAULT_FAR,
  DEFAULT_NEAR,
  frameOrtho,
  framePerspective,
  Renderer,
  VIEW_AXES,
  type Camera,
  type Mode3d,
  type ToolFaceMode,
  type ViewId,
} from '@render/index';
import walUrl from '../../fixtures/harness.wal?url';
import pcxUrl from '../../fixtures/colormap.pcx?url';

const DEFAULT_PERSPECTIVE = { kind: 'perspective', near: DEFAULT_NEAR, far: DEFAULT_FAR } as const;

const params = new URLSearchParams(location.search);
const theme = params.get('theme');
if (theme) {
  document.documentElement.dataset.theme = theme;
}

const client = new TextureClient();
async function fetchBytes(url: string): Promise<ArrayBuffer> {
  return (await fetch(url)).arrayBuffer();
}
async function loadTexture(name: string) {
  if (name !== 'e2u1/mine10_1') {
    return null;
  }
  const [wal, pcx] = await Promise.all([fetchBytes(walUrl), fetchBytes(pcxUrl)]);
  const palette = readPcxPalette(new Uint8Array(pcx)).slice();
  return client.convert(wal, palette.buffer);
}

const canvas = document.querySelector<HTMLCanvasElement>('#views')!;
const renderer = new Renderer(canvas, { loadTexture });
// A plain path, not an import or new URL(): Vite treats .map modules as source maps.
const mapName = params.get('map') ?? 'room';
const mapText = await (await fetch(`/tests/fixtures/${mapName}.map`)).text();
let doc: MapDocument = parseMap(mapText);
renderer.setDocument(doc);
renderer.setToolFaces((params.get('toolfaces') as ToolFaceMode | null) ?? 'dim');
renderer.setMode3d((params.get('mode') as Mode3d | null) ?? 'textured');
renderer.setMaximized((params.get('max') as ViewId | null) ?? null);
const select = params.get('select');
if (select) {
  renderer.setSelection(select.split(','));
}

const faceHighlight = params.get('faces');
if (faceHighlight) {
  // The first brush's first derived polygon: real geometry, visible in every view.
  const { analyzeBrush } = await import('@core/geom/index');
  for (const node of doc.nodes.values()) {
    if (node.kind === 'brush') {
      const analysis = analyzeBrush(node);
      const polygon = analysis.polygons[0] ?? [];
      if (polygon.length >= 3) {
        renderer.setFaceHighlight([polygon]);
      }
      break;
    }
  }
}

const bounds = renderer.bounds();
// The room is closed, so the 3D view looks in from a corner inside it;
// other maps are framed from outside.
const interiorCamera: Camera =
  mapName === 'room'
    ? { ...DEFAULT_PERSPECTIVE, position: [-232, -232, 168], yaw: 40, pitch: -22, fovY: 75 }
    : framePerspective(bounds, 16 / 9);
for (const [view, rect] of renderer.viewRects()) {
  renderer.setCamera(
    view,
    view === '3d' ? interiorCamera : frameOrtho(VIEW_AXES[view], bounds, rect.width, rect.height),
  );
}

declare global {
  interface Window {
    jooleRender?: {
      stats: () => ReturnType<Renderer['stats']>;
      invalidate: () => void;
      whenIdle: () => Promise<void>;
      removeFirstBrush: (groupId: string) => Promise<void>;
      undo: () => Promise<void>;
    };
  }
}
/** A patch that removes the first brush of a group, as a delete command would. */
function removeFirstBrushPatch(groupId: string): Patch {
  const group = doc.nodes.get(groupId);
  if (group?.kind !== 'group') {
    throw new Error(`no group ${groupId}`);
  }
  const brushId = group.children[0]!;
  return {
    before: new Map([
      [brushId, doc.nodes.get(brushId)!],
      [groupId, group],
    ]),
    after: new Map([
      [brushId, null],
      [groupId, { ...group, children: group.children.slice(1) }],
    ]),
    parentBefore: new Map([[brushId, groupId]]),
    parentAfter: new Map([[brushId, null]]),
  };
}

function apply(patch: Patch): void {
  doc = applyPatch(doc, patch);
  renderer.applyPatch(doc, patch);
}

let lastPatch: Patch | null = null;
window.jooleRender = {
  stats: () => renderer.stats(),
  invalidate: () => renderer.invalidate(),
  whenIdle: () => renderer.whenIdle(),
  removeFirstBrush: async (groupId: string) => {
    lastPatch = removeFirstBrushPatch(groupId);
    apply(lastPatch);
    await renderer.whenIdle();
  },
  undo: async () => {
    apply(invertPatch(lastPatch!));
    await renderer.whenIdle();
  },
};

await renderer.whenIdle();
document.documentElement.dataset.renderReady = 'true';
