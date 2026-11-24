A tab row for switching panel content and maximizing a view. It replaces Qoole's bottom bar buttons (Config, Entity, Tex Prop, Textures, Top XY…).

**The consumer provides:** the tab names and the selected tab.

- The selected tab is `surface-2` with a `line-strong` border, in `ui-small` set bold. The others are `ink-muted`.
- View tabs sit on the right and show their shortcut (`F1`–`F4`).
- Use `role="tablist"` and `aria-selected`. Arrow keys move the selection.
