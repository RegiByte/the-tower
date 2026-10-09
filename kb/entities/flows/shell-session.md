---
{
  "type": "flow",
  "name": "Shell session",
  "summary": "A shell opened from the tower in a project directory, watched as a docked tab and kept running across tower restarts.",
  "in": "tower",
  "reviewed": "2026-10-09",
  "involves": ["operator", "tower-server", "terms-daemon"],
  "refs": ["hub/src/terms/main.ts#spawnShell", "hub/src/terms/main.ts#attach", "hub/src/tower/server.ts#streamShell"]
}
---
```mermaid
sequenceDiagram
  participant O as [[operator]]
  participant T as [[tower-server]]
  participant S as [[terms-daemon]]
  O->>T: new shell on a project dir
  T->>S: spawn {project, cwd}
  S-->>T: spawned sh-<id>
  O->>T: open the tab
  T->>S: attach sh-<id>
  S-->>T: snapshot, then o / r / x
  O->>T: keys, resize
  T->>S: write, resize
  O->>T: × on the tab
  T->>S: kill
```

- A shell starts from a directory's shell button in a floor, or from the dock's `+`, which lists every place a shell
  can start ([`shellPlaces`](ref:hub/src/shared/cards.ts#shellPlaces)), the floor in view first.
- Keys go through the shared [`terminalKeymap`](ref:hub/src/shared/termkeys.ts#terminalKeymap), as in every browser
  terminal ([[keymap]]): ⌥Esc leaves the shell, and the Mac editing keys (⌘⌫, ⌘←, Shift+Enter, …) become the readline keys a shell reads
  ([[renderer-shared-modules]]).
- Collapsing a tab only closes the stream; the shell keeps running.
- Two viewers of one shell fight over its size: the last to fit wins.
- Nothing is logged. A terms daemon restart ends every shell.
