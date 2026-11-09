# Example extensions

Folders to copy and make your own: none runs until the config names it (`extensions.<id>.path`). They import the
tower's helpers from [the library](../../docs/extending.md#the-library) (`/lib/*.js`) and nothing else of it, so a copy
anywhere loads, and [`tower types`](../../docs/extending.md#types-outside-the-checkout) types a copy. `npm test` loads
each one as `tower extensions check` does, so every example here works with the tower it ships with.

- [`narrate`](narrate/): Listen on drafts, shown files and sections, and workers' memos said aloud; the voice a command
  you choose, with samples for macOS `say` and ElevenLabs. Its README is the one other extensions' follow.
- [`tabline`](tabline/): a line under a worker's card, written by the user or the worker itself: a manifest with a
  writable fact and a projected fold, no code but the command that asks for the line.
- [`tabline-remind`](tabline-remind/): tab line, with its workers reminded to keep their line, in their brief as each
  starts or resumes, or at each prompt: one capability's other implementation (`provides`), with a launch contributor
  and a Claude hook.
- [`handoff`](handoff/): a skill that teaches workers to leave a handoff note, an extension that is only a Claude
  plugin, the one to copy for an extension that teaches workers.
- [`grid`](grid/): a view in the main pane, workers' terminals side by side, kept per floor across reloads.
- [`chat`](chat/): a plain text box at the foot of a worker's Brief that sends it a prompt while it waits at its
  prompt, the view to copy for `card.composer`: no server code, a refusal said under the box with the text kept.
- [`files`](files/): a Files tab on every worker, its checkout as a tree with git's marks, a file opened beside it by
  the view its type picks, code highlighted as VS Code draws it. A copy runs `npm install` for Shiki.
- [`pr-status`](pr-status/): badges on a worker's card naming its branch's pull request, where it stands and its review
  and checks, asked of GitHub in one batched `gh` query as a turn ends and on a backed-off clock, kept in a stream only
  when it changes.

How extensions work: [docs/extending.md](../../docs/extending.md#extensions). What an extension's README holds, and how
its pictures are taken: [An extension's README](../../docs/extending.md#an-extensions-readme).
