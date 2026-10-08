---
{
  "type": "decision",
  "name": "Watching: a turn that ends with something set to wake it",
  "summary": "A session whose turn ends while a background task it started still runs, or a cron (a /loop, a ScheduleWakeup, a CronCreate) is pending, is watching, read from that Stop's background_tasks and session_crons; it is done only when nothing but the user can wake it. Watching waits on nobody.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-06",
  "reviewed": "2026-10-07",
  "refs": [
    "hub/src/bridge/status.ts#nextState",
    "hub/src/bridge/status.ts#waitsOnSomeone",
    "hub/src/bridge/verbs.ts",
    "hub/src/shared/cards.ts#lampOf",
    "hub/src/shared/design.ts",
    "hub/renderers/tower3d/src/dress.ts",
    "hub/renderers/tower3d/src/desk.ts#poseDesk",
    "hub/test/status.test.ts"
  ]
}
---
**Problem.** A worker that babysits something (a deploy checked every few minutes, a background subagent, a
`Monitor` on a log) read idle → working → done → working → done…: each wake ended in `done`, which waits on you and
rings, though the worker had not finished and needed nothing.

**Why.** `done` means only you can move it on. A worker that set something to wake it is still on its task.

**How.** Claude's `Stop` (2.1.292) carries `background_tasks` (`id`, `type`: `subagent` or `shell`, `status`, …) and
`session_crons`. A `Stop` with a running task or any cron makes the session `watching`, one with neither `done`. Every
wake runs a turn and ends in its own `Stop`, which decides again, so the status needs no stored state. Recorded on
Haiku 4.5, one fixture each:

| Started by | In `Stop` | Wakes as `prompt.submit` origin |
|---|---|---|
| a background subagent (`subagent-background`) | `background_tasks`, `type: subagent` | `task-notification` |
| Bash `run_in_background` (`background-shell`) | `background_tasks`, `type: shell` | `task-notification` |
| `Monitor` (`monitor`) | `background_tasks`, `type: shell`, until its command exits | `task-notification`, one turn per event |
| `/loop <interval>`, `CronCreate` (`loop-cron`) | `session_crons`, `recurring: true` | `scheduled-trigger` |
| `/loop` self-paced, `ScheduleWakeup` (`loop-wakeup`) | `session_crons`, a one-shot cron | `scheduled-trigger` |

A subagent's own hooks carry `agent_id` and never move the main loop, so its tool calls leave the session watching.
`watching` is live and takes prompts (`submit`); it never waits on you, so nothing rings. Its attention is `quiet`;
renderers mark it apart from that: a lamp that breathes (`lampOf` adds the `watching` class, the design system's CSS
animates it), and in Tower 3D the desk lamp lit beside a mug, the worker leaning back.

**Open: an end with no event.** A task stopped from `/tasks` (`task-stopped`) raises no hook and no mod event, so the
session stays `watching` until its next turn or its exit. Claude's mods API has no task lifecycle event, its
`TaskCompleted` hook is about todo tasks, and `idle_prompt` comes 60 s after a `Stop` whether a task still runs or not:
nothing in the log can end it.

**Alternatives considered.** Keeping `done` between wakes (the behaviour before): every wake rang as an answer. A
`watching` attention of its own: a fifth colour every renderer and tally would carry, for a state that asks nothing of
you. Ending a watch on a timer: a guess, wrong for a cron an hour away.

**Impact.** A new `Status` value on the board (API v10). `waitsOnSomeone`, `board.waiting` and rings are unchanged:
`watching` is in none of them.
