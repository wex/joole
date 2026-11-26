import '@ui/fonts.css';
import type { Vec3 } from '@core/types/index';
import '../docs/design-system/tokens.css';
import '@ui/global.css';
import { EditorApp } from '@app/index';
import {
  browserInflate,
  collectFromHandle,
  hasDirectoryPicker,
  pickGameDirectory,
  TextureCache,
  TextureClient,
  CompileClient,
  PrefabStore,
  ProjectStore,
} from '@platform/index';
import { Renderer } from '@render/index';
import { mountEditorShell } from '@ui/index';

document.documentElement.dataset.theme = 'dark';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('missing #app element');
}

const textureCache = await TextureCache.openLocal().catch(() => null);
const projectStore = await ProjectStore.openLocal().catch(() => null);
const prefabStore = await PrefabStore.openLocal().catch(() => null);
const settings = (await projectStore?.loadSettings()) ?? null;
const textureClient = new TextureClient();

async function pickMapFile(): Promise<File | null> {
  if (!('showOpenFilePicker' in window)) {
    return null;
  }
  try {
    const handles = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: 'Quake 2 maps',
          accept: { 'text/plain': ['.map'] },
        },
      ],
    });
    return handles[0] ? handles[0].getFile() : null;
  } catch {
    return null;
  }
}

function downloadText(name: string, text: string): boolean {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

async function saveTextFile(name: string, text: string): Promise<boolean> {
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return true;
    } catch {
      return false;
    }
  }
  return downloadText(name, text);
}

async function saveBinaryFile(name: string, data: Uint8Array): Promise<boolean> {
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name });
      const writable = await handle.createWritable();
      await writable.write(data.slice(0));
      await writable.close();
      return true;
    } catch {
      return false;
    }
  }
  // Fallback for browsers without the picker: a download of the bytes.
  const blob = new Blob([data.slice(0).buffer as ArrayBuffer], {
    type: 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

const app = new EditorApp({
  inflate: browserInflate,
  textureClient,
  textureCache,
  pickGameEntries: hasDirectoryPicker()
    ? async () => {
        const handle = await pickGameDirectory();
        if (!handle) {
          return null;
        }
        const entries = await collectFromHandle(handle);
        return { entries, label: handle.name };
      }
    : undefined,
  pickMapFile: 'showOpenFilePicker' in window ? pickMapFile : undefined,
  clipboard: navigator.clipboard,
  saveProjectText: saveTextFile,
  saveMapText: saveTextFile,
  autosaveStore: projectStore ?? undefined,
});
if (prefabStore) app.setPrefabStore(prefabStore);

// The compile pipeline: every tool runs in a fresh worker through the
// client; stdout streams into the editor log line by line.
const compileClient = new CompileClient();
app.compileRunner = async (step) => {
  const result = await compileClient.run({
    tool: step.tool,
    args: step.args,
    files: step.files,
    outputs: step.outputs,
    onLog: (_stream, text) => app.log('info', text),
  });
  return { files: result.files, output: result.output };
};
app.saveBinaryFile = saveBinaryFile;
app.cancelCompileWorker = () => compileClient.cancel();

const canvas = document.createElement('canvas');
const renderer = new Renderer(canvas, {
  entityColorOf: (node) => {
    if (node.kind !== 'entity') return null;
    const cls = node.props.find(([k]) => k === 'classname')?.[1];
    const def = cls ? app.entityDefs().find((d) => d.className === cls) : undefined;
    return def ? def.color : null;
  },
  entityWireframeOf: (node) => app.entityWireframe(node),

  colorSource: document.documentElement,
  loadTexture: (name) => app.loadTexture(name),
});
const storedAutosave = await projectStore?.loadAutosave();
if (storedAutosave?.dirty && storedAutosave.project) app.offerRecovery(storedAutosave.project);
setInterval(() => void app.autosave(), 30000);
window.addEventListener('pagehide', () => void app.autosave());
renderer.setDocument(app.document);
updateTargetLinks();
if (typeof settings?.gridSize === 'number') app.setGridSize(settings.gridSize);
renderer.setGridSize(app.gridSize);

/** Recomputes the target–targetname link lines after document changes. */
function updateTargetLinks(): void {
  const segments: (readonly [[number, number, number], [number, number, number]])[] = [];
  for (const [from, to] of app.targetLinks()) {
    const a = app.document.nodes.get(from);
    const b = app.document.nodes.get(to);
    if (a?.kind !== 'entity' || b?.kind !== 'entity') continue;
    const pa = a.props
      .find(([k]) => k === 'origin')?.[1]
      ?.split(/\s+/)
      .map(Number);
    const pb = b.props
      .find(([k]) => k === 'origin')?.[1]
      ?.split(/\s+/)
      .map(Number);
    if (!pa || !pb || pa.length !== 3 || pb.length !== 3) continue;
    segments.push([
      [pa[0]!, pa[1]!, pa[2]!],
      [pb[0]!, pb[1]!, pb[2]!],
    ]);
  }
  renderer.setTargetLinks(segments);
}

// The renderer is subscribed before the UI, so the UI's document event can
// frame cameras after the geometry cache has been updated.
app.subscribe((event) => {
  if (event.type === 'document') {
    if (event.patch) {
      renderer.applyPatch(app.document, event.patch);
      updateTargetLinks();
    } else {
      renderer.setDocument(app.document);
    }
    if (app.mapName) void projectStore?.saveRecentFiles([app.mapName]);
    renderer.setScope(app.scope);
    // The leak path appears automatically once a compile finds a leak.
    if (app.leakPath && app.leakPath.length > 1) {
      const segments: [Vec3, Vec3][] = [];
      for (let i = 0; i + 1 < app.leakPath.length; i++) {
        segments.push([
          app.leakPath[i]! as [number, number, number],
          app.leakPath[i + 1]! as [number, number, number],
        ]);
      }
      renderer.setLeakPath(segments);
    } else {
      renderer.setLeakPath([]);
    }
    renderer.setFaceHighlight(app.faceHighlightPolygons());
  } else if (event.type === 'selection') {
    renderer.setSelection(app.selection);
  } else if (event.type === 'tool') {
    renderer.setFaceHighlight(app.faceHighlightPolygons());
  } else if (event.type === 'game') {
    renderer.reloadTextures();
  } else if (event.type === 'grid') {
    renderer.setGridSize(app.gridSize);
    void projectStore?.saveSettings({ gridSize: app.gridSize });
  }
});

declare global {
  interface Window {
    joole?: {
      whenIdle: () => Promise<void>;
      stats: () => ReturnType<Renderer['stats']>;
      selection: () => string[];
      autosave: () => Promise<boolean>;
      camera: (view: '3d' | 'top' | 'front' | 'side') => ReturnType<Renderer['getCamera']>;
      viewRects: () => Record<string, { x: number; y: number; width: number; height: number }>;
      project: () => string;
      leakPath: () => readonly (readonly number[])[] | null;
      texture: (name?: string) => string;
      faces: () => number;
      faceHighlight: () => number;
    };
  }
}
window.joole = {
  whenIdle: () => renderer.whenIdle(),
  stats: () => renderer.stats(),
  selection: () => [...app.selection],
  autosave: () => app.autosave(),
  camera: (view) => renderer.getCamera(view),
  // The renderer's rectangles are backing-store pixels, but every consumer
  // here feeds them to mouse input, which is in CSS pixels — at a backing
  // ratio other than 1 the raw rectangles misplace every click.
  viewRects: () => {
    const ratio = renderer.backingRatio();
    return Object.fromEntries(
      [...renderer.viewRects()].map(([view, rect]) => [
        view,
        {
          x: rect.x / ratio,
          y: rect.y / ratio,
          width: rect.width / ratio,
          height: rect.height / ratio,
        },
      ]),
    );
  },
  project: () => app.projectText(),
  leakPath: () => app.leakPath,
  texture: (name?: string) => {
    if (name) app.setCurrentTexture(name);
    return app.currentTextureName;
  },
  faces: () => app.faceSelectionCount,
  faceHighlight: () => app.faceHighlightPolygons().length,
};

mountEditorShell({ app, renderer, canvas }, root);
