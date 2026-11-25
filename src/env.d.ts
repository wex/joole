declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

// Plain style sheets imported for their side effect, such as tokens.css.
declare module '*.css';

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '*?url' {
  const url: string;
  export default url;
}

// File System Access API types missing from the DOM library (24.11.2026)
interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemDirectoryHandle {
  queryPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface Window {
  showDirectoryPicker(options?: {
    mode?: 'read' | 'readwrite';
  }): Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker(options?: {
    multiple?: boolean;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
  }): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
  }): Promise<FileSystemFileHandle>;
}

declare module '*qbsp3.mjs' {
  const createQbsp3: unknown;
  export default createQbsp3;
}

// The service worker registration entry vite-plugin-pwa provides at build
// time. The plugin ships framework type files that do not resolve cleanly
// under the project's `types: []` setup, so the small used surface is
// declared here instead.
declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }

  /** Registers the service worker; the return reloads the page for an update. */
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
