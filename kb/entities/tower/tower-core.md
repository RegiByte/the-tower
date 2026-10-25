---
{
  "type": "system",
  "name": "Tower",
  "summary": "The process started beside the host and terms at the config's port: the renderer API every renderer and worker drives, the modules renderers share, git for the floors' worktrees, and the disposable renderers it serves at /r/<name>/.",
  "in": "tower",
  "reviewed": "2026-10-25",
  "refs": ["hub/src/tower/http.ts#run", "hub/src/renderers.ts#renderersOf", "hub/src/tower/served.ts"]
}
---
The core of the tower beside the [[host]] and [[terms]]: the [[tower-server]] (the renderer API, not disposable), the
[[renderer-shared-modules]] it serves bundled, and [[worktrees]], the git the API's verbs run. It turns the
[[live-system]] into the board and relays requests to the daemons; the probes and policies loops run in the same
process.

The renderers it serves are disposable ([[renderer-is-disposable]]): the tower page ([[web-tower]]), [[tower3d]], and
The Week ([`renderers/week/`](ref:hub/renderers/week/week.js)), a plain page over the same API
([[renderers-in-config]]).
