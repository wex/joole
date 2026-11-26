# TODO

List of items to implement or fix:

- Phase 1: New features
  - When a brush is selected, click a texture in the texture list to apply it to the brush
  - When a face is selected, click a texture in the texture list to apply it to the face
  - While painting a brush, a box should be displayed to show the current size of the brush
  - Painting a brush should respect the grid size and auto-lock to it
  - While using texture tool, current brush OR side should be highlighted in 2D and 3D view
  - When using mouse right click in a view/panel, it should not do anything unless there is a context menu for that view/panel
  - Mouse wheel in 3D view should move forward/backward even even when the free camera mode is not enabled
  - When using texture tool, and a brush OR side is selected, there should be a previous/next button in Properties-view to navigate between the main brush and all sides
  - When handling a brush, the brush should be highlighted in 2D and 3D view (like when selected)
  - In vertex/edge mode, the edge should be highlighted with a larger highlighted dot which is easier to see and easier to select/click
  - In face mode, the face should be highlighted with a larger highlighted dot which is located at the center of the face - this way it's easier to see and select/click
  - When a whole brush is selected, pressing delete should delete the brush without asking for confirmation
  - Resizing a brush should respect the grid size and auto-lock to it
  - Vertex/edge/face mode should also respect the grid size and auto-lock to it
  - When moving a vertex/edge/face, it should snap to the grid size
  - When moving a vertex/edge/face, it should also show a box to show the current size of the brush
  - Properties-view should be a collapsible panel that can be opened/closed
  - Texture list should be in the same panel as Properties-view
  - Texture list should have a slider to adjust the size of the texture previews
  - You should be able to enable grouping mode visually in 2D and 3D view by pressing G - all brushes that are selected will be grouped together when Ctrl+G is pressed
  - You should be able to ungroup brushes by pressing Shift+G
  - Hollow and CSG tools should create groups automatically
  - We need a persisent options/settings modal that can be opened from the menu bar
  - When selecting a tool from a toolbar (or using a hotkey), the app should show a transparent overlay with the shortcut/keybind, icon and tool name & description for a few seconds - this needs to be possible to disable in settings
  
- Phase 2: Future features
  - User should be able to create, save and load projects
  - User should be able to create custom arrangements of tools/windows in app and save them
  - Redo/undo functionality
  - Qoole's .qle format should be supported
  - Importing a BSP file should be possible

- Phase 3: Investigation for future development
  - Create a native desktop version
  - Run Quake 2 in browser using WebAssembly
