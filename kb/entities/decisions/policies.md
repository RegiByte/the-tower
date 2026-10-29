---
{
  "type": "decision",
  "name": "Policies: standing work kept as items, run at its slots by the bundled policies extension, its facts in project streams",
  "summary": "A policy is a markdown item of a floor's policies collection (a title, a strict json header, the prose a run's worker starts on); the bundled extension policies, fired at each slot by the core's slot loop, decides each due slot from the board alone (held, checked, run, offered) and writes one fact per slot it saw through policies/run or policies/pass, approvals through policies/approve, in the folders runs/ and approvals/ of streams/projects/<project>/; offers (as asks), approval, live runs, needs and a worker's run are its folds' part of the board, copied back to the old fields through LEGACY until 2.0.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-13",
  "reviewed": "2026-10-29",
  "refs": [
    "hub/src/shared/slots.ts#cronFields",
    "hub/src/shared/slots.ts#ruleWords",
    "hub/src/shared/slots.ts#slotWords",
    "hub/src/shared/slots.ts#slotsBetween",
    "hub/src/slots.ts#extensionSlots",
    "hub/extensions/policies/extension.json",
    "hub/extensions/policies/server.ts",
    "hub/extensions/policies/client/policies.ts#standing",
    "hub/extensions/policies/client/policies.ts#standingWords",
    "hub/extensions/policies/client/policies.ts#decide",
    "hub/extensions/policies/client/panel.ts#policiesHtml",
    "hub/extensions/policies/policy-file.ts#parsePolicy",
    "hub/extensions/policies/policy-file.ts#hashOf",
    "hub/extensions/policies/policies.ts#policyViews",
    "hub/extensions/policies/policies.ts#offersOf",
    "hub/extensions/policies/policies.ts#cardRun",
    "hub/extensions/policies/policies.ts#liveRuns",
    "hub/extensions/policies/policies.ts#runsRead",
    "hub/extensions/policies/check.ts#runCheck",
    "hub/extensions/policies/cli.ts#policiesLines",
    "hub/src/shared/policies-legacy.ts#PolicyView",
    "hub/src/shared/policies-panel.ts#policiesHtml",
    "hub/src/shared/extensions.ts#LEGACY",
    "hub/src/bridge/legacy.ts#LEGACY_FIELDS",
    "hub/src/shared/waits.ts#attentionOrder",
    "hub/src/shared/api.ts#SPAWN_FIELDS",
    "hub/src/directory.ts#said",
    "hub/src/mod/skills/handbook/SKILL.md",
    "hub/test/policies.test.ts",
    "hub/test/server.test.ts"
  ],
  "links": [
    { "to": "extensions", "verb": "follows", "carries": "a bundled extension on the core's slots, its old names kept by LEGACY until 2.0" },
    { "to": "probes", "verb": "amends", "carries": "the first project streams, read and appended by the same stream code" },
    { "to": "collections", "verb": "amends", "carries": "a collection an extension declares, the config's line an override of its words" },
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
approval, live counts, the reason a slot did nothing) can be derived ([[logs-are-facts]]). Since 1.91 it is the
bundled extension `policies` ([[extensions]]): nothing of it is the core's but the slot loop that fires it, and a
user may replace it by providing `policies`.

**How.**
- *The file.* An item of the floor's `policies` collection, which the extension declares open
  ([`extension.json`](ref:hub/extensions/policies/extension.json)); a config line declaring `collections.policies`
  overrides its label and description ([[collections]]). A `# Title` line, a fenced json header, then the prose, which
  is the run's whole prompt. The header's keys: `when` (`{cron: [...], tz?}`), `check`, `start` (`ask` | `auto`),
  `live` (1), `hire` (the spawn verb's `cwd`, `cut`, `model`, `effort`, picked from
  [`SPAWN_FIELDS`](ref:hub/src/shared/api.ts#SPAWN_FIELDS)), `runner`, `x`. An unknown key makes it invalid, failing
  closed on a constraint this tower doesn't know; a runner's own data goes under `x`; no version key. Parsing is total
  ([`parsePolicy`](ref:hub/extensions/policies/policy-file.ts#parsePolicy)): an invalid policy is still on the board,
  its problems at their paths. The hash is the file's bytes ([`hashOf`](ref:hub/extensions/policies/policy-file.ts#hashOf)).
- *Crons the tower can say.* Only a subset ([`cronFields`](ref:hub/src/shared/slots.ts#cronFields)), so every
  display reads [`ruleWords`](ref:hub/src/shared/slots.ts#ruleWords) ("weekdays at 09:30 and 15:00 (New York)")
  and [`slotWords`](ref:hub/src/shared/slots.ts#slotWords); day of month and day of week never both, and never a bare `*` minute (every minute is too often for standing work). Slots over
  croner ([`slotsBetween`](ref:hub/src/shared/slots.ts#slotsBetween)), in `tz` or the machine's zone: a
  spring-forward time is skipped, a repeated one runs once. On time means within 5 minutes; a later slot is missed,
  and nothing records it.
- *One fact per slot seen.* The extension's project streams `runs` (`r`, a run: policy, hash, slot or `null` by hand,
  the worker's id, `start` auto | offer | hand, `by`, the check; `s`, a pass: offered, no-work, held, check-failed,
  with the check) and `approvals` (`a`, a hash approved, `by`), kept in the folders `streams/projects/<project>/runs/`
  and `approvals/` they had before the move, for good (`LEGACY`'s stream rows,
  [`LEGACY`](ref:hub/src/shared/extensions.ts#LEGACY)). The extension is the one writer, through one verb each
  ([`server.ts`](ref:hub/extensions/policies/server.ts)): `policies/run` (parses the file now, spawns on `hire` and the
  prose through `tower/spawn`, appends `r`, kills the worker if the append fails, and is taken once the board holds the
  worker; refuses an invalid policy, another runner's, a slot already run, runs past `live`; needs no approval, since
  the caller consents, except `start: auto`, refused unless the hash read now is approved), `policies/pass` (refused once
  the slot has a fact) and `policies/approve` (refused unless the hash is the file's now). A policy's verbs are taken
  one at a time, each until the tower folds its fact.
- *Its part of the board.* The floor fold ([`policyViews`](ref:hub/extensions/policies/policies.ts#policyViews)):
  `floor.x.policies.policies` (rule, next slot, approval of the current hash, live runs followed through resumes by the
  worker's lineage among the floor's cards ([`liveRuns`](ref:hub/extensions/policies/policies.ts#liveRuns)), last run (its worker's callsign by `ctx.callsignOf`, archived workers too),
  last pass, the newest slot with a fact, the open offer, `needs`: `reapprove` for an auto policy edited since its
  approval, `invalid` for one approved once, `held` for the latest pass's slot while it is open and a run still runs;
  shown, never rung), with `run` and `approve` as its `actions`, calling `policies/*`; `floor.x.policies.offers`
  ([`offersOf`](ref:hub/extensions/policies/policies.ts#offersOf)), each also an ask (`sound: 'offer'`, `until` the next
  slot, about the policy's item) in `board.asks`, the attention order's only offers
  ([`attentionOrder`](ref:hub/src/shared/waits.ts#attentionOrder)); a slot per policy the tower runs, in
  `board.adds`. The card fold: `card.x.policies.run` ([`cardRun`](ref:hub/extensions/policies/policies.ts#cardRun)), the
  run fact naming the first session of a worker's lineage, and the lines `tower whoami` prints. Reads:
  `policies/runs/<project>?policy&limit` ([`runsRead`](ref:hub/extensions/policies/policies.ts#runsRead)), a policy's
  runs, each worker as it is now, the archive included; `policies/said/<project>`, what `tower policies` and
  `tower runs` print, in the extension's words ([`policiesLines`](ref:hub/extensions/policies/cli.ts#policiesLines)),
  which the core's CLI prints ([`said`](ref:hub/src/directory.ts#said)).
- *The runner.* [`standing`](ref:hub/extensions/policies/client/policies.ts#standing) says where a policy stands, and
  [`decide`](ref:hub/extensions/policies/client/policies.ts#decide) what a runner does with a due slot, from the board
  alone: held while live is full; the check first; run when `auto` and approved; else offered. The core's slot loop
  ([`extensionSlots`](ref:hub/src/slots.ts#extensionSlots)) fires each folded slot once per tower process while it is
  on time; the extension's `slots['*']` decides it, runs the check
  ([`runCheck`](ref:hub/extensions/policies/check.ts#runCheck): `sh -c` from the hub through `ctx.run`, the parent
  session scrubbed ([[env-scrub]]), its process group killed by its pid at 60 s; exit 0 work, 1 none, else failed)
  and carries the rest out through its verbs, deciding again every 30 s while a refusal leaves the slot undone and it
  is on time. Exactly once across restarts is the facts': a slot with a fact is never decided again, whichever tower
  wrote it. It acts only on policies naming no `runner`.
- *Where it shows.* [`standingWords`](ref:hub/extensions/policies/client/policies.ts#standingWords) is the one sentence
  of where a policy stands; the client (`/x/policies/policies.js`, and the panel
  [`policiesHtml`](ref:hub/extensions/policies/client/panel.ts#policiesHtml), `/x/policies/panel.js`) is what the tower
  page draws with, the panel as the extension's view `policies/policies` on a floor since 1.108
  ([`mount`](ref:hub/extensions/policies/client/view.ts#mount)), an offer dismissed there kept in the viewer's
  `tower.store` as a wait's is. `tower policies`, `tower policies approve|run <tag>`, `tower runs` and `tower whoami`'s run lines;
  the handbook's "Policies and runs".
- *What stays for renderers kept outside the checkout, until 2.0.* `LEGACY` maps `policy/run`, `policy/pass`,
  `policy/approve` and `GET /runs/<project>` to the extension's, deprecated, and copies its part back to
  `floor.policies`, `card.run` and `board.offers` ([`LEGACY_FIELDS`](ref:hub/src/bridge/legacy.ts#LEGACY_FIELDS)),
  their calls renamed to `policy/*`, in the shapes the core held at the move
  ([`policies-legacy.ts`](ref:hub/src/shared/policies-legacy.ts#PolicyView)); `/policies.js` serves the extension's
  client, and `/panels.js` keeps a deprecated copy of the old panel over those fields
  ([`policiesHtml`](ref:hub/src/shared/policies-panel.ts#policiesHtml)). Off on a floor, or off everywhere, the
  extension's parts and their copies are gone and its files and folders stay; on again, every run and approval is
  back, since nothing is stored beside them.

**Alternatives considered.** Offers as stored state with an expiry (derivable from the passes). Check results
in the runner's memory alone (lost on restart, a check run twice in a slot). Generic `spawn` plus a separate fact
verb (a run could go unrecorded between the two). A new `Wait.reason` for offers (a wait is a worker's; an API
major). Ignoring unknown header keys (fails open on the keys that restrict). A version key. A cron-to-English
library (English that drifts from ours, and a dependency for what a short function says). At the move: the core
importing the extension's code for the old fields, the old panel or the CLI's words (a replacement would leave the
bundled one running inside the core: the CLI asks the extension's read for its text, the old fields are copied from
its part as data); fetching and evaluating the extension's client in the CLI (a mechanism to carry forever); a
manifest slot ticking every 30 s in place of folded slots (the core's loop knows each policy's rule).

**Impact.** Project streams beside the system's ([[probes]]), kept in their old folders by `LEGACY` for good.
A run that nobody watches ends itself with `tower home <own callsign>` ([[leave]]), its last answer kept for the
next. The tower page draws policies with the extension's panel ([[shared-panels]] keeps the old one, deprecated) and
puts offers in the attention order as asks, with a sound of their own ([[attention-list]]). Tidy archives the
project streams' months as any stream's.
