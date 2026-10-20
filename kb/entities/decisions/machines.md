---
{
  "type": "decision",
  "name": "Machines: a renderer's stateful logic as pure steps run by one small loop",
  "summary": "State with a lifecycle (more than two states, anything timed, or anything two renderers need) is a machine: pure steps over plain state that return the next state and tagged effects, wired as one handler per event type into the shared loop, which applies the state and hands every other effect to the renderer's executors. A machine any renderer needs lives in src/shared and is served; one renderer's own lives beside it.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-19",
  "reviewed": "2026-10-19",
  "refs": [
    "hub/src/shared/loop.ts",
    "hub/src/shared/loop.ts#loop",
    "hub/src/shared/loop.ts#Handlers",
    "hub/src/shared/loop.ts#Executors",
    "hub/src/shared/loop.ts#TimerEffect",
    "hub/src/shared/loop.ts#timers",
    "hub/src/shared/reads.ts#Held",
    "hub/src/shared/reads.ts#refreshRead",
    "hub/src/shared/reads.ts#stepped",
    "hub/src/shared/reads.ts#heldHandlers",
    "hub/src/shared/reads.ts#reading",
    "hub/src/shared/attend.ts#attendStep",
    "hub/src/shared/attend.ts#watching",
    "hub/renderers/page/view.js",
    "hub/renderers/page/page.js#pageHandlers",
    "hub/renderers/tower3d/src/main.ts#seeingHandlers",
    "hub/test/reads.test.ts"
  ],
  "links": [
    { "to": "renderer-is-disposable", "verb": "follows", "carries": "a machine a next renderer would need lives in shared" },
    { "to": "shared-panels", "verb": "uses", "carries": "the panels draw what a machine's state holds" }
  ]
}
---
**Problem.** The renderers kept their lifecycles in module variables, timers and if-chains in handlers, and wrote
the same one more than once: the "hold the last read until the next lands" logic eight times across the tower page
and Tower 3D, the attention ring twice, the spawn dialog twice. Every copy drifted, and each drift was a bug a
user could see (a poll left running after its pane closed, a failure toasted on every draw, a ring in one
renderer and silence in the other). Logic spread across handlers could not be tested without a browser.

**Why.** The bridge has been the steadiest part of the tower because it is pure folds over facts, replayed against
recorded logs. A renderer's stateful logic gets the same treatment: plain state, pure steps, effects as data, the
I/O at the edge ([[renderer-is-disposable]]: what a next renderer would need is in shared, not in a renderer).

**How.**
- *When it is a machine.* State that has more than two states, involves time (a poll, a retry, a reminder) or is
  needed by more than one renderer. A flag that only shows or hides something stays a variable.
- *Pure steps are the unit.* A step takes the state and what happened and returns the next state and the effects
  it calls for, as [`refreshRead`](ref:hub/src/shared/reads.ts#refreshRead) and its siblings do over
  [`Held`](ref:hub/src/shared/reads.ts#Held). Steps compose: a renderer's bigger machine calls them inside its own
  handlers. A step that changes the state calls for at least one effect ([`stepped`](ref:hub/src/shared/reads.ts#stepped)
  reads no effects as no change).
- *Handlers wire steps to events.* One handler per event type ([`Handlers`](ref:hub/src/shared/loop.ts#Handlers):
  a missing one is a type error), each `(state, event) → effects`. The next state is an effect, `state`, put
  first so executors that read the loop's state see the new one.
- *The world enters a machine only as events.* What a step needs to know about the renderer is in the machine's
  state, put there by the events that changed it, never read from the renderer as an event is handled. The worker a
  viewer watches is the tower page's selection while the window has their eye: the page's machine holds its main view
  ([`view.js`](ref:hub/renderers/page/view.js)) and the window's focus and visibility, each changed by its own event,
  and runs attention's steps beside them ([`pageHandlers`](ref:hub/renderers/page/page.js#pageHandlers),
  [`attendStep`](ref:hub/src/shared/attend.ts#attendStep), [`watching`](ref:hub/src/shared/attend.ts#watching)); Tower
  3D's holds its open panel the same way, the desk you sit at among them
  ([`seeingHandlers`](ref:hub/renderers/tower3d/src/main.ts#seeingHandlers)). The view and the rings read one
  selection, so a wiring missed shows on screen, and a machine replays the same from its events. An event enters as
  it happens, apart from drawing: Tower 3D hands a board to its machine as it arrives, before its models are in or
  its first frame is drawn, which a hidden tab holds back.
- *Time is data.* A timer is an effect carrying the event it fires
  ([`TimerEffect`](ref:hub/src/shared/loop.ts#TimerEffect), run by [`timers`](ref:hub/src/shared/loop.ts#timers)):
  starting one under an id replaces the one running there, and leaving a view cancels it in the handler that
  leaves, so a poll's life is in what the handlers return.
- *Executors are the shell.* The renderer gives one executor per effect type
  ([`Executors`](ref:hub/src/shared/loop.ts#Executors)): the fetch, the DOM, sound, `tower.store`. An executor
  dispatches what comes of its I/O ([`reading`](ref:hub/src/shared/reads.ts#reading)) and decides nothing.
- *One loop.* [`loop`](ref:hub/src/shared/loop.ts#loop) runs a machine: it applies `state`, runs the other effects
  in order, and queues an event dispatched while another is handled until that one's effects have run, so every
  handler sees the state the one before it left. It holds no subscriptions, interceptors or registries.
- *Where it lives.* A machine any renderer needs is a module in `src/shared`, served as `/<name>.js` (an API
  minor); its first is [`heldHandlers`](ref:hub/src/shared/reads.ts#heldHandlers). A machine only one renderer
  has (the tower page's main view, Tower 3D's movement) lives beside that renderer, in the same shape.
- *Tests.* Steps are pure functions, so a machine's bug is pinned by a unit test of its steps
  ([`reads.test.ts`](ref:hub/test/reads.test.ts)) where the behaviour is worth locking down.

**Alternatives considered.**
- *A full re-frame (subscriptions, interceptors, coeffects).* Renderers derive their views from the board, which
  already plays the subscriptions' part; the rest is machinery no machine asked for.
- *A library (an event-loop library such as emergent, an actor or statechart library).* The loop is about sixty lines and the
  tower serves its shared modules to renderers in any language; a dependency would be API surface for little.
- *Each machine its own shape* (`[state, effects]` here, callbacks there). That is how the copies drifted.

**Impact.** Shared machines replace the renderers' copies one at a time, each an API minor. The page's module
variables shrink as its machines move out. New stateful logic is written as a machine from the start.
