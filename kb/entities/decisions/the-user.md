---
{
  "type": "decision",
  "name": "Agents read \"the user\"; a name, when needed, comes from the config",
  "summary": "Everything a worker reads (the system-prompt brief, the mod's skills, the tower CLI, API descriptions) calls the person running the tower \"the user\". The config's optional user.name signs the notes renderers write for them (\"user\" when unset), reaches renderers as board.user.name, and is said once in the brief so a worker can match it on review notes.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-27",
  "refs": [
    "hub/src/shared/model.ts#UserConfig",
    "hub/src/shared/model.ts#userName",
    "hub/src/shared/model.ts#configuredUser",
    "hub/src/bridge/board.ts#Board",
    "hub/src/shared/launch.ts#towerBrief",
    "hub/extensions/reviews/client/reviews.ts#THE_USER",
    "hub/extensions/reviews/client/reviews.ts#sendText",
    "hub/extensions/reviews/client/panel.ts#ThreadView",
    "hub/src/shared/changes-panel.ts#ChangesView",
    "hub/src/directory.ts#agent",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/src/mod/skills/review/SKILL.md",
    "hub/src/mod/skills/guide/SKILL.md"
  ]
}
---
**Problem.** A worker's prompts, skills and CLI output named one person, the repo's author. Anyone else running the
tower got agents that talked about someone else.

**Decision.**
- Agent-facing text says "the user": [`towerBrief`](ref:hub/src/shared/launch.ts#towerBrief), the mod's
  skills, every `tower` message and the API's descriptions.
- `config.user.name` ([`UserConfig`](ref:hub/src/shared/model.ts#UserConfig)) signs the notes renderers write for the
  user, `user` when unset ([`userName`](ref:hub/src/shared/model.ts#userName)). The board carries it as
  `board.user.name`, so a renderer written from scratch signs the same way. The Changes and Reviews panels take it as
  `user` ([`ThreadView`](ref:hub/extensions/reviews/client/panel.ts#ThreadView)), label their composers with it and mark notes signed
  with it as the viewer's own.
- The brief says the name once, "the user (Ana)", only when the config gives one, so a worker knows whose notes
  `## Ana · …` are.
- Send's prompt names its sender: a callsign, or [`THE_USER`](ref:hub/extensions/reviews/client/reviews.ts#THE_USER) from a renderer
  ([`sendText`](ref:hub/extensions/reviews/client/reviews.ts#sendText)).
- The brief tells every worker not to create or remove git worktrees unless the user asks: a rule of the tower, not of
  one user's own instructions.

**Alternatives considered.**
- *The OS login name as the default.* Often cryptic, and it reads the machine where a plain word does.
- *The name everywhere in prompts.* Agents need to know who "the user" is once; a name on every line makes the
  skills one person's.
- *The name in `tower whoami`.* The brief reaches every worker without a call.

**Consequences.** Notes are matched to the user by value only in the panels' "mine" mark: after a rename, older notes
show as someone else's, and still read and count correctly (`unseenBy` is asked only for workers' callsigns). A name no
note heading can carry is a config error, thrown where the name is read
([`configuredUser`](ref:hub/src/shared/model.ts#configuredUser)): the board stream sends it and every spawn and resume
refuses with it until it is fixed ([[board-errors]]). The repo's own knowledge (`AGENTS.md`, the kb, code, tests) says
"the user" too and names no maintainer, so a fork carries it on.
