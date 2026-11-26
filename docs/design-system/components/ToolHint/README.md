# ToolHint

The tool overlay: a translucent chip at the bottom centre of the view area, shown for a few seconds after the user picks a tool.

**The consumer provides:** the tool's icon, name, shortcut and a one-line description, plus the timing.

- A `surface-2` chip at 85 % opacity with a `radius-md` corner and `shadow-float`, bottom-centre over the views.
- The 16-px icon, the name in `ui-title`, the shortcut in a `mono-small` key cap, and the description in `ui-small` `ink-muted`.
- `pointer-events: none`: the chip never blocks the views.
- `aria-live="polite"`: screen readers announce the tool change.
- No animation: the chip appears and disappears in one frame. It hides while fly mode owns the keyboard, and Settings can turn it off.
