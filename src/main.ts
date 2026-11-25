import '@ui/fonts.css';
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
  ProjectStore,
} from '@platform/index';
import { Renderer } from '@render/index';
import { mountEditorShell } from '@ui/index';

document.documentElement.dataset.theme = 'dark';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('missing #app element');
}

const textureCache = await TextureCache.openOpfs().catch(() => null);
const projectStore = await ProjectStore.openOpfs().catch(() => null);
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

const canvas = document.createElement('canvas');
const renderer = new Renderer(canvas, {
  colorSource: document.documentElement,
  loadTexture: (name) => app.loadTexture(name),
});
const storedAutosave = await projectStore?.loadAutosave();
if (storedAutosave?.dirty && storedAutosave.project) app.offerRecovery(storedAutosave.project);
setInterval(() => void app.autosave(), 30000);
window.addEventListener('pagehide', () => void app.autosave());
renderer.setDocument(app.document);
if (typeof settings?.gridSize === 'number') app.setGridSize(settings.gridSize);
renderer.setGridSize(app.gridSize);

// The renderer is subscribed before the UI, so the UI's document event can
// frame cameras after the geometry cache has been updated.
app.subscribe((event) => {
  if (event.type === 'document') {
    if (event.patch) {
      renderer.applyPatch(app.document, event.patch);
    } else {
      renderer.setDocument(app.document);
    }
    if (app.mapName) void projectStore?.saveRecentFiles([app.mapName]);
  } else if (event.type === 'selection') {
    renderer.setSelection(app.selection);
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
      texture: (name?: string) => string;
      faces: () => number;
    };
  }
}
window.joole = {
  whenIdle: () => renderer.whenIdle(),
  stats: () => renderer.stats(),
  selection: () => [...app.selection],
  autosave: () => app.autosave(),
  camera: (view) => renderer.getCamera(view),
  viewRects: () => Object.fromEntries(renderer.viewRects()),
  project: () => app.projectText(),
  texture: (name?: string) => {
    if (name) app.setCurrentTexture(name);
    return app.currentTextureName;
  },
  faces: () => app.faceSelectionCount,
};

mountEditorShell({ app, renderer, canvas }, root);
