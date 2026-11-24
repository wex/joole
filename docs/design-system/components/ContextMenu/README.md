The viewport's right-click menu and its submenus (Add Brush, Add Entity, Apply Entity → func → class).

**The consumer provides:** the menu tree (label, shortcut, submenu, enabled or not) and the actions.

- A row is `size-row` tall. The highlighted row is `accent` with `on-accent` text.
- A submenu opens to the right with a 4px overlap. An arrow on the right means a submenu; `…` means a dialog.
- The shortcut sits at the right edge of the row in `mono-small`. Unavailable items are `ink-disabled` and stay visible.
- Separate groups with a `line` rule. List entity classes alphabetically by their definition names (`func_door_secret`), not Qoole's plain-language names ("Door Secret").
