---
{
  "type": "decision",
  "name": "The system prompt carries the everyday recipes; the tower:handbook skill is the handbook",
  "summary": "The tower brief every worker gets in its system prompt says what it does on every turn, most important first: tower whoami, reaching a peer by its message-as name, tower show for every file or page written for the user, tower keep drafts. The tower:handbook skill holds the rest: reviews, hiring, crews, kept items, the shelf and the config, worktrees and the API.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/launch.ts#towerBrief", "hub/src/mod/skills/handbook/SKILL.md"]
}
---
**Problem.** The survey of the tower's first five days found the
system prompt doing more than the skill. 54% of worked sessions loaded `tower:handbook`, but 84% ran the `tower`
CLI, and 9 of 821 calls failed. The verbs used right without the skill were the ones the brief spelled out
(`whoami`, `show`, `keep drafts`). The skill loaded where it mattered most: before 16 of 19 first messages to a
peer. The weak spot was showing: 39 of 69 sessions with 3+ turns showed nothing.

**Decision.**
- The tower brief ([`towerBrief`](ref:hub/src/shared/launch.ts#towerBrief)) is a short list, most important first:
  run `tower whoami` as you start; reach a worker by its **message as** name from `tower agents`, signing with your
  callsign and naming commits and paths; every file or page written for the user gets `tower show`, again after a
  change; off-goal ideas and later prompts go to `tower keep drafts`, edited in place afterwards. A last line names
  what the skill holds and keeps the worktree rule.
- The skill (`SKILL.md`) is the handbook: the CLI in full, reaching out step by step, reviews, hiring and crews,
  showing and keeping in detail, worktree rules, the API. It no longer repeats the brief's prose (11 KB to 7.7 KB).
  Its description still triggers on callsigns, workers and reaching another session, and now on reviews, hiring,
  crews and kept items too.
- Since 2026-10-08 the skill also has a section on the floor's shelf and the config, and the brief's last line
  names both: a worker cold to the tower read the user's "shelf" as a collection, since neither text said the word.

**Alternatives considered.**
- *Keep "load the skill first" in the brief.* It was written for Haiku, which read "reach out to Q-61" as a job for
  `SendMessage` alone ([[agent-directory]]). The brief now carries the recipe that prevents that, and a session that
  never loads the skill still does it right.
- *The whole skill in the system prompt.* It is sent on every turn of every session, and most turns need none of
  reviews, hiring or the API.

**Impact.** The brief grows from about 1.1k to 1.5k characters. Only sessions started after the change get it.
Measured with the survey's `extract.py` and `compare.py` (`notes.md` beside them): the share of worked sessions
running `whoami` (62% before) and the CLI (84%), and of 3+ turn sessions showing something (43%).
