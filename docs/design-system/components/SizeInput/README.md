# SizeInput

The inline brush size field: a small text field drawn over a 2D view where a brush is created by a click (Brush tool) or where the selection is resized by Enter (Select tool).

**The consumer provides:** the position (the clicked point or the selection's centre in the view), the prefill or placeholder, and the submit and cancel actions.

- A `size-control`-high input in `mono-body`, `surface-2` with a `line-strong` border, `radius-sm` corners and `shadow-float`, 168 px wide, centred on the point and clamped inside the view.
- It takes the focus when it opens. Enter applies, Escape and leaving the field cancel.
- The text is "width height depth" of the view, separated by spaces or commas. The accessible name says so: "Brush size, width height depth".
- An invalid value keeps the field open: the border turns `error`, `aria-invalid` is set, and the message below it in `ui-small` `error` is announced as an alert. Nothing changes until the value is valid.
- No animation.
