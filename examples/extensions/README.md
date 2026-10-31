# Example extensions

Folders to copy and make your own: none runs until the config names it (`extensions.<id>.path`). `npm test` loads
each one as `tower extensions check` does, so every example here works with the tower it ships with.

- [`narrate`](narrate/): Listen on every draft, read aloud by the browser; the voice is one function to swap.
- [`tabline`](tabline/): a line under a worker's card, written by the user or the worker itself: a manifest with a
  writable fact and a projected fold, no code but the command that asks for the line.
- [`grid`](grid/): a view in the main pane, workers' terminals side by side, kept per floor across reloads.
- [`files`](files/): a Files tab on every worker, its checkout as a tree with git's marks, a file opened beside it by
  the view its type picks, code highlighted as VS Code draws it. Runs in place from the checkout.

How extensions work: [docs/extending.md](../../docs/extending.md#extensions). What an extension's README holds, and how
its pictures are taken: [An extension's README](../../docs/extending.md#an-extensions-readme).
