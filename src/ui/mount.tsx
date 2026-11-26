import { render } from '@solidjs/web';
import type { EditorApp } from '@app/index';
import type { Renderer } from '@render/index';
import { createSignal } from 'solid-js';
import { registerAppServiceWorker } from '@platform/pwa';
import { EditorShell, type EditorShellProps, type PwaUpdateFlow } from './EditorShell';

export type { PwaUpdateFlow };

export interface MountEditorShellOptions {
  readonly app: EditorApp;
  readonly renderer: Renderer;
  readonly canvas: HTMLCanvasElement;
  readonly pwa?: PwaUpdateFlow;
  readonly settings?: EditorShellProps['settings'];
  readonly onSettingsChange?: EditorShellProps['onSettingsChange'];
}

export function mountEditorShell(options: MountEditorShellOptions, root: HTMLElement): () => void {
  const [updateAvailable, setUpdateAvailable] = createSignal(false);
  const pwa: PwaUpdateFlow = {
    updateAvailable,
    reload: () => {
      // Replaced by the registration once an update is actually waiting.
    },
  };
  registerAppServiceWorker({
    onNeedRefresh(update) {
      pwa.reload = update;
      setUpdateAvailable(true);
    },
    onOfflineReady() {
      options.app.log('ok', 'Joole is ready for offline use.');
    },
  });
  const flow = options.pwa ?? pwa;
  return render(
    () => (
      <EditorShell
        app={options.app}
        renderer={options.renderer}
        canvas={options.canvas}
        settings={options.settings}
        onSettingsChange={options.onSettingsChange}
        pwa={flow}
      />
    ),
    root,
  );
}
