# Example extensions

Folders to copy and make your own: none runs until the config names it (`extensions.<id>.path`). `npm test` loads
each one as `tower extensions check` does, so every example here works with the tower it ships with.

- [`narrate`](narrate/): Listen on every draft, read aloud by the browser; the voice is one function to swap.
- [`grid`](grid/): a view in the main pane, workers' terminals side by side, kept per floor across reloads.

How extensions work: [docs/extending.md](../../docs/extending.md#extensions).
