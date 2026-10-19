---
{
  "type": "decision",
  "name": "The tower is a directory for its agents, not a transport",
  "summary": "Every worker the tower runs can learn who it is and who else is on duty, on every floor, through a tower command the mod puts on its PATH; it reaches another worker through Claude Code's own session messaging, by the peer name the board joins onto each card.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-19",
  "refs": ["hub/src/directory.ts#USAGES", "hub/src/directory.ts", "hub/src/directory.ts#cardNamed", "hub/src/mod/bin/tower", "hub/src/mod/skills/handbook/SKILL.md", "hub/src/bridge/resources.ts#peers", "hub/src/machine.ts#peersIn", "hub/src/bridge/board.ts#board", "hub/src/shared/launch.ts#resumeRequest", "hub/src/bridge/chains.ts#resumeName", "hub/src/shared/callsign.ts#callsigns", "hub/src/shared/launch.ts#spawnRequest", "hub/src/shared/cards.ts#spawnCall"]
}
---
**Problem.** The user names workers by [[callsign]] ("reach out to DAEDALUS-88"), but a worker knew neither its
own callsign nor anyone else's. Claude Code already carries messages between sessions on the machine
(`ListAgents`, `SendMessage`), under names of its own (`managing-claudes-9a`). Nothing told a worker which
name belongs to which callsign, floor or task.

**Decision.**
- The board joins each card to its Claude's peer name (`card.peer`). Claude Code registers every running Claude in
  `~/.claude/sessions/<pid>.json` with its `name`. A registration whose pid is a host's child carrying the
  session's `TOWER_SESSION_ID` belongs to that session's own Claude ([`peers`](ref:hub/src/bridge/resources.ts#peers)),
  read by the live system with the leftovers, from the same `ps` scan.
- Every spawn and resume passes the worker's [[callsign]] as Claude's `--name` ([[host-owns-ptys]]), so a worker's
  peer name is its callsign, across resumes too: a resume that carries a worker on runs under its callsign
  ([`resumeName`](ref:hub/src/bridge/chains.ts#resumeName)), a fork under its own.
  [`cardNamed`](ref:hub/src/directory.ts#cardNamed) finds a callsign on several cards (a worker on duty wins over past
  ones), reading the floors' archives when no worker on duty has it ([[board-archive]]).
- The tower mod ships `bin/tower` (`src/directory.ts`), which Claude Code puts on the Bash tool's PATH. Its verbs and
  their usage are one table, [`USAGES`](ref:hub/src/directory.ts#USAGES) (`tower <verb> --help`, and listed when a
  verb is unknown); AGENTS.md and [[tower-mod]] name them, and each verb's decision says what it does
  ([[review-threads]], [[reviewer]], [[crews]], [[leave]], [[let-go]], [[hiring-limits]], [[policies]], [[probes]],
  [[open-files]], [[agent-show]], [[workers-edit-kept-items]]). `tower whoami` says who the worker is, its floor, its
  shelf and collections and the config's path; `tower agents [--all]` and `tower agent <CALLSIGN>` read the running
  tower's `/board` and `/conversations/<id>` through the [[renderer-api]]. The directory folds no logs.
- `tower hire` sends what a quick hire in a renderer sends, built by the same
  [`spawnCall`](ref:hub/src/shared/cards.ts#spawnCall) over the floor's offered calls, on a prompt from stdin or from
  any item of the floor's collections by its tag: the core reads an item's text and never what a draft means
  ([[collections]]). `floor <id>` sends it to another floor's calls, when the user asks for work there ([[hire]]).
- Its skill (`skills/handbook`) teaches the tower, the command, and how to reach out, and pre-approves `Bash(tower *)`.
  Every spawn and resume also appends a short tower brief to Claude's system prompt (`--append-system-prompt`): the
  session is a tower worker, a callsign is not a `SendMessage` name, and the recipe to reach one ([[brief-first]],
  [[the-user]]).
- A peer message is Claude Code's, visible in both sessions. Workers hold every verb of the renderer API
  ([[agents-have-every-capability]]).

**Alternatives considered.**
- *The join only, without `--name`.* Every worker would answer to two names forever.
- *The command folds the logs itself, like `tower ls`.* Every log read per call, and a second reader beside the
  renderer API.
- *A transport of the tower's own (a mailbox in collections).* Claude Code already delivers messages,
  and peer messages stay Claude's.
- *The skill alone, no brief.* A skill loads when Claude judges it relevant, and Claude's own messaging tools match
  "reach out" first.

**Consequences.** The directory depends on a file format Claude Code doesn't document: a change in the
fields of `~/.claude/sessions/*.json` leaves `peer` empty. With the tower down, `tower` fails and says how to
start it. Claudes started outside the tower are not on the board; `ListAgents` still lists them.
