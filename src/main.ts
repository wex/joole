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
} from '@platform/index';
import { Renderer } from '@render/index';
import { mountEditorShell } from '@ui/index';

document.documentElement.dataset.theme = 'dark';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('missing #app element');
}

const textureCache = await TextureCache.openOpfs().catch(() => null);
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
});

const canvas = document.createElement('canvas');
const renderer = new Renderer(canvas, {
  colorSource: document.documentElement,
  loadTexture: (name) => app.loadTexture(name),
});
renderer.setDocument(app.document);
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
  } else if (event.type === 'selection') {
    renderer.setSelection(app.selection);
  } else if (event.type === 'game') {
    renderer.reloadTextures();
  } else if (event.type === 'grid') {
    renderer.setGridSize(app.gridSize);
  }
});

declare global {
  interface Window {
    joole?: {
      whenIdle: () => Promise<void>;
      stats: () => ReturnType<Renderer['stats']>;
      selection: () => string[];
    };
  }
}
window.joole = {
  whenIdle: () => renderer.whenIdle(),
  stats: () => renderer.stats(),
  selection: () => [...app.selection],
};

mountEditorShell({ app, renderer, canvas }, root);
