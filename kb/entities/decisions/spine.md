---
{
  "type": "decision",
  "name": "The spine: the tower process as braided resources",
  "summary": "The tower process is eight braided resources (core:config, core:system, core:probes, core:extensions, core:publisher, core:dispatch, core:slots, core:http) and one per extension (x:<cap>), started in dependency order and halted in reverse on SIGTERM and SIGINT; each holds its own state in its closure, a core resource that fails to start fails the boot, an extension fails alone, and GET /extensions answers their topology.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-10-24",
  "reviewed": "2026-10-24",
  "refs": ["hub/src/tower/spine.ts#tower", "hub/src/tower/spine.ts#config", "hub/src/tower/spine.ts#system", "hub/src/tower/spine.ts#probes", "hub/src/tower/spine.ts#slots", "hub/src/tower/extensions.ts#topologyOf", "hub/src/tower/extensions.ts#runExtensions", "hub/src/tower/publisher.ts#publisher", "hub/src/tower/dispatch.ts#dispatch", "hub/src/tower/http.ts#httpServer", "hub/src/tower/server.ts", "hub/src/system.ts#watchSystem", "hub/src/tower/screens.ts#screenMirrors", "hub/src/shared/shelf-page.ts#Topology", "hub/package.json"]
}
---
**Problem.** The tower process was a top-level-await script: about fourteen pieces of state at module scope, its
pieces started by hand in source order, and nothing ever halted. Extensions add pieces with lifecycles that depend on
each other, may fail alone, and must restart without restarting the tower; hand-wiring each into one script adds an
ordering bug and a leak per piece.

**Why.** Integrant's model, as [braided](https://www.npmjs.com/package/braided) (the user's library) has it: a
resource is `{ dependencies, start(deps), halt(instance) }`, started in topological order and halted in reverse, with
the topology (layers, order, dependents) as data. The tower's other half, `src/shared/loop.ts`, covers state with a
lifecycle inside a renderer; the spine covers resources with one inside the process.

**How.**

- [`tower`](ref:hub/src/tower/spine.ts#tower) names the core's resources, and [`server.ts`](ref:hub/src/tower/server.ts)
  starts them, then the extensions beside them ([`runExtensions`](ref:hub/src/tower/extensions.ts#runExtensions),
  [[extensions]]), halts them all in reverse on SIGTERM (`tower down`, [[bring-up]]) or SIGINT, and exits. A core
  resource that fails to start fails the tower: what started is halted, each failure printed, and the process exits 1.
  An extension that fails to start fails alone, and what requires it is skipped.
- `core:config` ([`config`](ref:hub/src/tower/spine.ts#config)): the paths, and `read()`, the config as the file
  holds it now. A live reader, never a snapshot: the user edits the config at any time.
- `core:system` ([`system`](ref:hub/src/tower/spine.ts#system)): [`watchSystem`](ref:hub/src/system.ts#watchSystem)
  with `onChange(listener)`, so the publisher and the dispatch each hear changes and stop hearing them as they halt.
- `core:probes`, `core:slots` ([`probes`](ref:hub/src/tower/spine.ts#probes), [`slots`](ref:hub/src/tower/spine.ts#slots)):
  the probes' and the policies' runners, the slots acting through the dispatch's `tower/policy/run` and
  `tower/policy/pass`, called as `{t: 'tower', id: 'slot'}`.
- `core:publisher` ([`publisher`](ref:hub/src/tower/publisher.ts#publisher)): the board derived from the config and
  the system, its SSE clients and the minute's clock.
- `core:dispatch` ([`dispatch`](ref:hub/src/tower/dispatch.ts#dispatch)): `call`, every verb but the mux's by its
  qualified name, the core's and the extensions' (which it finds through `core:extensions`), and the state verbs keep
  while they run (hires and resumes in turn, workers departing).
- `core:http` ([`httpServer`](ref:hub/src/tower/http.ts#httpServer)): the routes, the streams and the mux, with the
  connection state they hold; its halt closes every connection and drops the screen mirrors
  ([`screenMirrors`](ref:hub/src/tower/screens.ts#screenMirrors)).
- `core:extensions`: what the publisher and the server show of the extensions, the registry and the resources it
  covers, set after each reconcile, and what runs, which the dispatch calls. Each extension is a resource `x:<cap>` after the core's, memoized by a hash of what
  it starts from, so a config edit reconciles the system (braided's `reconcileSystem`) and restarts only what changed.
- `GET /extensions` answers every extension and the topology read from the resources' dependencies
  ([`topologyOf`](ref:hub/src/tower/extensions.ts#topologyOf)) with its Mermaid text ([[renderer-api-contract]]).

**Alternatives considered.**

- *Hand-wiring each new piece into the script*: what existed; every extension would add an ordering bug and a leak.
- *A container written for the tower*: braided already is the small one, and its author maintains it.
- *Vendoring braided*: a fork of a maintained library; the tower depends on 0.3.2, after 0.3.1, the first to skip a
  missing optional dependency.
- *Finer resources (one per stream kind, per connection)*: eight match the process's real seams; finer ones would
  split state that changes together.

**Impact.** Additive to the API (1.80), no host change. Every piece of the process stops cleanly, so a system can be
halted and started again in one process, and extensions, each a resource hung on the core's, restart without the
tower ([[live-system]], [[extensions]]).
