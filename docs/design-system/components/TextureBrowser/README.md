The texture browser: folder and texture count in the title, a name filter, an In use filter, thumbnails, and the selected texture's details in the footer.

**The consumer provides:** the texture list (name, size, source pak), the selected texture and the thumbnail bitmaps.

- A thumbnail is `size-thumb` (default 64px, adjustable 32–128) and is drawn with `image-rendering: pixelated` so Q2's texels stay sharp.
- The selected texture gets a `select` outline and a name label on `select` with `on-select` text. This comes straight from Qoole (the red name label).
- Show the name without its folder in `mono-small`, truncated with an ellipsis. The full path appears in the footer and the tooltip.
- An unloaded texture shows as a checker pattern until the worker has converted it.
- A mod's textures appear as their own root folder, and the footer names the source (`rogue/pak0.pak`).
