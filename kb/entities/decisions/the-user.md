---
{
  "type": "decision",
  "name": "Agents read \"the user\"; a name, when needed, comes from the config",
  "summary": "Everything a worker reads (the system-prompt brief, the mod's skills, the tower CLI, API descriptions) calls the person running the tower \"the user\". The config's optional user.name signs the notes renderers write for them (\"user\" when unset), reaches renderers as board.user.name, and is said once in the brief so a worker can match it on review notes.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-10",
  "refs": [
    "hub/src/shared/model.ts#UserConfig",
    "hub/src/shared/model.ts#userName",
    "hub/src/shared/model.ts#configuredUser",
    "hub/src/bridge/board.ts#Board",
    "hub/src/shared/launch.ts#towerBrief",
    "hub/src/shared/reviews.ts#THE_USER",
    "hub/src/shared/reviews.ts#sendText",
    "hub/src/shared/panels.ts#ThreadView",
    "hub/src/shared/panels.ts#ChangesView",
    "hub/src/directory.ts",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/src/mod/skills/review/SKILL.md"
  ]
}
---
**Problem.** Every prompt, skill and CLI message a worker read named the author of this repo: the tower brief, both
mod skills, `tower` output ("Latest prompt from …"), the review threads' operator (`OPERATOR`, a constant), and API
descriptions. Anyone else running the tower got agents that talked about someone else.

**Decision.**
- Agent-facing text says "the user": [`towerBrief`](ref:hub/src/shared/launch.ts#towerBrief), the `tower` and
  `review` skills, every `tower` message, and the API's descriptions.
- `config.user.name` ([`UserConfig`](ref:hub/src/shared/model.ts#UserConfig)) is the one name a human-facing surface
  needs: it signs the notes renderers write for the user, `user` when unset
  ([`userName`](ref:hub/src/shared/model.ts#userName)). The board carries it as `board.user.name`, so a renderer
  written from scratch signs notes the same way. The Changes and Reviews panels take it as `user`
  ([`ThreadView`](ref:hub/src/shared/panels.ts#ThreadView)), label their composers with it and mark notes signed with
  it as the viewer's own.
- The brief says the name once, "the user (Ana)", only when the config gives one: a worker then knows whose notes
  `## Ana · …` are, and who "Ana" is when the user names themselves. With no name, notes are signed `user`.
- Send's prompt names its sender: a callsign, or [`THE_USER`](ref:hub/src/shared/reviews.ts#THE_USER) from a renderer
  ("Review notes from the user (n3) on checkout …").
- The brief also carries the worktree rule that lived in a user's own global CLAUDE.md: don't create or remove git
  worktrees unless the user asks, the tower cuts and tidies them; when started in one, work there. It belongs to every tower
  worker, not to one user's customization.

**Alternatives considered.**
- *The OS login name as the default.* Rejected: often cryptic (`rjunior`), and it reads the machine where a plain
  word does.
- *The name everywhere in prompts.* Rejected: agents need to know who "the user" is once; saying a name on every
  line makes the skills one person's.
- *The name in `tower whoami`.* Rejected for now: the brief reaches every worker without a call.

**Consequences.** Notes are matched to the user by value only in the panels' "mine" mark: after a rename, older
notes signed with the previous name show as someone else's, and still read and count correctly (`unseenBy` is
asked only for workers' callsigns). A name no note heading can carry (empty, holding `·` or a line break, or spaced at an end) is a config error, thrown where the name is read ([`configuredUser`](ref:hub/src/shared/model.ts#configuredUser)): the board stream sends it as a `config` error, which every renderer shows, and every spawn and resume refuses with it, until it is fixed ([[board-errors]]). The tower page and Tower 3D show it over their last board, and the board comes back once the config is saved.
The repo's own knowledge (`AGENTS.md`, the kb, code, tests and fixtures) says "the user" too since 2026-10-08, and names no maintainer: it belongs to the project, and a fork carries it on (AGENTS.md, "Who's who"). A maintainer's personal memory lives outside version control.
