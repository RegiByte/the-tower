# Policies

Standing work the tower starts for you on a schedule: a prompt and a rule for when, kept as a file, with every slot
it ran, offered or skipped recorded and said in words.

## What it adds

### The tower page

**The Policies panel**, in the main pane for a floor (its tray, below, opens it; `#policies/<floor>` names it). On
top, what **needs you**: an `auto` policy edited since its approval (its slots are offered until you approve the new
words), one approved once and invalid now, or a slot held because its runs are still on duty. Then the slots
**offered** now, each with **Accept** and ✕ (dismissed for this browser). Then every policy: its rule and next slot in
words, where it stands and what its next slot will do, its approval, its live runs and its last run, with **Approve**
and **Run now**. The title opens its file; the tag copies.

| Light | Dark |
| --- | --- |
| ![The Policies panel with one policy needing approval, one offer and three policies](shots/panel-light.png) | ![The Policies panel with one policy needing approval, one offer and three policies](shots/panel-dark.png) |

**On the floor in the sidebar**: each open offer as a row with **Accept** and ✕; a run's card says which run of which
policy it is (`run 1 · Dependency updates`, what started it on hover), with the lines its worker was told; and the
policies tray in the floor's row of trays counts the policies, the slots offered, those that need you and those
invalid, and opens the panel.

| Light | Dark |
| --- | --- |
| ![A floor with an offer, a run's card and the policies tray](shots/floor-light.png) | ![A floor with an offer, a run's card and the policies tray](shots/floor-dark.png) |

An offer is also an ask on the board: it counts in the header's **offered** chip, rings as an offer, and takes its turn
when you go to the next thing waiting, after the workers waiting on you.

### The CLI

`tower policies` lists the floor's policies, each with its rule, approval, live runs, last run and where it stands now,
the same reason the tower acts on:

```
sour-thrush   Morning triage       daily at 00:00 (UTC)
              ask · live 0/1
              now: today 00:00 UTC is offered, until tomorrow 00:00 UTC
silent-cello  Dependency updates   Mondays at 06:00 (UTC)
              auto · not approved: its slots are offered · live 1/1 · last: run 1, by hand, HOLMES-93 working
              now: Mon 06:00 UTC will be held: run 1 (HOLMES-93) still runs
lone-pelican  Release notes draft  Fridays at 16:00 (UTC)
              auto · NOT approved (edited since 8cae1d45) · live 0/1
              now: Fri 16:00 UTC will be offered
```

`tower policies approve <tag>` approves a policy's words as they are now; `tower policies run <tag>` starts it now, or
takes its open offer; `tower runs [<tag>] [--limit n]` lists a policy's latest runs (5 unless told, 20 at most; with no
tag, those of the policy the asking worker is a run of), each with its worker, what it showed and its latest answer cut
short.

### The workers

A worker started for a policy reads it in `tower whoami`: which run of which policy, for which slot, how it started
and what the check found, and to read `tower runs` for what earlier runs left. The handbook skill's "Policies and
runs" teaches every worker the file and the commands. Policies carries no `guidance` of its own, so it has no line in
`tower whoami`'s extensions.

Tower 3D and The Week draw none of it. The board carries all of it for any renderer:
`floor.x.policies` (the policies and the open offers, each with its calls), `card.x.policies.run`, and each offer in
`board.asks`.

## Add it

Policies is bundled: it is on for every floor unless turned off. Off everywhere:

```json
"extensions": { "policies": { "off": true } }
```

Off on one floor:

```json
"projects": { "<id>": { "capabilities": { "policies": { "off": true } } } }
```

Off, nothing runs on a schedule and its parts leave the board, but its files and facts stay where they are: on again,
every policy, run and approval is back. The `policies` collection is the extension's: where it is off, the floor keeps
it only if the config declares a `policies` collection itself, and then as a plain one. `tower extensions` lists it.

## What it needs from you

**A policy, to do anything**: a floor with none shows nothing, not even the tray. Keep one with
`tower keep policies` (markdown on stdin), or ask a worker to; edit it in place like any kept item.

A policy is one markdown file: a `# Title` line, a fenced json header, then the prose, which is the whole prompt its
run's worker starts on.

````md
# Dependency updates

```json
{
  "when": { "cron": ["0 6 * * 1"], "tz": "UTC" },
  "check": "test -f package.json",
  "start": "auto",
  "live": 1,
  "hire": { "model": "opus", "effort": "high" }
}
```

Update the project's dependencies one at a time, running the tests after each. Open one pull request with every
update that passed, and list the ones that failed and why. Nobody watches this run: end with `tower home` once the
pull request is open.
````

The header's keys:

| Key | Takes | Unset |
|---|---|---|
| `when` | `cron`, one or more crons the tower can say in words (day of month and day of week never both, never a bare `*` minute), and `tz`, an IANA zone. | required; `tz` the machine's |
| `check` | A shell line run from the floor's hub at each slot, at most 60 s: exit 0, there is work (its output goes to the run); 1, none; anything else, failed. | no check |
| `start` | `ask`: each slot is offered to you. `auto`: started on its own, but only on words approved as they are now; any edit needs a new approval, and until then its slots are offered. | `ask` |
| `live` | How many of its runs may run at once; a slot due while they all run is held. | `1` |
| `hire` | The spawn's `cwd`, `cut` (`{ "name", "branch", "base" or "from" }`), `model` and `effort`. | a spawn's defaults |
| `runner` | Leaves the policy to another runner by that name: this extension never acts on it. | this extension runs it |
| `x` | A runner's own data. | none |

Any other key makes the policy invalid, said at its path in the panel and in `tower policies`: an invalid policy never
runs. A slot is on time for 5 minutes; one the tower wasn't up for is missed, and nothing records it.

Its collection's `label` and `description` can be overridden by a `policies` entry in the config's `collections`.

## How it works

At each slot, the tower's slot loop fires the extension, which decides from the board alone: held while `live` is
full; else the check first, when there is one; then a run when the policy is `auto` and approved, else an offer.
Every slot it sees gets exactly one fact, so a slot is never decided twice, across restarts too.

- `extension.json`: the `policies` collection; two project streams, `runs` (`r`, a run: the policy, its hash, the
  slot or none by hand, the worker, how it started, who started it, the check; `s`, a pass: `offered`, `no-work`,
  `held` or `check-failed`) and `approvals` (`a`, a hash approved, and by whom), kept in
  `streams/projects/<project>/runs/` and `approvals/`; the verbs `run`, `pass` and `approve`; the reads
  `runs/<project>` and `said/<project>`; a floor fold (`x`, the board's `slots` and `asks`) and a card fold (`x` and
  the card's `lines`); and the views `policies` (the panel, at `pane` scale on a floor) and `tray` (at `row` scale on
  the collection).
- `server.ts`: parses and hashes each policy file as the collection changes; folds the streams into each policy's view,
  the open offers and the run a card is; answers the verbs, each policy's taken one at a time: `policies/run` parses
  the file now, spawns a worker on its `hire` and prose, and appends `r` (killing the worker if the fact can't be
  written, so no run goes uncounted); `policies/pass` appends `s`; `policies/approve` appends `a` only for the file's
  hash now. Its `slots['*']` is the runner: it decides a due slot, runs the check (`check.ts`, `sh -c` in the hub with a
  Claude session's variables scrubbed), and carries out the decision through those same verbs, deciding again every
  30 s while a refusal leaves the slot undone and it is on time.
- `policy-file.ts`: a file read as a policy, total: what isn't one says why, each problem at its path.
- `policies.ts`: the pure folds: each policy's view, the offers, the run a card is, a policy's runs.
- `cli.ts`: the words `tower policies` and `tower runs` print, served by the read `said/<project>`, so the core's CLI
  prints whatever the provider of `policies` says.
- `client/policies.ts`: where a policy stands and what the runner decides (`decide`), pure over the board, shared by
  the server, the CLI and every renderer; `client/panel.ts`, the panel's html; `client/view.ts` and `client/tray.ts`,
  the two views.

Any worker may run, approve or accept, through `tower policies` or the verbs.

## Make it yours

- **Your standing work**: a file per policy in the floor's `policies` collection, as above.
- **Only on days there is work**: a `check` that exits 1 when there's nothing to do, so the slot passes quietly.
- **Started without asking**: `"start": "auto"`, then approve its words in the panel or with `tower policies approve`.
- **Your own runner**: name it in a policy's `runner`, put its data under `x`, and have it run or pass slots through
  the same verbs (`tower x policies run`, `tower x policies pass`). Or provide the `policies` capability yourself:
  `tower policies` prints what your `said/<project>` read says, and the tower page loads your client's modules.
- **How it is drawn**: `client/panel.ts`.

## Pictures

`npm run tool:extension-shots -- extensions/policies` retakes them from the scenes in [`shots.json`](shots.json),
seeded with the sample policies in [`shots/seed/`](shots/seed/).
