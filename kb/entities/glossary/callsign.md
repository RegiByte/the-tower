---
{
  "type": "term",
  "name": "Callsign",
  "summary": "A worker's name in every renderer and its Claude peer name (ODIN-07): a name from the config's callsigns (CALLSIGNS when it names none) chosen by rendezvous hashing over the id of the worker's first session, and a number from that id's own hash; a resume that continues a worker keeps its callsign. The order of the list doesn't matter; adding a name renames only the sessions that pick it (about 1 in n+1 to a list of n), removing one only the sessions that held it, and replacing the list renames everyone.",
  "in": "tower",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/shared/callsign.ts#callsigns", "hub/src/shared/callsign.ts#CALLSIGNS", "hub/src/shared/callsign.ts#CALLSIGN_NAME", "hub/src/shared/model.ts#configuredCallsigns", "hub/src/shared/model.ts#callsignsOf", "hub/src/bridge/chains.ts#lineage", "hub/src/bridge/chains.ts#workerName", "hub/src/shared/callsign.ts#nameOf", "hub/src/shared/launch.ts#spawnRequest"]
}
---
A worker is the chain of sessions it ran as ([[resume]]): a session that resumes its predecessor's latest
conversation continues it, so the board names every session of the chain by the first one's id
([`lineage`](ref:hub/src/bridge/chains.ts#lineage)). A resume of an earlier conversation forks a new worker with
a name of its own. Every spawn and resume passes the callsign as Claude's `--name` ([`resumeName`](ref:hub/src/bridge/chains.ts#resumeName)),
so it is also the worker's peer name. Wherever the board or a brief points at another session (a conversation's
`resumes` and `resumedBy`, a card's `continuedBy`) it names it by callsign too, as a
[`SessionRef`](ref:hub/src/bridge/chains.ts#SessionRef) `{id, callsign}`, so no reader looks the session up.

The names come from the config's top-level `callsigns`, the same on every floor, read through
[`configuredCallsigns`](ref:hub/src/shared/model.ts#configuredCallsigns): left out, the tower uses
[`CALLSIGNS`](ref:hub/src/shared/callsign.ts#CALLSIGNS). Each name is an upper case letter, then upper case letters
and digits ([`CALLSIGN_NAME`](ref:hub/src/shared/callsign.ts#CALLSIGN_NAME)): a callsign is matched in upper case,
lowercased it names the worktree a worker is cut into, and a reviewer's first prompt is read back by that shape. An
empty list, a name of another shape or a name given twice is a `ConfigError` ([[board-errors]]). Names are derived,
never stored, so a changed list renames every card at once: adding a name to n renames about 1 in n+1
workers, and replacing the list renames all of them. A worker already running keeps the `--name` it started
with, so its peer name differs from its callsign until it is resumed; `tower agents` gives the name to message it by. Two texts keep a callsign as written: a
reviewer's first prompt (`/tower:review HOLMES-42`, read back by `reviewedIn`) and review note headings. So a changed
list detaches a running reviewer from its author (no crew, no seat beside it, or attached to whoever now holds the old
name) and counts a worker's earlier notes on an open thread as someone else's, resetting its unseen count. Fewer
names mean more shared callsigns: each name gives a hundred, so with two names two workers share one about half the
time once about 17 have run, and two live workers sharing a callsign share a peer name too; only worktree cuts draw
until the name is free. The default list gives about 8,100. [`callsigns`](ref:hub/src/shared/callsign.ts#callsigns) makes
the naming function for a list, and [`callsignsOf`](ref:hub/src/shared/model.ts#callsignsOf) the config's; the bridge,
the CLI, the tower's spawns and `tower whoami`/`hire`/`review` all name through it, and renderers read
`card.callsign` from the board, never deriving one. Tower 3D's fixture boards use the default list. Item tags
([[item-tags]]) keep their fixed word lists.
