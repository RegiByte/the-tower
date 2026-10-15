---
{
  "type": "term",
  "name": "Callsign",
  "summary": "A worker's name in every renderer and its Claude peer name (ODIN-07): typed when the worker starts, or else drawn, a name from the config's callsigns (CALLSIGNS when it names none) chosen by rendezvous hashing over the session id, and a number from that id's own hash; passed to Claude as --name and read back from the log ever after, so a changed list names new workers only. A resume that continues a worker keeps its callsign.",
  "in": "tower",
  "reviewed": "2026-10-15",
  "refs": ["hub/src/shared/callsign.ts#callsigns", "hub/src/shared/callsign.ts#CALLSIGNS", "hub/src/shared/callsign.ts#CALLSIGN_NAME", "hub/src/shared/model.ts#configuredCallsigns", "hub/src/shared/model.ts#callsignsOf", "hub/src/bridge/chains.ts#lineage", "hub/src/bridge/chains.ts#workerName", "hub/src/bridge/chains.ts#runsAs", "hub/src/shared/callsign.ts#nameOf", "hub/src/shared/launch.ts#spawnRequest", "hub/src/shared/callsign.ts#freshId", "hub/src/bridge/chains.ts#heldNames", "hub/src/shared/callsign.ts#typedCallsign", "hub/src/shared/callsign.ts#numberOf"]
}
---
A worker is the chain of sessions it ran as ([[resume]]): a session that resumes its predecessor's latest
conversation continues it, so the board names every session of the chain by the first one
([`lineage`](ref:hub/src/bridge/chains.ts#lineage)): the `--name` its Claude ran under, read from its log's header
([`workerName`](ref:hub/src/bridge/chains.ts#workerName)), or, for a log from before sessions were named, its id's
callsign. A resume of an earlier conversation forks a new worker with a name of its own. Every spawn and resume passes
the callsign as Claude's `--name` ([`resumeName`](ref:hub/src/bridge/chains.ts#resumeName)), so it is also the
worker's peer name. Wherever the board or a brief points at another session (a conversation's `resumes` and
`resumedBy`, a card's `continuedBy`) it names it by callsign too, as a
[`SessionRef`](ref:hub/src/bridge/chains.ts#SessionRef) `{id, callsign}`, so no reader looks the session up.

The names come from the config's top-level `callsigns`, the same on every floor, read through
[`configuredCallsigns`](ref:hub/src/shared/model.ts#configuredCallsigns): left out, the tower uses
[`CALLSIGNS`](ref:hub/src/shared/callsign.ts#CALLSIGNS). Each name is an upper case letter, then upper case letters
and digits ([`CALLSIGN_NAME`](ref:hub/src/shared/callsign.ts#CALLSIGN_NAME)): a callsign is matched in upper case,
lowercased it names the worktree a worker is cut into, and a reviewer's first prompt (`/tower:review HOLMES-42`) and
review note headings are read back by that shape. An empty list, a name of another shape or a name given twice is a
`ConfigError` ([[board-errors]]). [`callsigns`](ref:hub/src/shared/callsign.ts#callsigns) makes the naming function
for a list, and [`callsignsOf`](ref:hub/src/shared/model.ts#callsignsOf) the config's; the bridge, the CLI, the
tower's spawns and `tower whoami`/`hire`/`review` all name through it, and renderers read `card.callsign` from the
board, never deriving one.

A callsign can instead be typed as a worker starts, once, and never changed after: `NAME-NN` (any number of digits),
or `NAME`, given the number its new session id hashes to ([`typedCallsign`](ref:hub/src/shared/callsign.ts#typedCallsign),
[`numberOf`](ref:hub/src/shared/callsign.ts#numberOf)), so every callsign is `NAME-NN`. The name needn't be in the
list, only of its shape. How a new worker's name is kept free of those on duty, when a typed one is refused, and why a
changed list names new workers only: [[callsign-free-name]]. Item tags ([[item-tags]]) keep their fixed word lists.
