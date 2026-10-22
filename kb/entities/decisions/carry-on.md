---
{
  "type": "decision",
  "name": "A worker cut off mid-turn carries on through a resume on a prompt",
  "summary": "A worker stranded (the host stopped or lost it, or a signal from outside the tower killed it) while its turn ran is derived as cutOff (the status its log folds to just before the exit), and offers carry-on: a resume whose call passes a fixed prompt as Claude's first, so it takes up the turn without the user typing; the floor's resume-all carries on every cut-off worker.",
  "in": "bridge",
  "status": "accepted",
  "date": "2026-10-09",
  "reviewed": "2026-10-22",
  "refs": [
    "hub/src/bridge/facts.ts#stepAfter",
    "hub/src/bridge/facts.ts#killedOutside",
    "hub/src/bridge/life.ts#lifeOf",
    "hub/src/bridge/status.ts#isMidTurn",
    "hub/src/bridge/board.ts#Card",
    "hub/src/bridge/verbs.ts#cardOffers",
    "hub/src/shared/launch.ts#CARRY_ON",
    "hub/src/shared/launch.ts#resumeRequest",
    "hub/src/shared/api.ts#VERBS",
    "hub/src/shared/cards.ts#statusName",
    "hub/src/shared/cards.ts#CARRY_ON_MEANS",
    "hub/src/shared/cards.ts#resumeAllAsk",
    "hub/src/shared/cards.ts#resumeStranded",
    "hub/src/cli.ts",
    "hub/renderers/page/index.html", "hub/renderers/page/page.js",
    "hub/renderers/tower3d/src/ui.ts",
    "hub/test/fixtures/host-stopped-mid-turn.jsonl",
    "hub/test/board.test.ts"
  ]
}
---
**Problem.** When the host stops (a restart through `tower down`/`up`, or a crash), every running session ends with
`x` `hostStopped`. A worker that was mid-turn was cut off: resumed, it sits idle until the user types something like
"carry on", worker by worker. A worker killed by a signal from outside the tower (another worker's `pkill -f`
matching its command line) was worse: it read as ended, off duty, in no list of workers to bring back.

**Why.** Which workers were cut off is already in their logs, and the act is a resume plus a prompt: nothing new needs
storing, and the capability belongs in the core, where every renderer and worker reaches it ([[let-go]],
[[board-verbs]]).

**How.**
- **Stranded, three ways** ([`lifeOf`](ref:hub/src/bridge/life.ts#lifeOf)): lost (no `x`, its host gone), stopped
  with the host (`hostStopped`), or killed from outside
  ([`killedOutside`](ref:hub/src/bridge/facts.ts#killedOutside)): Claude exits 128 plus the number of a signal it
  catches (143 for SIGTERM, raising `SessionEnd` with reason `other`, which moves no status), and the host's own kill
  is SIGHUP, 129, so any other code above 128 is a signal nobody in the tower sent. node-pty reports a signal the
  process didn't catch (SIGKILL) as code 0 with a signal the host doesn't log: such a kill reads as an end.
- **Derived.** The fold keeps `exitedFrom`, the status a session was in when its `x` arrived
  ([`stepAfter`](ref:hub/src/bridge/facts.ts#stepAfter)); no hook lands between the host's kill and the `x`, as
  real logs show. A lost session (no `x`) keeps its last status in its facts. The card's `cutOff` is stranded, not
  broken (a broken fold doesn't know where the turn stood), and that status mid-turn
  ([`isMidTurn`](ref:hub/src/bridge/status.ts#isMidTurn)): `working`, compaction included, or `needs_input`, a turn
  held on a permission dialog, which Claude asks again. It stays on the card as history after a resume or a let go.
- **No waiting for ready.** `resume` takes an optional `prompt`, passed after `--` as a spawn's first prompt is
  ([`resumeRequest`](ref:hub/src/shared/launch.ts#resumeRequest)): Claude takes it as it starts, the way a hired
  worker gets its prompt, so no submit waits for the resumed session to reach its composer.
- **A card verb with its call.** `carry-on` is offered beside `resume` while the card awaits a resume and is
  `cutOff`; its call is `['resume', {id, conversation, prompt: CARRY_ON}]`
  ([`cardOffers`](ref:hub/src/bridge/verbs.ts#cardOffers)), the prompt one constant
  ([`CARRY_ON`](ref:hub/src/shared/launch.ts#CARRY_ON)): "You were cut off mid-turn: your session stopped before your
  turn ended. Carry on where you left off." It names no cause: a host stop, a crash, a `down` without an `up` and a
  kill from outside all cut off.
- **Everywhere resume is.** The status reads "stopped mid-turn" or "lost mid-turn"
  ([`statusName`](ref:hub/src/shared/cards.ts#statusName)); a sidebar card, short of room, says "stranded"
  ([`statusWord`](ref:hub/src/shared/cards.ts#statusWord)) with the full status on hover. No renderer draws carry on on a card: a stranded card offers resume and let go, and the
  floor's "resume all N stranded" carries on the cut-off ones and resumes the rest, its ask naming which and saying
  what carrying on does ([`CARRY_ON_MEANS`](ref:hub/src/shared/cards.ts#CARRY_ON_MEANS)) ([`resumeAllAsk`](ref:hub/src/shared/cards.ts#resumeAllAsk),
  [`resumeStranded`](ref:hub/src/shared/cards.ts#resumeStranded)); `tower resume <id> --carry-on` from the CLI.
- `test/fixtures/host-stopped-mid-turn.jsonl` and `host-stopped-done.jsonl` are sandbox sessions the sandbox host
  stopped, one mid-tool-call and one after its `Stop`.

**Alternatives considered.**
- Resume, then `submit` once the resumed Claude is at its composer. It needs a readiness signal and a wait in the
  tower (or a renderer), and a race with a startup screen; the first prompt as an argument has neither.
- A separate `carry-on` server verb. It would be `resume` with a prompt; one verb with an optional field keeps one
  queue and one set of refusals.
- *Carry on on each card, beside resume.* Built first (2026-10-09), in the tower page's card and header and Tower 3D's
  desk panel. Three buttons on a stranded card for one moment after a restart; the user kept resume all as where it
  lives (2026-10-15): it prompts only the workers cut off mid-turn and resumes the rest plainly, so a worker kept
  alive on purpose is never prompted. `calls['carry-on']` stays on the board for any renderer or worker.
- A separate "carry on all" beside "resume all". Two floor buttons for one moment after a restart; the ask lists who
  carries on.
- Storing that a session was cut off. It is computed from the log.
- *The host logs the signal beside the exit code.* It would catch SIGKILL too, but a host change ends every running
  session; Claude's own exit code already tells SIGTERM, the default of `kill` and `pkill`, from the host's SIGHUP.
- *Any exit the tower didn't ask for strands the worker.* Claude's ordinary exits (a crash, `/exit`) aren't told
  apart yet; signals only, until they are.

**Impact.** A board field (`cutOff`), a card verb (`carry-on`) and `resume`'s `prompt`: API minor. No host change, no
config change. The sandbox's sessions submit the prompt a resume passes.
