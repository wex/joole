The top toolbar: file, undo/redo, tool modes, CSG commands, grid size, Tex Lock and Compile.

**The consumer provides:** the current tool mode, the grid size (1–256, a power of two), the Tex Lock state and the Compile action.

- Groups are separated by a vertical `line` rule in this order: file, history, tool modes, CSG, grid and lock, compile.
- Tool modes are icon buttons with `aria-pressed`. The pressed state is filled with `accent`. The tooltip gives the name and shortcut: "Clip (C)".
- Show the grid size as text, "8 units" (`mono-small`). The slider and the `[` and `]` keys change it in powers of two.
- Compile is the only primary button (`is-primary`). It opens the compile profile choice (Fast, Normal, Final).
- The toolbar does not float or dock as it did in Qoole.
