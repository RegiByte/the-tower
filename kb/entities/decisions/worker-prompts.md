---
{
  "type": "decision",
  "name": "A prompt a worker types through the tower is the worker's, named in the log before it arrives",
  "summary": "submit and spawn take `by`, the requesting worker's session id; the tower has the host append a tower.prompt fact to the target's log before the prompt reaches Claude, and the fold counts the next composer prompt as `peer`, answering no wait. The user's prompts are the rest.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-09",
  "reviewed": "2026-10-09",
  "refs": [
    "hub/src/bridge/facts.ts#PROMPTED_BY",
    "hub/src/bridge/facts.ts#factsAfter",
    "hub/src/tower/server.ts#factRefused",
    "hub/src/tower/server.ts#promptedBy",
    "hub/src/tower/server.ts#submit",
    "hub/src/tower/server.ts#spawnedBy",
    "hub/src/shared/api.ts#VERBS",
    "hub/src/directory.ts",
    "hub/test/stats.test.ts"
  ],
  "links": [
    { "to": "stats", "verb": "refines", "carries": "prompts from you and waits on you count only the user's prompts" },
    { "to": "log-reductions", "verb": "uses", "carries": "tower.prompt, then prompt.submit" },
    { "to": "agents-have-every-capability", "verb": "follows", "carries": "a worker holds the verbs, and its acts are told apart from the user's" }
  ]
}
---
**Problem.** A hire's brief (`tower hire`, `tower review`) and a review-note pointer (`tower send`) reach a worker
through its composer, as the user's typing would, and Claude reports them with the composer's origin. The stats
counted them as the user's prompts and as waits the user answered: over 2026-10-03..09, about 130 of 890 "prompts
from you" were hire briefs alone, so every attention number overstated the user's share.

**Why.** The tower's throughput is the user's answer rate: workers waited 54.5 hours on the user that week, against
46 busy. Work that reduces the user's load can only be judged against a count of the user's own prompts.

**How.** `submit` and `spawn` take an optional `by`, a session id the tower knows (an unknown one is refused before
anything happens). With it, [`promptedBy`](ref:hub/src/tower/server.ts#promptedBy) has the host append
`{"hook_event_name":"tower.prompt","by":<id>}` to the target's log, through the host's `fact` request, before the
text is typed; for a spawn, right after it starts, only when it has a prompt (Claude takes over a second to read its
first). The host takes `fact` from protocol 2 on: while an older host runs, a `submit` or a spawn with a prompt and
`by` refuses with `unavailable` and the restart to do, before it types or spawns anything
([`factRefused`](ref:hub/src/tower/server.ts#factRefused), as `let-go` refuses). [`factsAfter`](ref:hub/src/bridge/facts.ts#factsAfter) keeps the mark as `promptedBy` until the next
`prompt.submit` of a user origin, counts that prompt as `peer` and lets its wait go unanswered, and spends the mark.
The conversation's prompt is untouched: a hired worker's card still shows its brief. The `tower` CLI passes its own
session id on `hire`, `review` and `send`; the user's page and the user's CLI pass none, so their prompts stay the
user's. The Stats panel adds the user's prompts per commit landed.

**Alternatives considered.**
- *Match the fact to the prompt by a digest of its text* (as messages are matched): Claude wraps a long paste in
  `<pasted_content>` tags, so the submitted text and the prompt differ exactly when the prompt is long.
- *Derive hires from the hirer's `tower.hire` across logs*: covers hires only, not `send`, and the per-log fold can't see
  another log.
- *A request header for the actor*: invisible in `/schema`; a body field is described with the verb.
- *A new origin `worker`*: the Stats panel already reads `peer` as "from workers", which is what this is.

**Impact.** A mark whose prompt never arrives (text typed into a dialog, not submitted) makes the user's next
composer prompt the worker's: rare, since the CLI submits only to a worker at its composer. Logs before this
decision keep their old counts. The rest of roadmap 7's "acts name their actor" (keys, kills, other verbs) is open.
