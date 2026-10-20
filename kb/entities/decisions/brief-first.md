---
{
  "type": "decision",
  "name": "The system prompt carries the everyday recipes; the tower:handbook skill is the handbook",
  "summary": "The tower brief every worker gets in its system prompt says what it does on every turn, most important first: tower whoami, reaching a peer by its message-as name, tower show for every file or page made for the user, kept where it lasts, stopping what it started by PID, tower keep drafts. The tower:handbook skill holds the rest: reviews, hiring, crews, kept items, the shelf and the config, worktrees and the API.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-20",
  "refs": ["hub/src/shared/launch.ts#towerBrief", "hub/src/mod/skills/handbook/SKILL.md"]
}
---
**Problem.** A worker learns the tower from two texts: the tower brief in its system prompt, sent on every turn,
and the `tower:handbook` skill, loaded only when a session decides to. The verbs workers use right without loading
the skill are the ones the brief spells out, and a session that never loads the skill still has to show its work,
keep its ideas and reach a peer correctly.

**Decision.**
- The tower brief ([`towerBrief`](ref:hub/src/shared/launch.ts#towerBrief)) is a short list, most important first:
  run `tower whoami` as you start; reach a worker by its **message as** name from `tower agents`, signing with your
  callsign and naming commits and paths; every file or page made for the user gets `tower show` (a path named in
  an answer is not shown), kept where it lasts rather than in a temporary folder unless it is throwaway, and shown
  again after a change; what it starts it stops by PID, since `pkill -f` or `killall` with a pattern matches other
  workers, whose command lines carry their briefs and paths; off-goal ideas and later prompts go to
  `tower keep drafts`, edited in place afterwards. A last line names
  what the skill holds and keeps the worktree rule.
- The skill (`SKILL.md`) is the handbook: the CLI in full, reaching out step by step, reviews, hiring and crews,
  showing and keeping in detail, policies, the floor's shelf and the config, worktree rules, the API. It doesn't
  repeat the brief's prose. Its description triggers on callsigns, workers and reaching another session, and on
  reviews, hiring, crews, kept items, policies, the shelf and the config.
- The brief's last line names the shelf and the config: a worker cold to the tower read the user's "shelf" as a
  collection, since neither text said the word.
- Showing and stopping are tooling, not rules: they say how the tower sees a worker's files and what its command
  lines hold, and leave where files go to the user's own instructions. Workers named files' paths without showing
  them, and showed files from temporary folders a later renderer couldn't reach; checkers stopping their dev servers
  with `pkill -f` killed every worker on a machine (on macOS a trailing `-n` is read as a second pattern, matching
  every `--name`).

**Alternatives considered.**
- *Keep "load the skill first" in the brief.* It was written for Haiku, which read "reach out to Q-61" as a job for
  `SendMessage` alone ([[agent-directory]]). The brief now carries the recipe that prevents that, and a session that
  never loads the skill still does it right.
- *The whole skill in the system prompt.* It is sent on every turn of every session, and most turns need none of
  reviews, hiring or the API.

**Impact.** The brief is a little longer, and sent on every turn. A session gets the brief it was started or
resumed with.
