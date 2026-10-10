---
{
  "type": "decision",
  "name": "A worker's kill or keys are named in the target's log: once per kill, once per burst of keys",
  "summary": "kill and keys take `by`, like submit and spawn; the tower has the host append tower.kill or tower.keys to the target's log before the act lands. Keys are named once per burst: again only when another worker typed last or a minute has passed. Attribution, not permission.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-10",
  "reviewed": "2026-10-10",
  "refs": [
    "hub/src/bridge/facts.ts#KEYED_BY",
    "hub/src/bridge/facts.ts#KILLED_BY",
    "hub/src/tower/server.ts#namedFirst",
    "hub/src/tower/server.ts#kill",
    "hub/src/tower/server.ts#inBurst",
    "hub/src/tower/server.ts#keyedBy",
    "hub/src/shared/api.ts#VERBS",
    "hub/src/cli.ts",
    "hub/src/directory.ts"
  ],
  "links": [
    { "to": "agents-have-every-capability", "verb": "follows", "carries": "a worker holds every verb, and what it does to another is told apart from the user's" },
    { "to": "log-diet", "verb": "follows", "carries": "a burst of keys is one fact, never one per keystroke" },
    { "to": "renderer-api-contract", "verb": "uses", "carries": "`by` on kill and keys is an addition: a minor" }
  ]
}
---
**Problem.** Workers hold every verb. A prompt or a hire a worker makes is named in a log (`tower.prompt`, `tower.hire`),
but a worker that ended another (`tower home`, `tower kill`, a `kill` request) or typed into one (`keys`) left nothing
behind: the target's log read as if the user had done it.

**Why.** The logs are the facts. Who ended a worker, or typed into it, is the first question when one stops or acts
unexpectedly, and the answer can only be read later if it was written then.

**How.** `kill` and `keys` take an optional `by`, a session id the tower knows. With it, the tower has the host append
`{"hook_event_name":"tower.kill","by":<id>}` or `"tower.keys"` to the target's log through `fact`, before the act
([`namedFirst`](ref:hub/src/tower/server.ts#namedFirst), refused with the restart to do while an older host runs, as
for prompts). A kill is named only while the session runs, so a refused kill names nobody. The fold keeps `killedBy`
and `keyedBy` (the latest worker that typed, with when).

Keys are written as the terminal produces them, a request per keystroke from a page, so a fact per request would
outweigh the input it names. The rule: a `keys` request with `by` is named unless the latest `tower.keys` in the
target's log names the same worker and is less than a minute old ([`inBurst`](ref:hub/src/tower/server.ts#inBurst)).
The tower waits for its fold of the fact before typing ([`keyedBy`](ref:hub/src/tower/server.ts#keyedBy)), so the
burst's next request reads it. The user's keys pass no `by` and are never named.

The CLI names its caller from `TOWER_SESSION_ID`: `tower home` passes it on each kill, and `tower kill`, which speaks
to the host directly, appends `tower.kill` itself before the kill when the session runs. The user's terminal sets no
`TOWER_SESSION_ID`, so the user's kills stay unnamed.

**Alternatives considered.**
- *A fact per keys request*: a worker driving a dialog sends a few requests, but a renderer forwarding a worker's
  typing sends one per key, and the log diet keeps facts to what is read.
- *Name keys only when the actor changes*: the user's keys are unnamed, so a worker's second burst after the user
  typed would go unnamed; the minute bounds how stale the latest name can be.
- *Show "killed by" on the card*: not yet; the fact and its fold come first, a view can derive it later.

**Impact.** A target's log says which worker ended it and which typed into it, within a minute's precision for keys:
keys the user types inside a worker's burst read as that burst's. Logs before this decision name no one.
