---
{
  "type": "decision",
  "name": "The tower as a Mac app",
  "summary": "tower app builds apps/macos (Swift, a WKWebView) from the checkout it runs in and opens it: a window of its own over the tower's address that brings the system up with the user's login shell environment, and who waits on you as a Dock badge, notifications and a menu bar list, read and worded by the shared modules. Opt-in: the browser stays the default, and the app holds no capability of its own.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-10-09",
  "reviewed": "2026-10-09",
  "refs": ["hub/src/app.ts#openApp", "hub/src/app.ts#renderIcon", "hub/apps/macos/icon.svg", "hub/src/cli.ts", "hub/apps/macos/Sources/Start.swift#startTower", "hub/apps/macos/Sources/Start.swift#loginEnvironment", "hub/apps/macos/Sources/App.swift#TowerWebView", "hub/apps/macos/Sources/App.swift#AppDelegate", "hub/apps/macos/Sources/Attention.swift#Attention", "hub/src/shared/cards.ts#heededWaits", "hub/src/shared/cards.ts#transitions"]
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
  origin's page) opening in the default browser, a window opened with no address and given one after (xterm's
  links) too. Frames inside the page (shelf pages at origins of their own) go where
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
- **Who waits on you, outside the window** ([`Attention`](ref:hub/apps/macos/Sources/Attention.swift#Attention)): a
  page of the app's own that never shows, loaded at the tower's origin, reads the board through `/tower.js` and words
  it with `/cards.js` as the tower page does ([[attention-list]]): the waits less those dismissed in any renderer
  ([`heededWaits`](ref:hub/src/shared/cards.ts#heededWaits) over `tower.store`, re-read when another page dismisses
  one), each as `<callsign> · <status>` over `<project>: <gist>`, and the waits that began and ended since the last
  board ([`transitions`](ref:hub/src/shared/cards.ts#transitions)). The native side only draws them: the count on the
  Dock badge and in the menu bar, whose menu lists each wait in the order to go to them; a notification (no sound:
  the page rings its own) and a Dock bounce per wait that begins, unless the user is at that worker's session in the
  window; a notification taken back when its wait ends. A click on either opens the session at `/#<id>`. Words and
  dismissals stay in the shared modules, so the app and every renderer agree. A web view in no window is suspended by
  WebKit, so this one runs with suspension off, and the window's page, once hidden, is throttled as a background tab
  is, not stopped.
- **A window, not a session.** Closing it hides it, so the page keeps its connection and state; quitting leaves the
  tower and every session running, as closing a tab does.
- **`tower app`** ([`openApp`](ref:hub/src/app.ts#openApp)) compiles the sources with `xcrun swiftc` when they are newer
  than the build, writes the checkout and the config into the bundle's `Info.plist` (so the app needs no setting),
  signs it ad hoc for this machine, and opens it. Its icon is `apps/macos/icon.svg`, the tower page's skyline at
  dusk, rendered into the bundle's `AppIcon.icns` with Quick Look, `sips` and `iconutil` when it changed: drawn full
  bleed, since macOS 26 masks an app icon into its own shape and puts one that brings a shape of its own on a plate. One app per system: the default config's is `Tower.app`, another's is
  named after its system root (`Tower (tower-sandbox).app`), each with a bundle id of its own. All of it under the
  git-ignored `apps/macos/out/`.

**Alternatives considered.**

- *Safari's Add to Dock.* Free and close: a Dock icon, a window, a badge from `navigator.setAppBadge`. Rejected as the
  answer, not as an option: it can't start the system or keep a menu bar item.
- *The waits read natively, from `/board` in Swift.* Rejected: the words (`statusName`, `gistLine`) and the dismissals
  would be written twice, and drift from the tower page's.
- *The page's own `Notification`s, granted through WebKit's private delegate.* Rejected: private API, and only the
  page that is open would notify; the badge and the menu bar need the board apart from it anyway.
- *Electron.* Rejected: about 85 MB of Chromium for a page WebKit already draws, and running the tower in its process
  would tie the tower to a window.
- *Tauri.* Rejected: the same WKWebView, behind Rust.
- *Signed and notarized releases.* Deferred: the app is built where it runs, from the checkout.

**Impact.** Nothing changes for a user who doesn't run `tower app`: the browser stays the default, `tower doctor`
doesn't ask for Swift, and the core gains no dependency. The API, the log and the host are untouched. In the window
`Notification.permission` stays `default`, so the tower page's own notifications stay off there and the app's are the
only ones; it asks macOS to notify on first launch. On macOS 26 a crowded menu bar can hide the item behind the
notch.
