---
{
  "type": "decision",
  "name": "Tower 3D lists an object's verbs, each on its own key",
  "summary": "What you aim at in Tower 3D lists its verbs in the corner, each bound to one key that means the same on every object; verbs that end something run on a hold. No menu opens, so you never stop walking.",
  "in": "web-tower",
  "status": "accepted",
  "date": "2026-10-04",
  "reviewed": "2026-10-08",
  "refs": ["hub/renderers/tower3d/src/acts.ts#offersOf", "hub/renderers/tower3d/src/acts.ts#KEY", "hub/renderers/tower3d/src/acts.ts#HELD", "hub/renderers/tower3d/src/acts.ts#heldWhy", "hub/src/shared/cards.ts#whyNot", "hub/renderers/tower3d/src/main.ts", "hub/renderers/tower3d/src/ui.ts#promptHtml", "hub/renderers/tower3d/index.html"]
}
---
**Problem.** Each object in Tower 3D did one thing on E. Everything else (brief, resume, reap, kill, spawn, a
shell) sat in the panel you got after using it, so acting on a worker meant sitting down first. The board
now advertises several verbs per thing ([[board-verbs]]), and the world had no way to offer them.

**Why.** The user uses the tower all day, so acting on what you look at has to be fluid: no mode to enter and
nothing covering the view. Red Dead Redemption 2's look-then-pick prompts do this. The actions for what you
face appear in a corner, each on its own button, consequential ones are held, and the player never stops
moving.

**How.**
- [`offersOf`](ref:hub/renderers/tower3d/src/acts.ts#offersOf) derives an aimed object's offers, primary
  first, from the board on every frame. The mesh stores only the object's identity (`Act`), so offers never
  go stale between boards.
- Each verb has one key everywhere ([`KEY`](ref:hub/renderers/tower3d/src/acts.ts#KEY)), grouped by meaning:
  - E: use the object (sit, open here, read, watch, open its panel, music, play a game)
  - F: go on (resume, goto, next waiting)
  - Q: look closer (brief, overview)
  - Y: hire a reviewer of a worker ([[reviewer]])
  - G: spawn
  - T: a review thread: a worker's, the papers on its desk, a pigeonhole slot ([[review-threads]]); a shell at the console
  - C: the user's editor
  - X: end (send home, kill, stop sharing)
  - Z: reap
  - H: hand over what you carry (a note to a worker or the open desk, [[corkboard]]), or review notes to the worker
    they are new to (`send`, on the papers and a pigeonhole slot)

  Verbs sharing a key are never offered together. Keys are bound to verbs, never to objects.
- [`HELD`](ref:hub/renderers/tower3d/src/acts.ts#HELD) verbs (kill, stop, reap) run only after 1.2 s held (700 ms proved too quick to trust with sending a worker home).
  A ring fills on the key cap, and releasing early cancels. The hold is the confirmation.
- The mouse path: the wheel marks a verb, a click runs it, and a held click runs a held verb. In the overview
  the list follows the cursor and the keys work on what's under it.
- `kill` reads "send home" on a worker: the worker packs up and walks out.
- A worker with [[leftover]]s lists them in its card (pid, listening ports, orphaned or not, command), so
  "reap" says what it would end. Each floor's Running board lists every leftover on the floor, a row each: held Z
  ends that process alone, F goes to its worker's desk while it is on duty. Its head, while the floor's Tidy lists
  anything, is the floor's `tidy`: E opens the list at the console, held Z applies it ([[tidy]]). A finished hire's
  row is its own `landed`: held Z kills that hire alone, by its Tidy row's call.
- A verb that needs a daemon (spawn, a shell, resume, a reviewer) stays listed while the daemon is down or the
  tower is lost, faded, with why under it ([`heldWhy`](ref:hub/renderers/tower3d/src/acts.ts#heldWhy): `whyNot`,
  or the host unknown while lost); its key says why in a toast and runs nothing. The open workstation is still the
  floor's next one, unlit, and offers "hire a worker" held the same way. The panels draw those verbs' buttons inert,
  why on their tip, as the tower page does.
- A stopped worker offers resume first, then a read-only look at its last screen (the server marks a
  snapshot `exited` whenever the host no longer runs the session), then its brief.

**Alternatives considered.**
- A radial menu on hold-E or right-click (the spec's first plan, after the Sims and GTA's weapon wheel). It
  opens a mode, freezes the camera, and needs direction maths, which only pays off for six to eight
  choices. Objects here offer one to four verbs. It is parked for things the player carries, if that ever
  comes.
- E for the primary verb and a menu for the rest. The keys for everything else would be invisible, and a
  stopped desk's primary changes, so E would mean different things on the same object.
- The two-click "sure?" for destructive verbs. It stays in the desk panel's buttons, but in the world a hold
  is one gesture, and a tap can't misfire.

**Impact.** Every verb is reachable without opening a panel. A new object or verb is one entry in
`offersOf` and, if it has a new meaning, one key. The global keys (WASD, Space, N, M, H, B, P, 0–9/R, Esc) stay
for movement and navigation (an aimed verb's key comes first: H hands over a carried note, or sends review notes, where it can), and N, H and B each also have an object path: the directory board offers next
waiting and overview, and the DJ offers music.
