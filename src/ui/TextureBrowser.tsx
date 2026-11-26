import { createEffect, createSignal, For, onSettled, Show } from 'solid-js';
import styles from './TextureBrowser.module.css';

export interface TextureEntry {
  readonly name: string;
  readonly source: string;
}

export interface TextureBrowserProps {
  readonly entries: readonly TextureEntry[];
  readonly inUse: () => ReadonlySet<string>;
  readonly selected: () => string;
  /** The thumbnail size in CSS pixels (T1.12); the cells are derived from it. */
  readonly thumbSize?: () => number;
  readonly onSelect: (name: string) => void;
  /** Loads and converts a texture, returning its rgba bitmap and size. */
  readonly load: (
    name: string,
  ) => Promise<{ width: number; height: number; rgba: Uint8Array } | null>;
}

// The cell metrics follow the thumbnail slider: the label row adds 32 px.
const cellPaddingX = 28;
const cellLabelHeight = 32;
const overscanRows = 2;

function folderOf(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash < 0 ? '' : name.slice(0, slash);
}

function baseName(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash < 0 ? name : name.slice(slash + 1);
}

interface Thumb {
  readonly bitmap: ImageBitmap | null;
  readonly width: number;
  readonly height: number;
}

/** Bitmaps survive re-mounts; conversion happens once per texture. */
const thumbCache = new Map<string, Thumb>();

/**
 * The texture browser: folder filter, name search, in-use filter, a
 * virtualised thumbnail grid with lazy conversion and a details footer.
 * Follows the design system's TextureBrowser component.
 */
export function TextureBrowser(props: TextureBrowserProps) {
  const [search, setSearch] = createSignal('');
  const [onlyInUse, setOnlyInUse] = createSignal(false);
  const [folder, setFolder] = createSignal<string | null>(null);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewport, setViewport] = createSignal({ width: 600, height: 200 });
  const requested = new Set<string>();
  let scrollElement: HTMLDivElement | undefined;

  const folders = () => {
    const roots = new Map<string, Set<string>>();
    for (const entry of props.entries) {
      const root = entry.source.split('/')[0] ?? entry.source;
      if (!roots.has(root)) roots.set(root, new Set());
      roots.get(root)!.add(folderOf(entry.name));
    }
    return [...roots.entries()].map(([root, set]) => ({
      root,
      folders: [...set].sort(),
    }));
  };

  const filtered = () => {
    const needle = search().trim().toLowerCase();
    const used = onlyInUse() ? props.inUse() : null;
    return props.entries.filter((entry) => {
      if (folder() !== null && folderOf(entry.name) !== folder()) return false;
      if (needle && !entry.name.toLowerCase().includes(needle)) return false;
      if (used && !used.has(entry.name)) return false;
      return true;
    });
  };

  const thumbPixels = () => props.thumbSize?.() ?? 64;
  const cellWidth = () => thumbPixels() + cellPaddingX;
  const cellHeight = () => thumbPixels() + cellLabelHeight;
  const columns = () => Math.max(1, Math.floor(viewport().width / cellWidth()));
  const rows = () => Math.ceil(filtered().length / columns());
  const gridHeight = () => rows() * cellHeight();
  const firstRow = () => Math.max(0, Math.floor(scrollTop() / cellHeight()) - overscanRows);
  const lastRow = () =>
    Math.min(rows(), Math.ceil((scrollTop() + viewport().height) / cellHeight()) + overscanRows);

  const visible = () => {
    const out: { entry: TextureEntry; index: number }[] = [];
    const items = filtered();
    for (let row = firstRow(); row < lastRow(); row++) {
      for (let col = 0; col < columns(); col++) {
        const index = row * columns() + col;
        if (index < items.length) out.push({ entry: items[index]!, index });
      }
    }
    return out;
  };

  const [version, setVersion] = createSignal(0);

  const request = (name: string) => {
    if (requested.has(name)) return;
    requested.add(name);
    void props.load(name).then(async (loaded) => {
      if (loaded) {
        const data = new ImageData(new Uint8ClampedArray(loaded.rgba), loaded.width, loaded.height);
        thumbCache.set(name, {
          bitmap: await createImageBitmap(data),
          width: loaded.width,
          height: loaded.height,
        });
      } else {
        thumbCache.set(name, { bitmap: null, width: 0, height: 0 });
      }
      setVersion((v) => v + 1);
    });
  };

  const selectedEntry = () => props.entries.find((entry) => entry.name === props.selected());

  onSettled(() => {
    if (!scrollElement) return;
    const observer = new ResizeObserver(() => {
      if (scrollElement) {
        setViewport({ width: scrollElement.clientWidth, height: scrollElement.clientHeight });
      }
    });
    observer.observe(scrollElement);
    return () => observer.disconnect();
  });

  return (
    <div class={styles.browser} data-testid="texture-browser">
      <div class={styles.controls}>
        <select
          aria-label="Texture folder"
          class={styles.folder}
          value={folder() ?? ''}
          onChange={(event) => setFolder(event.currentTarget.value || null)}
        >
          <option value="">All textures ({props.entries.length})</option>
          <For each={folders()}>
            {(group) => (
              <For each={group.folders}>
                {(name) => (
                  <option value={name}>
                    {group.root}: {name || '(root)'}
                  </option>
                )}
              </For>
            )}
          </For>
        </select>
        <input
          type="search"
          aria-label="Search textures"
          placeholder="Search textures"
          class={styles.search}
          value={search()}
          onInput={(event) => setSearch(event.currentTarget.value)}
        />
        <label class={styles.inuse}>
          <input
            type="checkbox"
            checked={onlyInUse()}
            onChange={(event) => setOnlyInUse(event.currentTarget.checked)}
          />
          In use
        </label>
      </div>
      <div
        class={styles.grid}
        ref={(el) => (scrollElement = el)}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div
          class={styles.spacer}
          ref={(el) => {
            createEffect(
              () => gridHeight(),
              (height) => {
                el.style.height = `${height}px`;
              },
            );
          }}
        >
          <For each={visible()}>
            {({ entry, index }) => {
              const staticRow = Math.floor(index / columns());
              const staticCol = index % columns();
              return (
                <button
                  type="button"
                  class={[
                    styles.cell,
                    { [styles.selected as string]: props.selected() === entry.name },
                  ]}

                  ref={(el) => {
                    el.style.left = `${staticCol * cellWidth()}px`;
                    el.style.top = `${staticRow * cellHeight()}px`;
                    el.style.width = `${cellWidth()}px`;
                    el.style.height = `${cellHeight()}px`;
                  }}
                  title={entry.name}
                  onClick={() => props.onSelect(entry.name)}
                >
                  <ThumbCanvas
                    name={entry.name}
                    request={request}
                    version={version}
                    size={thumbPixels}
                  />
                  <span class={styles.name}>{baseName(entry.name)}</span>
                </button>
              );
            }}
          </For>
        </div>
      </div>
      <div class={styles.footer} data-testid="texture-browser-footer">
        <Show when={selectedEntry()} fallback={<span>No texture selected.</span>}>
          {(entry) => {
            version();
            const thumb = () => thumbCache.get(entry().name);
            return (
              <span title={entry().name}>
                {entry().name}
                {thumb()?.width ? ` ${thumb()!.width}×${thumb()!.height}` : ''} — {entry().source}
              </span>
            );
          }}
        </Show>
      </div>
    </div>
  );
}

/** One cell's thumbnail: requests conversion lazily and redraws on arrival. */
function ThumbCanvas(props: {
  readonly name: string;
  readonly request: (name: string) => void;
  readonly version: () => number;
  readonly size: () => number;
}) {
  let canvas: HTMLCanvasElement | undefined;
  createEffect(
    () => [props.version(), props.size()] as const,
    () => {
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const cached = thumbCache.get(props.name);
      const size = props.size();
      context.clearRect(0, 0, size, size);
      if (cached?.bitmap) {
        const scale = Math.min(size / cached.width, size / cached.height, 1);
        const w = cached.width * scale;
        const h = cached.height * scale;
        context.imageSmoothingEnabled = false;
        context.drawImage(cached.bitmap, (size - w) / 2, (size - h) / 2, w, h);
      }
    },
  );
  return (
    <canvas
      width={props.size()}
      height={props.size()}
      class={styles.thumb}
      ref={(el) => {
        canvas = el;
        props.request(props.name);
      }}
    />
  );
}
