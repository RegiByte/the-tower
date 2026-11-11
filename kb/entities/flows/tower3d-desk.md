---
{
  "type": "flow",
  "name": "Sitting at a desk in Tower 3D",
  "summary": "In Tower 3D you aim at a worker's desk and press E: the desk panel opens as a modal over the world, the session's real terminal opens on its terminal stream and claims the PTY size unless another terminal is open on the session, and every key you type reaches the host in order.",
  "in": "tower-core",
  "reviewed": "2026-11-11",
  "involves": ["operator", "tower3d", "tower-server", "host-daemon", "claude-code", "system-root"],
  "refs": ["hub/renderers/tower3d/src/acts.ts#offersOf", "hub/renderers/tower3d/src/desk.ts#makeSeat", "hub/renderers/tower3d/src/main.ts#onKey", "hub/renderers/tower3d/src/main.ts#RUN", "hub/renderers/tower3d/src/main.ts#goDesk", "hub/renderers/tower3d/src/main.ts#focusDesk", "hub/renderers/tower3d/src/term.ts#mountTerm", "hub/src/shared/term-view.ts#termHandlers", "hub/src/shared/term-view.ts#mountTermView", "hub/src/shared/termkeys.ts#terminalKeymap", "hub/src/tower/tower.js#keySender", "hub/src/tower/tower.js#keyWrites", "hub/src/tower/tower.js#relay", "hub/src/tower/http.ts#muxWatch", "hub/src/tower/http.ts#screenStream", "hub/src/tower/http.ts#terminalStream", "hub/src/tower/http.ts#command", "hub/renderers/tower3d/src/hosting.ts#deskViews", "hub/renderers/tower3d/src/main.ts#openChanges", "hub/renderers/tower3d/src/main.ts#mountDeskScreen", "hub/renderers/tower3d/src/main.ts#replay", "hub/renderers/tower3d/src/input.ts#listen", "hub/src/machine.ts#hostRequest", "hub/src/host/main.ts#handle", "hub/renderers/tower3d/src/ui.ts#deskHeadHtml", "hub/renderers/tower3d/src/desk-verbs.ts#deskVerbs", "hub/renderers/tower3d/src/main.ts#layoutNow", "hub/renderers/tower3d/src/main.ts#sawDesk", "hub/renderers/tower3d/renderer.json"]
}
---
```mermaid
sequenceDiagram
  participant O as [[operator]]
  participant D as [[tower3d]]
  participant T as [[tower-server]]
  participant H as [[host-daemon]]
  participant R as [[system-root]]
  participant C as [[claude-code]]
  O->>D: walk, aim at a desk
  D->>D: offersOf(desk): sit on E (card can drive)
  O->>D: E
  D->>D: goDesk: travel to its floor, focusDesk: open the desk modal
  D->>T: mux/watch terminal/<id> (via /tower.js)
  T->>R: read sessions/<id>.jsonl
  T-->>D: snapshot {data, cols, rows, exited, terminals}
  D->>T: resize {id, cols, rows} (claim, when terminals is 0)
  T->>H: resize
  H->>R: r event
  H->>C: PTY resize
  loop typing
    O->>D: keys
    D->>T: keys {id, data}, one request at a time
    T->>H: write
    H->>R: i event
    H->>C: PTY write
    C->>H: output
    H->>R: o event
    R-->>T: tailed line
    T-->>D: {key, data: o} on /mux
  end
  O->>D: ✕ or a click on the world
  D->>T: mux/unwatch
```

- **Aim, then E.** What sits under the crosshair offers its verbs on every frame
  ([`offersOf`](ref:hub/renderers/tower3d/src/acts.ts#offersOf)); a desk's `use` is "sit" while its card is live
  ([[verb-prompts]]). E runs it through the act table ([`RUN`](ref:hub/renderers/tower3d/src/main.ts#RUN)):
  [`goDesk`](ref:hub/renderers/tower3d/src/main.ts#goDesk) travels to the desk's floor if needed, and
  [`focusDesk`](ref:hub/renderers/tower3d/src/main.ts#focusDesk) opens the desk panel, a modal over the dimmed
  world. While it is open the scene isn't drawn: the canvas keeps its last frame and updates go on. A video-wall
  tile opens the same panel where you stand. A worker gathered with its crew sits at a meeting table instead
  ([[whereabouts]]); aiming at it, or at its empty desk, opens the same panel.
- **The transport depends on where Tower 3D runs.** At `/r/tower3d/` `/tower.js` calls the routes and opens one
  `/mux` stream; framed from a shelf in the tower page, it posts to the page, which makes the same requests through
  its [`relay`](ref:hub/src/tower/tower.js#relay). The server parses each command by its schema
  ([`command`](ref:hub/src/tower/http.ts#command)) and relays it to the host over `control.sock`
  ([`hostRequest`](ref:hub/src/machine.ts#hostRequest)) ([[renderer-api]]).
- **Snapshot, then tail.** The screen stream sends the screen rebuilt from the log, then each `o`, `r` and `x` the
  host appends ([`screenStream`](ref:hub/src/tower/http.ts#screenStream)). A session that is no longer running
  sends only its snapshot: the terminal opens read-only, claims nothing and sends no keys.
- **Claimed on open, when it is the only terminal.** One PTY, one size: the terminal the user acted on last owns it. The desk opens the
  `terminal/<id>` stream, whose snapshot says how many other terminals are open on the session
  ([`terminalStream`](ref:hub/src/tower/http.ts#terminalStream); a monitor's `screen/<id>` stream is not one).
  With none, [`mountTerm`](ref:hub/renderers/tower3d/src/term.ts#mountTerm) fits the terminal to the modal at the
  viewer's font (`tower.prefs`) and sends `resize` as soon as the snapshot arrives, so typing works at once. Beside
  another it reads "watching" at a font that fits, so opening never reflows the session under whoever is working.
  A key or a pointer press in the terminal, a paste or a drop on it, or text given it with no key claims, before
  what caused it reaches the PTY; the pointer passing over it, xterm's answers to Claude's queries, focus and a
  reconnect don't. A watching view sends a wheel and a focus report without claiming. A resize from another viewer hands the size back. A shell's stream says nothing of
  other terminals, so a shell claims on open. The rule is the shared machine every renderer's terminal runs
  ([`termHandlers`](ref:hub/src/shared/term-view.ts#termHandlers), in xterm by
  [`mountTermView`](ref:hub/src/shared/term-view.ts#mountTermView), [[renderer-shared-modules]], [[machines]]).
- **Keys in order.** [`keySender`](ref:hub/src/tower/tower.js#keySender) sends one `keys` request at a time, the next
  only after the last answered; the keys typed meanwhile go as [`keyWrites`](ref:hub/src/tower/tower.js#keyWrites) of
  them, a terminal's keys in a row joined into one write, so a page slow to hear answers types in fewer writes, not
  later. A key holding Enter, an escape or Ctrl+C is a write of its own: Claude reads text and Enter in one write as a paste,
  and the composer's fold reads Ctrl+C as emptying it only as a write by itself ([[submit-at-prompt]]). The Mac
  editing keys are sent as readline keys by [`terminalKeymap`](ref:hub/src/shared/termkeys.ts#terminalKeymap)
  ([[renderer-shared-modules]]) at the chords `board.keys` binds ([[keymap]]). The host logs `i` before writing to
  the PTY ([`handle`](ref:hub/src/host/main.ts#handle)).
- **The panel's head.** Beside the worker's callsign and status, what extensions add to its card
  ([`deskHeadHtml`](ref:hub/renderers/tower3d/src/ui.ts#deskHeadHtml)): its exemptions, then the badges most severe
  first, the lines and the actions its region holds, verbs alone as its `renderer.json` says (never a client command:
  [`deskVerbs`](ref:hub/renderers/tower3d/src/desk-verbs.ts#deskVerbs)),
  ranked by the shared code over Tower 3D's own layout of `card.desk`
  ([`layoutNow`](ref:hub/renderers/tower3d/src/main.ts#layoutNow): its `renderer.json`'s, the config's less a region whose entry fails its
  check, then the viewer's `layout.tower3d`), pins first and the hidden left out ([[region-overflow]]). The region draws everything
  (`wrap`, the one form [its `renderer.json`](ref:hub/renderers/tower3d/renderer.json) declares). A verb new to the
  viewer carries a dot and counts as seen once drawn in a focused window, the dot staying until the panel closes
  ([`sawDesk`](ref:hub/renderers/tower3d/src/main.ts#sawDesk)), in the seen set every renderer of theirs writes. A
  destructive verb asks first in the library's dialog with its words ([[press-feedback]]). A config layout change reaches the desk on reload; the viewer's, on the next board.
- **The panel's tabs.** Logbook ([[logbook]]: a past session picked there replaces the terminal with its last
  screen, [`replay`](ref:hub/renderers/tower3d/src/main.ts#replay) and
  [`mountDeskScreen`](ref:hub/renderers/tower3d/src/main.ts#mountDeskScreen), until live is chosen again or Esc),
  Changes (the page's `tower/changes` view, mounted at the desk through the library's view host, with the reviews
  extension's note box in its `lines.acts`: [`deskViews`](ref:hub/renderers/tower3d/src/hosting.ts#deskViews),
  [`openChanges`](ref:hub/renderers/tower3d/src/main.ts#openChanges), [[ui-model]]), Reviews (the reviews extension's
  `reviews/thread` view, mounted the same way, [`openReviews`](ref:hub/renderers/tower3d/src/main.ts#openReviews)) and
  each thing the worker showed lie over the terminal, which keeps its size. Changes and Reviews are each hidden and
  kept while another tab shows, their reads stopped, and closed with the desk; each tab is tallied by its view's `tab`.
  A note's lines, which the thread hands Tower 3D to display, open in the desk's Changes
  ([`display`](ref:hub/renderers/tower3d/src/main.ts#display)): at the open desk, or, from the reader, at the desk of the
  worker whose lines they are, gone to; a subject Tower 3D has no place for is said in a toast. A terminal that ends while its tab
  shows gives way to the Logbook, as the page's gives way to the Brief, and the Terminal tab then shows its last screen
  ([`terminalEnded`](ref:hub/renderers/tower3d/src/main.ts#terminalEnded)). While a text box has focus, keys
  type into it and never move you.
- **Leaving.** Esc in the terminal belongs to Claude; ✕, a click on the dimmed world, or Esc outside the terminal
  ([`onKey`](ref:hub/renderers/tower3d/src/main.ts#onKey)) closes the panel. Closing unwatches the stream, and the
  session keeps running.
