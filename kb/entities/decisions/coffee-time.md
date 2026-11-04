---
{
  "type": "decision",
  "name": "Coffee time: a shared coffee machine per floor, rounds kept as transcripts by the bundled coffee extension",
  "summary": "The bundled extension coffee gives each floor a coffee machine: coffee/call opens a round and prompts every worker at its prompt to come (submit/at-prompt, the rest left alone), workers join, say and propose through tower x coffee, and the user hires a worker on an idea, keeps it as a draft or passes; every round is one append-only markdown file in the floor's owned coffee collection, written only by those verbs, from which the open round, who is present, the ideas waiting (each an ask) and a present worker's badge are folded; a floor's settings may schedule coffee time as a folded slot; in Tower 3D the present workers stand at the floor's coffee corner.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-04",
  "reviewed": "2026-11-04",
  "refs": [
    "hub/extensions/coffee/extension.json",
    "hub/extensions/coffee/server.ts#callPrompt",
    "hub/extensions/coffee/server.ts#hirePrompt",
    "hub/extensions/coffee/server.ts#draftText",
    "hub/extensions/coffee/client/rounds.ts#parseRound",
    "hub/extensions/coffee/client/rounds.ts#appended",
    "hub/extensions/coffee/client/rounds.ts#presentIn",
    "hub/extensions/coffee/client/rounds.ts#proposalsOf",
    "hub/extensions/coffee/client/rounds.ts#roundView",
    "hub/extensions/coffee/client/rounds.ts#roundLines",
    "hub/extensions/coffee/client/machine.ts#mount",
    "hub/extensions/coffee/client/tray.ts#mount",
    "hub/src/shared/extensions.ts#BUNDLED",
    "hub/test/coffee.test.ts",
    "hub/renderers/tower3d/src/layout.ts#coffeePlaces",
    "hub/renderers/tower3d/src/layout.ts#coffeeOf"
  ],
  "links": [
    {
      "to": "extensions",
      "verb": "follows",
      "carries": "a bundled extension: verbs, reads, an owned collection, folds and views, no core code"
    },
    {
      "to": "collections",
      "verb": "amends",
      "carries": "an owned collection whose items are written only through the extension's verbs"
    },
    {
      "to": "logs-are-facts",
      "verb": "follows",
      "carries": "one entry per act, everything else derived from the file"
    },
    {
      "to": "submit-at-prompt",
      "verb": "follows",
      "carries": "a worker is called only while it sits at its prompt"
    },
    {
      "to": "agents-have-every-capability",
      "verb": "follows",
      "carries": "any worker joins, speaks, proposes or calls a round"
    },
    {
      "to": "attention-list",
      "verb": "follows",
      "carries": "an idea waiting on the user is an ask with the sound of an offer"
    },
    {
      "to": "whereabouts",
      "verb": "amends",
      "carries": "a worker at coffee stands at the floor's coffee corner in Tower 3D"
    }
  ]
}
---
**Problem.** Workers on a floor work alone: each knows its own task and nothing of the others', so two of them
chase the same bug, one is stuck on what another solved yesterday, and the ideas a worker has beyond its brief die
with its turn. The user had no place to hear them together, and nothing kept what was said.

**Why.** The tower already knows who is on the floor and whether each is free (`atPrompt`), can type a prompt into a
free worker ([[submit-at-prompt]]), keeps files per floor ([[collections]]) and puts what needs the user in one list
([[attention-list]]). A coffee break is a round: opened, joined, spoken in, closed; the ideas it leaves are decisions
for the user. All of it is one append-only file per round, which any worker can read and the user can keep; nothing
else is stored ([[logs-are-facts]]). It is a bundled extension ([[extensions]]): nothing of it is the core's.

**How.**
- *The round file.* An item of the floor's `coffee` collection, which the extension declares owned
  ([`extension.json`](ref:hub/extensions/coffee/extension.json)): `# Coffee · <stamp>`, then entries, each a heading
  `## <who> · <local time> · <act>` (acts: `calls`, `joins`, `says`, `proposes p<n> · <title>`, `hires p<n> ·
  <session>`, `drafts p<n> · <item>`, `passes p<n>`, `closes`) and a body. Parsing is total
  ([`parseRound`](ref:hub/extensions/coffee/client/rounds.ts#parseRound)); a heading-shaped line inside a fence is a
  body's. [`appended`](ref:hub/extensions/coffee/client/rounds.ts#appended) adds an entry; who is at the machine
  ([`presentIn`](ref:hub/extensions/coffee/client/rounds.ts#presentIn)), the ideas and their decisions
  ([`proposalsOf`](ref:hub/extensions/coffee/client/rounds.ts#proposalsOf)) and the round as every surface reads it
  ([`roundView`](ref:hub/extensions/coffee/client/rounds.ts#roundView)) are read from the entries. The generic
  writes are refused, naming `coffee/join`; a round is never deleted.
- *The verbs.* `coffee/call` opens a round unless one is open and prompts every worker on the floor whose card
  offers `prompt` with [`callPrompt`](ref:hub/extensions/coffee/server.ts#callPrompt) through `tower/submit/at-prompt`;
  a worker mid-task, asking something or holding text is listed as busy in the `calls` entry, never interrupted. A
  worker `join`s with what it is on (opening a round when none is open, so one arriving alone starts the break),
  `say`s and `propose`s; each answers what is new to it since its last entry
  ([`roundLines`](ref:hub/extensions/coffee/client/rounds.ts#roundLines)). `close` ends the round, as a 30 s timer
  does after the floor's `lasts` minutes of quiet, signed `the tower`. `hire` spawns a worker on
  [`hirePrompt`](ref:hub/extensions/coffee/server.ts#hirePrompt), in a new worktree where the floor cuts by default;
  `draft` keeps [`draftText`](ref:hub/extensions/coffee/server.ts#draftText) in the floor's drafts through
  `tower/collection/create`; `pass` lets the idea go. Each appends its decision; a decided idea refuses another. Who
  signs is the caller: a worker by callsign, the user by `board.user.name`. One floor's writes run one after another.
- *Its part of the board.* The floor fold: `floor.x.coffee` (the open round with its entries, every round summarized,
  how many ideas wait), the action `coffee/call` or `coffee/close`, an ask per idea waiting (`sound: 'offer'`, about
  the round's item, with Hire, Draft and Pass), and a slot `call` when the floor's settings name `when` (a cron the
  tower can say, else said in the log and never called), which `slots['*']` answers by calling `coffee/call`. The
  card fold: a ☕ badge on a worker at the machine, read from the collection, since card folds run before the floor's.
  The item fold: whether the round is open and how many ideas wait, as badges.
- *Where it shows.* The tower page's `coffee/machine` on a floor ([`mount`](ref:hub/extensions/coffee/client/machine.ts#mount))
  and `coffee/tray` on the collection ([`mount`](ref:hub/extensions/coffee/client/tray.ts#mount)); the floor's section
  draws the action and the asks, every card its badge. Workers read `tower x coffee` (the manifest's guidance), call
  the verbs with `tower x coffee <verb> '<json>'` and read the round with `tower x coffee round/<floor>`; `tower
  kept coffee` and `tower read <tag>` read the transcripts as any item. Tower 3D stands each present worker at the
  floor's coffee corner, the `office_coffee` prefab by the landing, at one of five spots before its counter
  ([`coffeePlaces`](ref:hub/renderers/tower3d/src/layout.ts#coffeePlaces),
  [`coffeeOf`](ref:hub/renderers/tower3d/src/layout.ts#coffeeOf)), its desk saying so ([[whereabouts]]); it draws no
  Coffee time press of its own, and the ideas ring there as any ask does.
- *What it is not.* No core code: `coffee` joins [`BUNDLED`](ref:hub/src/shared/extensions.ts#BUNDLED) so a user
  extension can't take its id, and the API's minor moves for the addition. No facts in session logs: a worker's
  presence is the round's, not the worker's. No message transport: the round file is the shared place, read by
  whoever asks.

**Alternatives considered.** A stream of facts per floor (`o`, `j`, `s`, `p`, `c`) folded into rounds (the same
derivation, but the user couldn't read a round as a file or keep it on a shelf, and `tower read <tag>` is what a
worker reaches for). Session facts for presence (`tower.x.coffee.at`: a round is a thing of the floor, and a worker
resumed later shouldn't carry it). Prompting every worker, queued (`submit`): a worker mid-task would be interrupted
at its next prompt by a break long over. Claude's own messaging between sessions (a transport, not a record). A
collection item per idea (an idea belongs to the conversation it came from; the ask carries it to the user).

**Impact.** A new bundled extension, an owned collection on every floor, three verbs' worth of asks in the attention
order. [[tidy]] archives nothing of it: rounds are kept files. Off on a floor, every round stays; on again, they are
back, since nothing is stored beside them.
