The editor's default layout: toolbar, 2 × 2 views, properties panel on the right, and textures and log at the bottom.

**The consumer provides:** the views' canvas element, the panels' content and the saved splitter positions.

- Build it with CSS Grid. Rows and columns are `minmax(0, 1fr)` so the canvas never stretches the grid.
- A splitter is `size-splitter` wide, with `surface-0` showing through. Dragging a splitter resizes the grid tracks.
- The view order is 3D, Top, Front, Side (Qoole used Top, 3D, Back, Side). 3D sits top-left because it is active by default.
- F1–F4 maximize one view to the whole 2 × 2 area, and the same key restores the grid.
- Add no margins or rounding around the views. The workspace is one continuous grid.
