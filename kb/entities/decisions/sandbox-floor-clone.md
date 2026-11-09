---
{
  "type": "decision",
  "name": "A sandbox's tower floor is a clone under its root",
  "summary": "The sandbox's `tower` floor has as hub a clone of the checkout at <root>/tower, with a bare origin of its own at <root>/origins/tower.git that forgets the repository it came from, and its `main` is the checkout's HEAD as of the last `up`. So every verb on a sandbox's floors, Tidy and autotidy among them, acts on git under the root. `up` follows HEAD and mends or re-makes the clone, and moves an older config's hub onto it; `sandbox run` refuses a broken clone naming the fix; `down` removes it.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-07",
  "reviewed": "2026-11-09",
  "refs": ["hub/scripts/sandbox.ts#makeFloorClone", "hub/scripts/sandbox.ts#followCheckout", "hub/scripts/sandbox.ts#mendFloorClone", "hub/scripts/sandbox.ts#checkFloorClone", "hub/scripts/sandbox.ts#floorDamage", "hub/extensions/autotidy/server.ts#start", "hub/src/worktrees.ts#tidyable"]
}
---
**Problem.** The sandbox's `tower` floor had the checkout itself as hub, and a worktree shares its refs with the real
repository. A real Tidy on that floor, run as a check, deleted real branches. The sandbox's promise that nothing
reaches the real system held for the tower's files and sockets, not for git, and autotidy could reach the same path.

**Why.** A floor's verbs act on the dirs its config names ([[tidy]], [[autotidy]]). Changing what the floor names
removes the whole class at once, every verb and every future one, with nothing in the core knowing a sandbox exists
([[renderer-is-disposable]]).

**How.**

- [`makeFloorClone`](ref:hub/scripts/sandbox.ts#makeFloorClone) clones the checkout bare to `<root>/origins/tower.git`
  and that to `<root>/tower`, the hub. The bare origin is what makes this hold: a clone's own `origin` names the
  repository it came from and takes a `git push --delete`, and a floor without an origin can't cut. So the bare origin
  has its remote removed, and `lab` and `tower` have the same shape: a push there plays a remote.
- [`followCheckout`](ref:hub/scripts/sandbox.ts#followCheckout) moves `main`, on the origin and the hub, to the
  checkout's HEAD, on a branch or detached. So the floor looks like a real one, a main checkout on `main` level with
  its upstream, and a cut starts from the code under test. The floor shows commits only. Every other branch and tag
  is as of the clone. `branch.<br>.towerBase` isn't cloned, so the floor starts with nothing for Tidy to list.
- [`mendFloorClone`](ref:hub/scripts/sandbox.ts#mendFloorClone) runs on every `up`. macOS deletes idle files under
  `/tmp` and then empty folders, so a clone left alone breaks a piece at a time, in no
  predictable way. [`floorDamage`](ref:hub/scripts/sandbox.ts#floorDamage) asks git: `fsck --connectivity-only --no-reflogs`
  on the origin and the hub, since a walk of a reflog fails on a sound repository when a branch is deleted as it runs,
  and that the hub has its origin. A damaged clone is re-made, and `up` says so, since the
  worktrees cut in it go with it. Then `up` follows, which restores tracked files and `origin/HEAD`. On a sound clone
  a failure to follow, such as a stale lock or `main` checked out in a cut, stops `up` with git's message: it costs
  a running sandbox nothing, and `down` and `up` are the way out when git's message isn't enough.
- `up` refuses a root inside a git repository: a hub whose `.git` went would read as the repository around it.
- `up` writes the `tower` floor's hub into an existing config, whose other keys it leaves alone
  ([`prepareConfig`](ref:hub/scripts/sandbox.ts#prepareConfig)), so an older root moves off the checkout at its next
  `up`. Until then it is as dangerous as it was: [`checkFloorClone`](ref:hub/scripts/sandbox.ts#checkFloorClone)
  has `sandbox run` and `env` refuse it, and refuse a damaged or missing clone, naming `up` as the fix.
- `down` removes the clone and its origin once every daemon stopped: it is derived, and `up` makes it again.
  Leftover roots then weigh what they did. A hub's objects are hardlinks (`--local`), so a clone costs its tree and
  keeps packs alive that the repository drops while the clone exists. `--shared` would be lighter still and
  break when the repository collects its objects.

**Alternatives considered.**

- *A sandbox mode in the core that refuses destructive verbs.* The core would learn about sandboxes, and a check on a
  floor differs from the real thing: rejected by the principles.
- *A wider warning.* The warning existed, and the branches went anyway.
- *A plain clone, its origin left alone.* `origin` is the real repository, which takes a push.
- *Re-making the clone on every `up`.* One path, but it takes the hub from under a running sandbox's sessions and drops
  its cuts when nothing was wrong.
- *Re-making the clone on any failure to follow.* One stale lock would take a healthy clone, its cuts and the hub under
  a running worker, silently.
- *Keeping the clone through `down`.* Cuts on the floor would survive a restart, as `lab`'s do, at a tree per leftover
  root and packs held for as long as the root sits there.

**Impact.** A sandbox's `tower` floor can be cut, tidied and discarded on, like `lab`. It no longer shows uncommitted
work, its git has no GitHub remote (the origins link and `gh`-based extensions such as pr-status have nothing to read
there), it has no `node_modules`, and its cuts don't outlive `down`.
