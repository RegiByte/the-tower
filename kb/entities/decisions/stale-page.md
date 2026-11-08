---
{
  "type": "decision",
  "name": "A stale page is offered a reload: the board says what code the tower serves, tower.js knows what the page loaded",
  "summary": "Every /board message carries served: {id, version}, read once as the tower starts: id a hash over the checkout's src/, renderers/, extensions/ and package lock, version its git describe. /tower.js is served with the served it came from filled in, so tower.stale() is what the tower serves now while its id differs, and tower.onStale hears it change. The tower page offers a reload in a notice that never times out or takes focus, and in the palette while stale; it never reloads by itself.",
  "in": "tower-core",
  "status": "accepted",
  "date": "2026-11-03",
  "reviewed": "2026-11-08",
  "refs": [
    "hub/src/tower/served.ts#servedCode",
    "hub/src/tower/served.ts#servedVersion",
    "hub/src/tower/served.ts#servedNow",
    "hub/src/tower/served.ts#towerClient",
    "hub/src/tower/spine.ts#config",
    "hub/src/tower/publisher.ts#built",
    "hub/src/shared/shelf-page.ts#Served",
    "hub/src/shared/shelf-page.ts#BoardMsg",
    "hub/src/shared/shelf-page.ts#Tower",
    "hub/src/tower/tower.js#heardServed",
    "hub/src/shared/toasts.ts#closableNoticer",
    "hub/src/shared/palette.ts#RELOAD_ENTRY",
    "hub/renderers/page/page.js#staleNotice",
    "hub/renderers/page/index.html"
  ],
  "links": [
    { "to": "renderer-api-contract", "verb": "follows", "carries": "served is an additive field of BoardMsg and tower.js, a minor (1.144)" },
    { "to": "renderer-is-disposable", "verb": "follows", "carries": "the signal is tower.js's, so any renderer can offer a reload its own way" },
    { "to": "logs-are-facts", "verb": "follows", "carries": "derived from the checkout's files as the tower starts, held in memory, never stored" },
    { "to": "press-feedback", "verb": "uses", "carries": "the notice stands in the toasts' stack, closable by its ×" },
    { "to": "command-palette", "verb": "uses", "carries": "a Reload entry while the page is stale" }
  ]
}
---
**Problem.** When the tower restarts on new code (a release, `tower update`), an open page keeps running the JS it
loaded; only its streams reconnect. Tower.app showed the old page until ⌘R. It isn't HTTP caching: renderer files and
pages are `no-store` and the shared modules are hashed. Nothing told a page that the code the tower serves had changed.

**Why.** A page the user lives in for days drifts from the tower behind it: new board fields go unread, fixed bugs
stay. The user decided the page offers a reload and never reloads by itself, since a reload could lose a draft in
progress.

**How.**
- The tower reads what it runs as it starts ([`servedNow`](ref:hub/src/tower/served.ts#servedNow), held by
  `core:config`): `id`, a hash over every file of the checkout's `src/`, `renderers/` and `extensions/` and its
  `package-lock.json`, each by its path and bytes, names starting with a dot left out (`.DS_Store`, swap files)
  ([`servedCode`](ref:hub/src/tower/served.ts#servedCode)), so it changes with any of them and is the same on every start over the same files; and `version`, `git describe --tags
  --always` of the checkout ([`servedVersion`](ref:hub/src/tower/served.ts#servedVersion)), null outside git.
- Every `/board` message carries it beside `v` ([`BoardMsg`](ref:hub/src/shared/shelf-page.ts#BoardMsg)), the board
  and the error alike: it is about the tower, not the board, and a page whose board can't be built is stale all the
  same. A framing page relays it to the shelf pages it frames.
- `/tower.js` is served with the `served` it came from filled in, like `API_VERSION`, revalidated by an ETag of
  its body, which changes with `served`: what the page loaded with is known before its first board, so a page that loaded just before a restart still finds itself stale.
  `tower.served` is it; `tower.stale()` is what the tower serves now while its id differs, else null; `tower.onStale`
  hears that change ([`heardServed`](ref:hub/src/tower/tower.js#heardServed)).
- The tower page shows a notice in the toasts' stack, "The tower was updated" (naming the new version when it differs),
  with Reload and a × ([`closableNoticer`](ref:hub/src/shared/toasts.ts#closableNoticer)). It never times out and
  never takes focus; × hides it until the id moves again. The palette lists "Reload: the tower was updated" while the
  page is stale ([`RELOAD_ENTRY`](ref:hub/src/shared/palette.ts#RELOAD_ENTRY), [[command-palette]]). The page shows
  `tower.served.version` under its logo, a button that copies it. Tower 3D does nothing with it yet.

**Alternatives considered.**
- The package version or the latest tag as the id: a worker's sandbox or a checkout with uncommitted changes runs new
  code under the same version, and a reload offer must follow the code, not the release.
- The id of the first board a page sees, kept by the page: a page loaded from the old tower whose first board comes from
  the new one would never know.
- Hashing exactly what the tower serves (each module, each renderer file): the served set is lazy and spans the config's
  renderers; the checkout's code is a cheap superset (about 50 ms at start), whose only cost is an offer after a change
  only the server or the host saw.
- Watching the files while the tower runs: renderer files are read live, but the tower's own code changes only on a
  restart, which is the case the user hit; a renderer edited in place is reloaded by whoever edits it.
- Reloading by itself when nothing unsaved is on screen: decided against, since no renderer can tell for certain.

**Impact.** API 1.144: `served` on every board message, `tower.served`, `tower.stale()`, `tower.onStale`,
`closableNoticer` in `/toasts.js`, `RELOAD_ENTRY` and the `reload` pick in `/palette.js`. A renderer or extension the
config roots outside the checkout is not in the id.
