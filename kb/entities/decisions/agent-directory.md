---
{
  "type": "decision",
  "name": "The tower is a directory for its agents, not a transport",
  "summary": "Every worker the tower runs can learn who it is and who else is on duty, on every floor, through a tower command the mod puts on its PATH; it reaches another worker through Claude Code's own session messaging, by the peer name the board joins onto each card.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-08",
  "refs": ["hub/src/directory.ts", "hub/src/directory.ts#cardNamed", "hub/src/mod/bin/tower", "hub/src/mod/skills/handbook/SKILL.md", "hub/src/bridge/resources.ts#peers", "hub/src/machine.ts#peersIn", "hub/src/bridge/board.ts#board", "hub/src/shared/launch.ts#resumeRequest", "hub/src/bridge/chains.ts#resumeName", "hub/src/shared/callsign.ts#callsigns", "hub/src/shared/launch.ts#spawnRequest", "hub/src/shared/cards.ts#spawnCall"]
}
---
**Problem.** The user names workers by [[callsign]] ("reach out to DAEDALUS-88"), but a worker knew neither its
own callsign nor anyone else's. Claude Code already carries messages between sessions on the machine
(`ListAgents`, `SendMessage`), under names of its own (`managing-claudes-9a`). Nothing told a worker which
name belongs to which callsign, floor or task.

**Decision.**
- The board joins each card to its Claude's peer name (`card.peer`). Claude Code registers every running Claude in
  `~/.claude/sessions/<pid>.json` with its `name`. A registration whose pid is a host's child carrying the
  session's `TOWER_SESSION_ID` belongs to that session's own Claude ([`peers`](ref:hub/src/bridge/resources.ts#peers)).
  The live system reads it with the leftovers every 5 s, from the same `ps` scan.
- Every spawn and resume passes the worker's [[callsign]] as Claude's `--name` (composed in `launch.ts`, see
  [[host-knows-no-flags]]), so a worker's peer name is its callsign, across resumes too: a resume that carries a
  worker on runs under its callsign ([`resumeName`](ref:hub/src/bridge/chains.ts#resumeName)), a fork under its
  own. The join still names sessions started before a host ran this. `cardNamed` finds a callsign on several cards
  (a worker on duty wins over past ones), reading the floors' archives when no worker on duty has it ([[board-archive]]).
- The tower mod ships `bin/tower` (`src/directory.ts`), which Claude Code puts on the Bash tool's PATH:
  `tower whoami` (also the floor's shelf, its collections and the config's path), `tower agents`, `tower agents --all`, `tower api [name]` (the API's verbs and reads from `/schema`, one line each), `tower agent <CALLSIGN>` (one worker's last prompts
  and the answers to them in full, from `/conversations/<id>`, and a line per earlier session it ran as). It reads the running tower's `/board`, the
  [[renderer-api]], and folds no logs. Its skill (`skills/handbook`) teaches the tower, the command, and how to
  reach out. The skill pre-approves `Bash(tower *)`.
- Every spawn and resume appends a short tower brief to Claude's system prompt (`--append-system-prompt`, composed in
  `launch.ts`): the session is a tower worker, a callsign is not a `SendMessage` name. Without it, Haiku read "reach
  out to Q-61" (an older callsign) as a job for `SendMessage` alone and never opened the skill. Since 2026-10-07 the
  brief carries the recipe itself (`tower agents`, the **message as** name, sign with your callsign) and the skill is
  the handbook for the rest ([[brief-first]]). It names the person running the tower "the user", as the skills and the CLI do, and says
  the name the config gives them once, when it gives one; it also tells a worker not to create or remove git
  worktrees unless the user asks ([[the-user]]).
- `tower thread [checkout]` and `tower note [on <checkout>] [re n<k>] [repo:path:lines …]` read and append to a
  checkout's review thread ([[review-threads]]); the skill's Reviews section says to read the thread when told of new
  notes, act, and answer each with `re`. `tower send <CALLSIGN>` submits into a worker a pointer to the notes new to
  it, as the page's Send does; `tower review <CALLSIGN> [tell]` hires a reviewer through the card's `review` call
  ([[reviewer]]). The mod's second skill, `review`, is what a reviewer starts on (`/tower:review <CALLSIGN>`).
- `tower reveal <path>` and `tower edit <path> [line]` show a file the system names in the user's Finder or open it
  in their editor, through the renderer API's `reveal` and `edit` ([[open-files]]).
- `tower agents` lists crews, each worker under the one it reports to, and `tower home <CALLSIGN>` sends a worker
  home with everyone under it ([[crews]]).
- `tower hire [<tag|id>] [model <m>] [effort <e>] [name <n>] [base origin/<b>]` starts a worker on the hirer's
  floor, on a prompt read from stdin or from any item of the floor's collections by its tag: the core reads an
  item's text and never what a draft means ([[collections]]). It sends what a quick hire in a renderer sends, built
  by the same [`spawnCall`](ref:hub/src/shared/cards.ts#spawnCall) over the floor's offered calls, so it lands where
  the renderers would land it. It refuses past the floor's `hiring` limits, and logs who hired whom ([[hiring-limits]]).
- The directory is read-only. `tower show` and `tower open` write only to the worker's own log ([[agent-show]]); `tower keep` adds to the floor's collections ([[agent-keep]]). A peer message is Claude Code's, visible in both sessions.
  At first workers never spawned, prompted, killed or reaped workers, by a rule in the skill; since 2026-10-06 they
  hold every verb of the renderer API ([[agents-have-every-capability]]).

**Alternatives considered.**
- *The join only, without `--name`.* Rejected: every worker would answer to two names forever.
- *`--name` only.* Rejected: it needs a host restart before it works, and sessions started earlier would have no
  name in the directory.
- *The command folds the logs itself, like `tower ls`.* Rejected: 300+ MB of logs per call, and it would be a second
  reader beside the renderer API.
- *A transport of the tower's own (a mailbox in collections).* Rejected: Claude Code already delivers messages,
  and peer messages stay Claude's.
- *Agent verbs to write collections.* Deferred at first; workers now add to them ([[agent-keep]]) and edit what they kept ([[workers-edit-kept-items]]).
- *The skill alone.* Rejected: a skill loads when Claude judges it relevant, and Claude's own messaging tools
  match "reach out" first (observed with Haiku).

**Consequences.** The directory depends on a file format Claude Code doesn't document: a change in the
fields of `~/.claude/sessions/*.json` leaves `peer` empty. With the tower down, `tower` fails and says how to
start it. Claudes started outside the tower are not on the board; `ListAgents` still lists them.
