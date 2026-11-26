# ToolHint

The tool overlay: a translucent chip at the bottom centre of the view area, shown for a few seconds after the user picks a tool.

**The consumer provides:** the tool's icon, name, shortcut and a one-line description, plus the timing.

- A `surface-2` chip at 85 % opacity with a `radius-md` corner and `shadow-float`, bottom-centre over the views.
- The chip is twice the base size: a 32-px icon, a 26 px name, a 22 px `mono` key cap and a 24 px `ink-muted` description. Every dimension is the base size times the `--hint-scale` custom property (2), so a later setting can change the scale in one place. The chip never grows wider than the window; a long description wraps.
- `pointer-events: none`: the chip never blocks the views.
- `aria-live="polite"`: screen readers announce the tool change.
- No animation: the chip appears and disappears in one frame. It hides while fly mode owns the keyboard, and Settings can turn it off.
