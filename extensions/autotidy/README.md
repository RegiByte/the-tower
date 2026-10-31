# Autotidy

Tidy what a worker leaves behind as it goes home, by itself: its processes, its worktree, its kept branch and its
landed review thread, without a press of Tidy.

## What it adds

### The tower

**Nothing to see: it acts.** For two minutes after a worker goes home, whatever the floor's Tidy lists of that
worker's, and its settings turn on, is applied through the same `tidy` verb the Tidy press calls. What it removed
leaves the Tidy list; what wasn't safe to remove stays there for you.

Going home counts when the worker was sent home (its card, the palette or `tower home <callsign>`), went home itself,
or was let go. A worker that exited by itself or crashed is one you may resume, and doesn't count.

### The board

**Each floor's `x.autotidy`**: its settings on that floor and the workers going home now. Here one worker was just
sent home from the main checkout:

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

No renderer draws it, it gives the workers no guidance, and it has nothing for `tower x autotidy`.

## Add it

It ships with the tower and is on by default, but does nothing until a setting turns a kind on.

## What it needs from you

**Which kinds to tidy.** Each is off unless set:

| Setting | Tidies |
| --- | --- |
| `reap` | The processes the worker left, unless someone on duty works in its checkout. A server it started for you ends too: leave `reap` off where workers start servers you keep using. |
| `worktrees` | Its worktree, once nobody is in it, it is clean and its branch is landed in its base, not only pushed. |
| `branches` | The kept branch its worktree held, once landed. |
| `extensions` | The extensions' Tidy entries that name its checkout, unless someone on duty works in it: the reviews extension's landed thread, filed. |

```json
"extensions": {
  "autotidy": { "settings": { "reap": true, "worktrees": true, "branches": true, "extensions": true } }
}
```

A floor's own settings win per key, in that project's entry (`projects.<id>.extensions`), as
`"autotidy": { "settings": { "reap": false } }`. Anything Tidy's own conditions don't allow, such as a branch not
merged yet, stays for you to Tidy by hand.

## How it works

It keeps nothing and writes no facts: going home is already a fact in the worker's log. A `floor` fold puts
`x.autotidy` on the board, and a `board` trigger, given the last board and the new one, asks the core's `tower/tidy`
for what the floor's Tidy plan lists of the workers going home, one call per kind, so a stale entry takes down only
its own kind. The picking is pure over the board, in `plan.ts`.

## Pictures

`npm run tool:extension-shots -- extensions/autotidy` retakes the board's part from [`shots.json`](shots.json): two
sandbox workers, one sending the other home.
