A view's frame: a title bar (name, axes or cursor coordinates, maximize button) over a WebGL canvas drawn in the `vp-*` colors.

**The consumer provides:** the view name (`Top`, `Front`, `Side`, `3D`), the coordinate text and whether the view is active.

- The active view's title bar is `accent` with `on-accent` text. Only one view is active at a time.
- Set coordinates in `mono-small` as `X, Y: -39, 169`. They follow the cursor; when the cursor is outside the view, show the axes only.
- Viewport conventions: grid `vp-grid-minor`, every 8th line `vp-grid-major`, origin `vp-axis`, brush `vp-brush`, selection `vp-select`, entity `vp-entity`, handles `vp-handle`, target lines `vp-target` dashed, leak `vp-leak`, rejected move `vp-invalid` dashed, and in scope mode the rest of the map `vp-scope-dim`.
- Lines are 1px; selection is drawn with a 1.5px line. Draw a measurement (such as `24 × 24`) in `vp-label` above the selection.
- Never use theme colors inside a viewport. The black ground is the same in both themes.
