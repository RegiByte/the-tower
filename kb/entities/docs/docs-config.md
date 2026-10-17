---
{
  "type": "doc",
  "name": "docs/config.md",
  "summary": "The one place every config key is documented, with what it takes and its default; it restates the keys the tower reads, so a change to them re-checks it.",
  "in": "tower",
  "reviewed": "2026-10-17",
  "refs": ["hub/src/shared/model.ts#CONFIG_KEYS", "hub/src/shared/model.ts#PROJECT_KEYS", "hub/src/config-check.ts#configProblems", "hub/src/bridge/probes.ts#BUILT_INS", "hub/src/shared/keymap.ts#COMMANDS", "hub/src/shelf.ts#SHELF_KINDS", "hub/src/renderers.ts#BUILT_INS", "hub/src/shared/launch.ts#settingsArgs"]
}
---
`docs/config.md` documents `~/.tower/config.json` key by key: the top level
([`CONFIG_KEYS`](ref:hub/src/shared/model.ts#CONFIG_KEYS)), a project
([`PROJECT_KEYS`](ref:hub/src/shared/model.ts#PROJECT_KEYS)), the probes ([[probes]]), the shelf's kinds
([`SHELF_KINDS`](ref:hub/src/shelf.ts#SHELF_KINDS), [[shelf]]), collections ([[collections]]), worktrees, hiring
([[hiring-limits]]) and the keymap's commands and chords
([`COMMANDS`](ref:hub/src/shared/keymap.ts#COMMANDS), [[keymap]]). `tower config check` runs
[`configProblems`](ref:hub/src/config-check.ts#configProblems) and points at it.

A new key, a changed default or a new command lands with its row here (AGENTS.md: "the one place they are
documented"); the typecheck holds `CONFIG_KEYS` to the `Config` type, nothing holds this file to either.
