# Dialog

A modal dialog for the few tasks that need one — Settings is the first. An ellipsis (`…`) in a menu item always means a dialog.

**The consumer provides:** the title, the contents, and the close action.

- A `surface-0` scrim at 60 % covers the workspace; the body is `surface-1` with a `radius-md` corner and `shadow-float`.
- The title is a `ui-heading`; the padding is `space-lg`.
- The focus is trapped inside: Tab wraps around the dialog's controls, Escape closes the dialog, and the opener gets the focus back. The dialog carries `role="dialog"` and `aria-modal="true"`.
- Changes apply immediately. A dialog has no OK/Cancel step unless the change is destructive.
- No animation: the dialog appears and disappears in one frame.
