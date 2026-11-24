This system defines the user interface of Joole, a browser-based Quake 2 map editor modeled on Qoole. The viewports follow Qoole's established color conventions, so anyone who has used Qoole or another Q2 editor recognizes them at once. The window chrome is flat and compact, replacing Qoole's Windows 9x bevels and MFC docking.

Write components as CSS Modules that read every value from the `tokens.css` variables. Never hard-code colors, spacing or fonts in a component. Ready-made classes live in `components/bundle.css` (prefixed `q2-`) and are the shared starting point for previews and implementation.

## Language and voice

- **The UI language is always English.** Menus, buttons, titles, tooltips, error messages and log lines are written in English.
- Use the established terms of Q2 mappers without translating or explaining them: *brush*, *entity*, *worldspawn*, *CSG Subtract*, *Hollow*, *Clip*, *Tex Lock*, *leak*, *spawnflags*.
- Write class names, keys and flags exactly as in the game and the `.map` file: `func_door`, `targetname`, `SURF_TRANS33`, `CONTENTS_WATER`. Always set them in the `mono-*` styles.
- Menu items and buttons use Title Case and start with the verb: "Add Brush", "Apply Entity", "Insert Prefab…". An ellipsis means the item opens a dialog.
- Show a shortcut at the right edge of a menu row (`Ctrl+I`) and in parentheses after a tool name: "Clip (C)", "Vertex (V)".
- An error message says what went wrong and what to do: "Move rejected: brush would become non-convex." "Leak found. Press N to step along the leak path." No apologies, no exclamation marks, no emoji.
- Units are Q2 game coordinates ("units"), and the grid is always a power of two: "Grid 8", "24 × 24".

## Color

Colors fall into two groups that are never mixed.

**Chrome** (`surface-*`, `ink-*`, `line*`, `accent`, `select`, `warn`, `error`, `ok`) follows the theme. Dark is the primary theme and light the secondary.

- Grounds and levels: `surface-0` is the app ground and splitter gap, `surface-1` the panel body, `surface-2` title bars, inputs and menus, and `surface-3` the hover state. Only menus and floating windows get a shadow (`shadow-float`).
- Text: `ink` on every surface level, `ink-muted` for secondary text on `surface-1` and `surface-2`, `ink-disabled` only for unavailable items.
- `accent` is Qoole's blue active-window title bar. Use it for the active view's title bar, the highlighted menu row, a pressed tool and the Compile button. Text on an accent fill is always `on-accent`, never white.
- In the UI, `select` means the same as `vp-select` in the viewports: the selected texture and the selected object's texture name. Text on it is `on-select`. Never use red for errors; that is `error`.
- Never show a state with color alone. `warn`, `error` and `ok` always come with an icon or a word ("Warning:", "Error:"). `ok` is blue, not green, so it stays distinct from `error` for red–green color-blind users.

**Viewport** (`vp-*`) is the same in both themes: a black ground and Qoole's colors.

- `vp-bg` is the ground, `vp-grid-minor` the grid at the current size and `vp-grid-major` every 8th line. `vp-axis` marks the world origin axes.
- `vp-brush` is an unselected wireframe, `vp-select` a selected one and `vp-entity` a point entity that has no color of its own in the entity definitions.
- `vp-handle` colors handles and clip plane points, `vp-target` draws target link lines dashed, `vp-leak` the leak path and `vp-scope-dim` the rest of the map while inside a group.
- `vp-invalid` (a dashed orange line) marks a rejected move. It is not red, because red is reserved for selection; the spec follows this.
- In the 3D view, `vp-sky` colors SURF_SKY faces and `vp-toolface` colors NODRAW, clip and hint faces at 35% opacity.
- The renderer reads the `vp-*` values with `getComputedStyle` at startup and whenever the theme changes, so WebGL and the panels share one source.

## Typography

- The UI uses IBM Plex Sans (`--font-ui`) and data uses IBM Plex Mono (`--font-mono`). The application self-hosts both fonts, because it makes no external requests (see AGENTS.md). Only the previews in this folder load them from Google Fonts (`components/bundle.css`).
- `ui-body` (12/16) is the default, and the UI is deliberately dense like a desktop editor. Use `ui-title` in panel title bars, `ui-heading` in floating window titles, `ui-small` in tabs and tooltips, and `ui-label` (uppercase, 0.06em tracking) for group labels such as "SPAWNFLAGS".
- Use `mono-small` for texture names, coordinates and grid size, and `mono-body` for key–value tables and the log. Set numerals tabular.

## Space, sizes and shape

- The workspace is a rectangular grid. Views, panels and splitters use `radius-none` and a 1px `line` border. Buttons, inputs, tabs and texture tiles use `radius-sm`; menus and floating windows use `radius-md`.
- Heights are fixed: `size-titlebar` (22px) for title bars, `size-row` (22px) for rows, `size-control` (26px) for buttons and inputs, `size-toolbar` (34px) for the toolbar and `size-splitter` (4px) for splitters.
- Spacing comes from the `space-*` scale: panel padding is `space-md`, floating window padding `space-lg` and horizontal table cell padding `space-sm`.

## States and focus

- Keyboard focus is a solid 2px `focus-ring` ring after a 1px gap. It meets 3:1 on every surface level in both themes. Never hide focus.
- A pressed tool or toggle (`aria-pressed="true"`) is filled with `accent`. Hover raises the ground to `surface-3`. The active view is marked only by its `accent` title bar, not by a border.
- No animation, except menus opening in at most 80ms. `prefers-reduced-motion` removes that too.

## Iconography

In the source material (Qoole screenshots) the icons are Qoole's own bitmaps, and they are not copied. The icon system is Lucide (`lucide-static`, ISC; the icons derived from Feather are MIT, both GPLv2-compatible): 16 × 16 line icons with a 1.5px stroke in `currentColor`, extended with custom icons for CSG Subtract, Hollow and Clip in the same style. The previews use simple placeholder icons. No emoji.

## Layout

The default layout follows the spec:

- The toolbar runs across the top.
- The four views sit in a 2 × 2 grid in the order 3D, Top, Front, Side.
- The properties panel is on the right.
- The texture browser and the log share the bottom as tabs.

Every splitter is draggable, and F1–F4 maximize a view to the whole workspace. Build the layout with CSS Grid; the four views are one canvas with the title bars laid over it as DOM elements.
