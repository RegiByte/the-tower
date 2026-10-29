---
{
  "type": "decision",
  "name": "Tower 3D lists an object's verbs, each on its own key",
  "summary": "What you aim at in Tower 3D lists its verbs in the corner, each bound to one key that means the same on every object; verbs that end something run on a hold. No menu opens, so you never stop walking.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-29",
  "refs": ["hub/renderers/tower3d/src/acts.ts#offersOf", "hub/renderers/tower3d/src/acts.ts#OFFERS", "hub/renderers/tower3d/src/acts.ts#KEY", "hub/renderers/tower3d/src/acts.ts#HELD", "hub/renderers/tower3d/src/acts.ts#heldWhy", "hub/src/shared/health.ts#whyNot", "hub/renderers/tower3d/src/main.ts#onKey", "hub/renderers/tower3d/src/ui.ts#promptHtml", "hub/renderers/tower3d/index.html"]
}
---
**Problem.** Each object in Tower 3D did one thing on E. Everything else (brief, resume, reap, kill, spawn, a
shell) sat in the panel you got after using it, so acting on a worker meant sitting down first, while the board
advertises several verbs per thing ([[board-verbs]]).

**Why.** The user uses the tower all day, so acting on what you look at has to be fluid: no mode to enter and
nothing covering the view. Red Dead Redemption 2's look-then-pick prompts do this: the actions for what you face
appear in a corner, each on its own button, consequential ones are held, and the player never stops moving.

**How.**
- [`offersOf`](ref:hub/renderers/tower3d/src/acts.ts#offersOf) derives an aimed object's offers, primary first, from
  the board on every frame. The mesh stores only the object's identity, so offers never go stale between boards.
- Each verb has one key everywhere ([`KEY`](ref:hub/renderers/tower3d/src/acts.ts#KEY)), grouped by meaning (E
  uses, F goes on, Q looks closer, X ends, H hands over). Keys are bound to verbs, never to objects, and
  verbs sharing a key are never offered together.
- [`HELD`](ref:hub/renderers/tower3d/src/acts.ts#HELD) verbs, those that end something, run only after the key or
  mouse button is held ([`HOLD_MS`](ref:hub/renderers/tower3d/src/acts.ts#HOLD_MS)), a ring filling on the key cap;
  releasing early cancels. The hold is the confirmation.
- The mouse path: the wheel marks a verb and a click runs it.
- A verb that needs a daemon stays listed while the daemon is down or the tower is lost, faded, with why under it
  ([`heldWhy`](ref:hub/renderers/tower3d/src/acts.ts#heldWhy) over [`whyNot`](ref:hub/src/shared/health.ts#whyNot));
  its key says why in a toast and runs nothing. The panels draw those verbs' buttons inert, as the tower page does.
- A stopped worker offers resume first, then a read-only look at its last screen, then its brief.
- An aimed verb's key comes before a global one ([`onKey`](ref:hub/renderers/tower3d/src/main.ts#onKey)); the global
  keys are for movement and navigation, and those with a meaning in the world also have an object that offers it
  (the directory board offers next waiting and overview, the DJ music).

**Alternatives considered.**
- A radial menu on hold-E or right-click. It opens a mode, freezes the camera, and needs direction maths, which pays
  off for six to eight choices; objects here offer a handful.
- E for the primary verb and a menu for the rest. The other keys would be invisible, and a stopped desk's primary
  changes, so E would mean different things on the same object.
- The two-click "sure?" for destructive verbs. It stays on the desk panel's buttons ([[press-feedback]]), but in the
  world a hold is one gesture, and a tap can't misfire.

**Impact.** Every verb is reachable without opening a panel. A new object or verb is one entry in `OFFERS` and, if
it has a new meaning, one key.
