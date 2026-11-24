Entity properties: class picker (category and class), spawnflags checkboxes and a raw key–value table.

**The consumer provides:** the entity definitions (classes, flags, key types) and the selected entity's key–value pairs in order.

- The upper select is the category and the lower one the class, as in Qoole (Misc → Path Corner). Switching to a brush class turns the selected brushes into that entity.
- Show spawnflags in two columns with the flag names in capitals, as in the definition file.
- The table uses `mono-body`. The key column is `surface-1` with `ink-muted`, the value column `surface-2`. The last row is "(new key)"; typing into it adds a key.
- Unknown keys are shown and kept in their order. Typed keys get their own editor (`_color` a color picker, `angle` a compass, `target` a dropdown).
- By default the panel is docked in the properties panel. Floating, it uses the `q2-float` style.
