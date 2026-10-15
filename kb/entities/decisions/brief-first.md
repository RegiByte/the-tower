---
{
  "type": "decision",
  "name": "The system prompt carries the everyday recipes; the tower:handbook skill is the handbook",
  "summary": "The tower brief every worker gets in its system prompt says what it does on every turn, most important first: tower whoami, reaching a peer by its message-as name, tower show for every file or page written for the user, tower keep drafts. The tower:handbook skill holds the rest: reviews, hiring, crews, kept items, the shelf and the config, worktrees and the API.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-07",
  "reviewed": "2026-10-15",
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
  callsign and naming commits and paths; every file or page written for the user gets `tower show`, again after a
  change; off-goal ideas and later prompts go to `tower keep drafts`, edited in place afterwards. A last line names
  what the skill holds and keeps the worktree rule.
- The skill (`SKILL.md`) is the handbook: the CLI in full, reaching out step by step, reviews, hiring and crews,
  showing and keeping in detail, policies, the floor's shelf and the config, worktree rules, the API. It doesn't
  repeat the brief's prose. Its description triggers on callsigns, workers and reaching another session, and on
  reviews, hiring, crews, kept items, policies, the shelf and the config.
- The brief's last line names the shelf and the config: a worker cold to the tower read the user's "shelf" as a
  collection, since neither text said the word.

**Alternatives considered.**
- *Keep "load the skill first" in the brief.* It was written for Haiku, which read "reach out to Q-61" as a job for
  `SendMessage` alone ([[agent-directory]]). The brief now carries the recipe that prevents that, and a session that
  never loads the skill still does it right.
- *The whole skill in the system prompt.* It is sent on every turn of every session, and most turns need none of
  reviews, hiring or the API.

**Impact.** The brief is a little longer, and sent on every turn. A session gets the brief it was started or
resumed with.
