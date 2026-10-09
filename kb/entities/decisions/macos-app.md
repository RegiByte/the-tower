---
{
  "type": "decision",
  "name": "The tower as a Mac app",
  "summary": "tower app builds apps/macos (Swift, a WKWebView) from the checkout it runs in and opens it: a window of its own over the tower's address that brings the system up with the user's login shell environment. Opt-in: the browser stays the default, and the app holds no capability of its own.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-09",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/app.ts#openApp", "hub/src/cli.ts", "hub/apps/macos/Sources/Start.swift#startTower", "hub/apps/macos/Sources/Start.swift#loginEnvironment", "hub/apps/macos/Sources/App.swift#TowerWebView", "hub/apps/macos/Sources/App.swift#AppDelegate"]
}
---
**Problem.** The tower lives in a browser tab, one among many: no Dock icon or window of its own, and it is gone with
the browser. Keys a browser keeps for itself (⌘W, ⌘T) are one slip from closing it.

**Why.** The user spends the day in the tower, as in an app.

**How.**

- **A thin Swift shell** in `apps/macos/Sources`: one WKWebView on the tower's address. It loads the routes a tab
  loads, at the tower's own origin, so the server's checks on a `POST`'s origin pass unchanged. Whatever a renderer
  does in a tab it does in the window; the app adds only what a browser gives a page and a WKWebView doesn't:
  `alert`/`confirm`/`prompt` as sheets, and links that leave the tower (`_blank`, `window.open`, `tower open`, an
  origin's page) opening in the default browser. Frames inside the page (shelf pages at origins of their own) go where
  the page sends them.
- **Bringing the system up** ([`startTower`](ref:hub/apps/macos/Sources/Start.swift#startTower)): `tower up` with
  `TOWER_CONFIG` set to the config the build serves, then the config's `port`. An app started from the Dock has
  launchd's bare environment, so `tower` runs with the user's login shell environment
  ([`loginEnvironment`](ref:hub/apps/macos/Sources/Start.swift#loginEnvironment)), the one a terminal would give it:
  node on the PATH (nvm, Homebrew) and the locale, which a host it starts passes on to every session. A failure
  shows `tower up`'s and `tower doctor`'s output in the window, with Retry.
- **Keys** ([`TowerWebView`](ref:hub/apps/macos/Sources/App.swift#TowerWebView)): ⌘Q, ⌘W, ⌘H and ⌘M are the app's;
  every other key goes to the page first, so the keymap ([[keymap]]) works as in a tab and a key it doesn't take
  reaches the menus (⌘R reloads, ⌘0/⌘+/⌘− zoom, ⌥⌘I the Web Inspector). The View menu's Renderer lists the renderers
  `GET /renderers` says are built ([[renderers-in-config]]).
- **A window, not a session.** Closing it hides it, so the page keeps its connection and state; quitting leaves the
  tower and every session running, as closing a tab does.
- **`tower app`** ([`openApp`](ref:hub/src/app.ts#openApp)) compiles the sources with `xcrun swiftc` when they are newer
  than the build, writes the checkout and the config into the bundle's `Info.plist` (so the app needs no setting),
  signs it ad hoc for this machine, and opens it. One app per system: the default config's is `Tower.app`, another's is
  named after its system root (`Tower (tower-sandbox).app`), each with a bundle id of its own. All of it under the
  git-ignored `apps/macos/out/`.

**Alternatives considered.**

- *Safari's Add to Dock.* Free and close: a Dock icon, a window, a badge from `navigator.setAppBadge`. Rejected as the
  answer, not as an option: it can't start the system, and the app is where a menu bar item and native notifications
  from `board.waiting` go next.
- *Electron.* Rejected: about 85 MB of Chromium for a page WebKit already draws, and running the tower in its process
  would tie the tower to a window.
- *Tauri.* Rejected: the same WKWebView, behind Rust.
- *Signed and notarized releases.* Deferred: the app is built where it runs, from the checkout.

**Impact.** Nothing changes for a user who doesn't run `tower app`: the browser stays the default, `tower doctor`
doesn't ask for Swift, and the core gains no dependency. The API, the log and the host are untouched. In a WKWebView
`Notification.permission` stays `default` until the app answers WebKit's request for it, so the tower page doesn't
notify there yet.
