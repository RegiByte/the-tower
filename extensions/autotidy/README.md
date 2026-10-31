# Autotidy

Tidy what a worker leaves behind as it goes home, by itself: its processes, its worktree, its kept branch and its
landed review thread, without a press of Tidy.

## What it adds

### The tower

**Nothing to see: it acts.** For two minutes after a worker goes home, whatever the floor's Tidy lists of that
worker's, and its settings turn on, is applied through the same `tidy` verb the Tidy press calls. What it removed
simply leaves the floor's Tidy list; what wasn't safe to remove in those two minutes stays there for you.

Going home counts when the worker was sent home (from its card, the palette or `tower home <callsign>`), went home by
itself with `tower home`, or was let go. A worker that exited by itself or crashed is one you may resume, and doesn't
count, nor does a stranded one waiting to be resumed, with two exceptions: one started before today that ended
leaving nothing running or waiting (its card leaves the board as it ends, so how it ended isn't read), and a worker
the tower ends just after starting it because its hire or policy run couldn't be recorded.

### The board

**Each floor's `x.autotidy`**: its settings on that floor and the workers going home now, each with the sessions it
ran as, its checkout and the branch its worktree held. Here one worker was just sent home from the main checkout:

```json
{
  "x": {
    "autotidy": {
      "reap": true,
      "worktrees": true,
      "branches": true,
      "extensions": true,
      "going": [
        {
          "sessions": [
            "20261031-162819-08f2"
          ],
          "checkout": "main"
        }
      ]
    }
  }
}
```

No renderer draws it, the workers get no guidance from it (it isn't in `tower whoami`), and it has no verbs or reads
for `tower x autotidy`. `tower extensions` lists it as `autotidy  Autotidy 1.0 · running · bundled`.

## Add it

It ships with the tower and is on by default, but does nothing until a setting turns a kind on (below). Turn it off
everywhere with

```json
"extensions": {
  "autotidy": { "off": true }
}
```

or on one floor with `"capabilities": { "autotidy": { "off": true } }` in that project's entry
(`projects.<id>.capabilities`).

## What it needs from you

**Which kinds to tidy.** Each is off unless set:

| Setting | Tidies | Unset |
| --- | --- | --- |
| `reap` | The processes the worker left, unless someone on duty works in its checkout (main's included): a process names no checkout, and may serve a worker sharing it. A server it started for you ends too, though you may still have it open: leave `reap` off where workers start servers you keep using. | `false` |
| `worktrees` | Its worktree, once nobody is in it, it is clean and its branch is absorbed into its base: landed, not only pushed. One whose branch is pushed but not merged yet (an open pull request, say) stays, though Tidy lists it. | `false` |
| `branches` | The kept branch its worktree held, once absorbed. | `false` |
| `extensions` | The extensions' Tidy entries that name its checkout, unless someone on duty works in it: the reviews extension's landed thread, filed. | `false` |

```json
"extensions": {
  "autotidy": { "settings": { "reap": true, "worktrees": true, "branches": true, "extensions": true } }
}
```

A floor's own settings win per key, in that project's entry (`projects.<id>.extensions`):

```json
"extensions": { "autotidy": { "settings": { "reap": false } } }
```

Everything else, such as a branch not merged yet or a worker's processes while another works in its checkout, stays
for you to Tidy by hand.

## How it works

It has no client and keeps nothing: going home is already a fact in the worker's log, read from the board.

- `extension.json`: its `settings` schema (the four kinds), a `floor` fold whose part is the board's `x.autotidy`
  (above), and a `board` trigger.
- `server.ts`: the fold puts the floor's settings and the workers going home on the board; the trigger, given the last
  board and the new one, asks the core's `tower/tidy` for what the new board lists of theirs that the last did not.
  It writes no facts of its own; the tidy verb does what the Tidy press does.
- `plan.ts`, all pure over the board:
  - `goingHome`: the floor's cards off duty for less than `GOING_MS` (two minutes, while the tower's reads of
    processes and git catch up with the going), continued by no session, and ended by the tower's kill or let go.
  - `leftBoard`: the running cards the new board no longer carries, gone home on the board they left it on.
  - `planOf`: the floor's Tidy plan cut down to what those workers left, as the settings say. Tidy's own conditions
    hold: autotidy only picks from its list.
  - `fresh` and `listedBefore`: ask for each entry once, and never for a worktree that came onto the board after the
    worker went (a recut, made to resume it).
  - `byKind`: one call per kind (worktrees, branches, each worker's reaps, each extension's entries), since Tidy
    refuses a whole call when any of it no longer qualifies, so a stale entry takes down only its own kind.

## Make it yours

- **What counts as going home**: `goingHome` and `leftBoard` in `plan.ts`.
- **How long after it acts**: `GOING_MS` in `plan.ts`.
- **What it removes**: `planOf` in `plan.ts`, or a copy of this folder under a new id, turned on in its place.

## Pictures

`npm run tool:extension-shots -- extensions/autotidy` retakes the board's part from [`shots.json`](shots.json): two
sandbox workers, one sending the other home.
