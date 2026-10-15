---
{
  "type": "decision",
  "name": "Policies: standing work kept as items, run by the tower at its slots, its facts in project streams",
  "summary": "A policy is a markdown item of a floor's policies collection (a title, a strict json header, the prose a run's worker starts on); the tower's runner decides each due slot from the board alone (held, checked, run, offered) and writes one fact per slot it saw through policy/run or policy/pass, approvals through policy/approve, in streams/projects/<project>/; offers, approval, live runs, needs and a worker's run are derived onto the board.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-13",
  "reviewed": "2026-10-15",
  "refs": [
    "hub/src/shared/policies.ts#cronFields",
    "hub/src/shared/policies.ts#ruleWords",
    "hub/src/shared/policies.ts#slotWords",
    "hub/src/shared/policies.ts#slotsBetween",
    "hub/src/shared/policies.ts#standing",
    "hub/src/shared/policies.ts#standingWords",
    "hub/src/shared/policies.ts#decide",
    "hub/src/bridge/policy-file.ts#parsePolicy",
    "hub/src/bridge/policy-file.ts#hashOf",
    "hub/src/bridge/policies.ts#PolicyView",
    "hub/src/bridge/policies.ts#policyViews",
    "hub/src/bridge/policies.ts#offersOf",
    "hub/src/bridge/policies.ts#cardRun",
    "hub/src/bridge/policies.ts#liveRuns",
    "hub/src/bridge/policies.ts#runsRead",
    "hub/src/bridge/streams.ts#streamFacts",
    "hub/src/streams.ts#appendFact",
    "hub/src/policies.ts#runPolicies",
    "hub/src/policies.ts#runCheck",
    "hub/src/tower/server.ts#runPolicy",
    "hub/src/tower/server.ts#passPolicy",
    "hub/src/tower/server.ts#approvePolicy",
    "hub/src/tower/server.ts#runsOfPolicy",
    "hub/src/system.ts#watchSystem",
    "hub/src/shared/api.ts#SPAWN_FIELDS",
    "hub/src/directory.ts#policyLines",
    "hub/src/directory.ts#runLines",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/test/policies.test.ts"
  ],
  "links": [
    { "to": "probes", "verb": "amends", "carries": "the first project streams, read and appended by the same stream code" },
    { "to": "collections", "verb": "amends", "carries": "a second collection the core gives a meaning: policies" },
    { "to": "logs-are-facts", "verb": "follows", "carries": "one fact per slot seen, everything else derived" },
    { "to": "env-scrub", "verb": "follows", "carries": "a check runs with the parent session scrubbed" },
    { "to": "agents-have-every-capability", "verb": "follows", "carries": "any worker may run, approve or accept" }
  ]
}
---
**Problem.** Work that should happen on a schedule (a weekly report, a bug hunt twice a day, triage while issues
wait) had no place in the tower: someone had to start it by hand each time, and nothing said whether it ran, why
not, or what the last run left.

**Why.** The tower already runs workers and keeps facts. Standing work is a prompt plus a rule for when, which is
intent the user writes and edits like any kept file; whether a slot ran is a fact. Everything else (offers,
approval, live counts, the reason a slot did nothing) can be derived ([[logs-are-facts]]).

**How.**
- *The file.* An item of the floor's `policies` collection ([[collections]]): a `# Title` line, a fenced json
  header, then the prose, which is the run's whole prompt. The header's keys: `when` (`{cron: [...], tz?}`),
  `check`, `start` (`ask` | `auto`), `live` (1), `hire` (the spawn verb's `cwd`, `cut`, `model`, `effort`, picked
  from [`SPAWN_FIELDS`](ref:hub/src/shared/api.ts#SPAWN_FIELDS)), `runner`, `x`. An unknown key makes it invalid,
  failing closed on a constraint this tower doesn't know; a runner's own data goes under `x`; no version key. Parsing
  is total ([`parsePolicy`](ref:hub/src/bridge/policy-file.ts#parsePolicy)): an invalid policy is still on the
  board, its problems at their paths. The hash is the file's bytes ([`hashOf`](ref:hub/src/bridge/policy-file.ts#hashOf)).
- *Crons the tower can say.* Only a subset ([`cronFields`](ref:hub/src/shared/policies.ts#cronFields)), so every
  display reads [`ruleWords`](ref:hub/src/shared/policies.ts#ruleWords) ("weekdays at 09:30 and 15:00 (New York)")
  and [`slotWords`](ref:hub/src/shared/policies.ts#slotWords); day of month and day of week never both. Slots over
  croner ([`slotsBetween`](ref:hub/src/shared/policies.ts#slotsBetween)), in `tz` or the machine's zone: a
  spring-forward time is skipped, a repeated one runs once. On time means within 5 minutes; a later slot is missed,
  and nothing records it.
- *One fact per slot seen.* `streams/projects/<project>/runs/` holds `r` (a run: policy, hash, slot or `null` by hand,
  the worker's id, `start` auto | offer | hand, `by`, the check) and `s` (a pass: offered, no-work, held,
  check-failed, with the check); `approvals/` holds `a` (a hash approved, `by`). The tower is the one writer
  ([`appendFact`](ref:hub/src/streams.ts#appendFact)), through one verb each:
  [`policy/run`](ref:hub/src/tower/server.ts#runPolicy) (parses the file now, spawns on `hire` and the prose,
  appends `r`, kills the worker if the append fails; refuses an invalid policy, another runner's, a slot already
  run, runs past `live`; needs no approval, since the caller consents, except `start: auto`, refused unless the hash read now is approved),
  [`policy/pass`](ref:hub/src/tower/server.ts#passPolicy) (refused once the slot has a fact) and
  [`policy/approve`](ref:hub/src/tower/server.ts#approvePolicy) (refused unless the hash is the file's now). A
  policy's verbs are taken one at a time, each until the system holds its fact.
- *Derived on the board.* [`policyViews`](ref:hub/src/bridge/policies.ts#policyViews): each floor's `policies` (rule,
  next slot, approval of the current hash, live runs followed through resumes
  ([`liveRuns`](ref:hub/src/bridge/policies.ts#liveRuns)), last run, last pass, the newest slot with a fact, the open
  offer, `needs`: `reapprove` for an auto policy edited since its approval, `invalid` for one approved once, `held` for the latest pass's slot while it is open and a run still runs: the
  runs holding it, `heldSlot`; derived and shown (`tower policies`, the panel's Needs you), never rung or notified), with
  `run` and `approve` calls; `board.offers` ([`offersOf`](ref:hub/src/bridge/policies.ts#offersOf)), an offered slot
  open until the policy's next slot or its run, carrying its check's output onto the run that accepts it; `card.run` ([`cardRun`](ref:hub/src/bridge/policies.ts#cardRun)),
  the run fact naming the first session of a worker's lineage. `GET /runs/<project>?policy&limit`
  ([`runsRead`](ref:hub/src/bridge/policies.ts#runsRead)) reads a policy's runs, each worker as it is now.
- *The runner.* [`standing`](ref:hub/src/shared/policies.ts#standing) says where a policy stands, and
  [`decide`](ref:hub/src/shared/policies.ts#decide) what a runner does with a due slot, from the board alone: held
  while live is full; the check first; run when `auto` and approved; else offered. The tower's
  [`runPolicies`](ref:hub/src/policies.ts#runPolicies) calls it every 30 s per floor, runs the checks
  ([`runCheck`](ref:hub/src/policies.ts#runCheck): `sh -c` from the hub, the parent session scrubbed
  ([[env-scrub]]), its process group killed by its pid at 60 s; exit 0 work, 1 none, else failed) and carries the
  rest out through the verbs, as any other runner could. It acts only on policies naming no `runner`.
- *Where it shows.* [`standingWords`](ref:hub/src/shared/policies.ts#standingWords) is the one sentence of where a
  policy stands, for the CLI and every renderer. `tower policies` ([`policyLines`](ref:hub/src/directory.ts#policyLines)),
  `tower policies approve|run <tag>`, `tower runs` (the last 5 runs, each answer cut to 15 lines or 1,500
  characters), and `tower whoami`'s run lines ([`runLines`](ref:hub/src/directory.ts#runLines)); the handbook's
  "Policies and runs".

**Alternatives considered.** Offers as stored state with an expiry (derivable from the passes). Check results
in the runner's memory alone (lost on restart, a check run twice in a slot). Generic `spawn` plus a separate fact
verb (a run could go unrecorded between the two). A new `Wait.reason` for offers (a wait is a worker's; an API
major). Ignoring unknown header keys (fails open on the keys that restrict). A version key. cronstrue for the words
(English that drifts from ours, and a dependency for about 60 lines).

**Impact.** API 1.50 (the `held` kind of `needs`; 1.49 brought): `floor.policies`, `board.offers`, `card.run`, the three verbs, `GET /runs/<project>` and
`/policies.js`. The first project streams ([[probes]]). A second collection with a meaning in the core
([[collections]]). croner joins the dependencies. A run that nobody watches ends itself with `tower home <own
callsign>` ([[leave]]), its last answer kept for the next. Renderers draw policies with the shared policies panel
([[shared-panels]]) and put offers in the attention order with a sound of their own ([[attention-list]]). Open: Tidy
does not archive project streams yet.
