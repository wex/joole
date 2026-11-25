import { render } from '@solidjs/web';
import type { EditorApp } from '@app/index';
import type { Renderer } from '@render/index';
import { EditorShell } from './EditorShell';

export interface MountEditorShellOptions {
  readonly app: EditorApp;
  readonly renderer: Renderer;
  readonly canvas: HTMLCanvasElement;
}

export function mountEditorShell(options: MountEditorShellOptions, root: HTMLElement): () => void {
  return render(
    () => <EditorShell app={options.app} renderer={options.renderer} canvas={options.canvas} />,
    root,
  );
}
