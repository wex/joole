import { registerSW } from 'virtual:pwa-register';

export interface PwaCallbacks {
  /** A new version of the app is waiting; the user chooses when to reload. */
  onNeedRefresh(update: () => void): void;
  /** The app is precached and now works fully offline. */
  onOfflineReady(): void;
}

/**
 * Registers the service worker. Returns nothing: the callbacks drive the UI.
 * In dev the service worker is disabled, so this is a no-op there.
 */
export function registerAppServiceWorker(callbacks: PwaCallbacks): void {
  const update = registerSW({
    onNeedRefresh() {
      callbacks.onNeedRefresh(() => update(true));
    },
    onOfflineReady() {
      callbacks.onOfflineReady();
    },
  });
}
