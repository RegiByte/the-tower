---
{
  "type": "decision",
  "name": "A worker's acts on another are named in the target's log before they land",
  "summary": "submit, spawn, kill and keys take `by`, the requesting worker's session id; the tower has the host append tower.prompt, tower.kill or tower.keys to the target's log before the act, keys once per burst. The fold counts the next composer prompt after a tower.prompt as `peer`, answering no wait, and keeps killedBy and keyedBy. The user's acts pass no `by`. Attribution, not permission.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-09",
  "reviewed": "2026-10-30",
  "refs": [
    "hub/src/cli.ts",
    "hub/src/bridge/facts.ts#PROMPTED_BY",
    "hub/src/bridge/facts.ts#KEYED_BY",
    "hub/src/bridge/facts.ts#KILLED_BY",
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/tower/dispatch.ts#factRefused",
    "hub/src/tower/dispatch.ts#actedBy",
    "hub/src/tower/dispatch.ts#namedFirst",
    "hub/src/tower/dispatch.ts#submit",
    "hub/src/tower/dispatch.ts#spawnedBy",
    "hub/src/tower/dispatch.ts#kill",
    "hub/src/tower/dispatch.ts#inBurst",
    "hub/src/tower/dispatch.ts#keyedBy",
    "hub/src/shared/api.ts#VERBS",
    "hub/src/directory.ts#withBy",
    "hub/test/stats.test.ts"
  ],
  "links": [
    { "to": "stats", "verb": "refines", "carries": "prompts from you and waits on you count only the user's prompts" },
    { "to": "log-reductions", "verb": "uses", "carries": "tower.prompt, then prompt.submit; tower.kill and tower.keys" },
    { "to": "agents-have-every-capability", "verb": "follows", "carries": "a worker holds every verb, and what it does to another is told apart from the user's" },
    { "to": "renderer-api-contract", "verb": "uses", "carries": "`by` on submit, spawn, kill and keys" }
  ]
}
---
**Problem.** Workers hold every verb. A hire's brief (`tower hire`, `tower review`) and a review-note pointer
(`tower send`) reach a worker through its composer, as the user's typing would, and Claude reports them with the
composer's origin, so the stats counted them as the user's prompts and as waits the user answered. A worker that
ended another (`tower home`, `tower kill`) or typed into one (`keys`) left nothing behind: the target's log read as if
the user had done it.

**Why.** The logs are the facts ([[logs-are-facts]]). The tower's throughput is the user's answer rate, and work that
reduces the user's load can only be judged against a count of the user's own prompts. Who ended a worker, or typed
into it, is the first question when one stops or acts unexpectedly, and it can only be read later if it was written
then.

**How.**
- `submit`, `spawn`, `kill` and `keys` take an optional `by`, a session id the tower knows (an unknown one is refused
  before anything happens). With it, [`namedFirst`](ref:hub/src/tower/dispatch.ts#namedFirst) has the host append
  `{"hook_event_name": "tower.prompt" | "tower.kill" | "tower.keys", "by": <id>}` to the target's log through the
  host's `fact` request ([`actedBy`](ref:hub/src/tower/dispatch.ts#actedBy)) before the act. A spawn is named right
  after it starts, only when it has a prompt ([`spawnedBy`](ref:hub/src/tower/dispatch.ts#spawnedBy)). A kill is named
  only while the session runs, so a refused kill names nobody. While a host older than the `fact` request runs, a
  named act refuses with `unavailable` and the restart to do, before anything happens
  ([`factRefused`](ref:hub/src/tower/dispatch.ts#factRefused)).
- [`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter) keeps a `tower.prompt` as `promptedBy` until the next
  `prompt.submit` of a user origin, counts that prompt as `peer`, lets its wait go unanswered, and spends the mark. The
  conversation's prompt is untouched: a hired worker's card still shows its brief. It keeps `killedBy`, and `keyedBy`
  (the latest worker that typed, with when).
- Keys come a request per keystroke from a page, so a fact per request would outweigh the input it names. A `keys`
  request with `by` is named unless the latest `tower.keys` names the same worker and is less than a minute old
  ([`inBurst`](ref:hub/src/tower/dispatch.ts#inBurst)); the tower waits for its fold of the fact before typing
  ([`keyedBy`](ref:hub/src/tower/dispatch.ts#keyedBy)), so the burst's next request reads it.
- The `tower` CLI names its caller from `TOWER_SESSION_ID`: it passes it on `hire`, `review`, `send` and `home`, and
  `tower submit` and `tower kill`, which speak to the host directly, append the fact themselves first. The user's
  page and terminal pass none, so the user's acts stay unnamed.

**Alternatives considered.**
- *Match the fact to the prompt by a digest of its text* (as messages are matched): Claude wraps a long paste in
  `<pasted_content>` tags, so the submitted text and the prompt differ exactly when the prompt is long.
- *Derive hires from the hirer's `tower.hire` across logs*: covers hires only, not `send`, and the per-log fold can't
  see another log.
- *A request header for the actor*: invisible in `/schema`; a body field is described with the verb.
- *A new origin `worker`*: the Stats panel already reads `peer` as "from workers", which is what this is.
- *Name keys only when the actor changes*: the user's keys are unnamed, so a worker's second burst after the user
  typed would go unnamed; the minute bounds how stale the latest name can be.

**Impact.** A target's log says which worker prompted it, ended it or typed into it, within a minute's precision for
keys: keys the user types inside a worker's burst read as that burst's. A prompt mark whose prompt never arrives
(text typed into a dialog, not submitted) makes the user's next composer prompt the worker's: rare, since the CLI
submits only to a worker at its composer.
