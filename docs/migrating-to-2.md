# Migrating to 2.0

2.0 removes what 1.x kept for compatibility: old shapes, old names and old ways in, each of which had a replacement
in 1.x. It adds nothing to the API. This guide lists every change that can break something of yours, by who it
reaches, each with what to do instead.

It is written so that Claude can apply it. Point a Claude session at this file and at your extension, renderer, fork
or config, and ask it to bring them to 2.0: each entry says what to find and what to change it to, and the tower's
own checks (`tower extensions check <dir>`, `tower config check`, `tower doctor`) say whether it worked.

- **You run a tower:** read [Everyone who runs a tower](#everyone-who-runs-a-tower). Its first list is the order to
  do things in.
- **You wrote an extension, a renderer, a shelf page or a theme:** read that section too, then
  [Extension and renderer authors](#extension-and-renderer-authors). [Every name, 1.x to 2.0](#every-name-1x-to-20)
  says where each name you import went.
- **You keep a fork:** read [Forks](#forks) as well.

## Everyone who runs a tower

Do these in order when you update:

1. **Restart the host.** A 2.0 tower starts sessions and logs facts only on a host at host protocol 5, which arrived
   in 1.x. While an older host runs, a spawn, a hire, a resume or a logged fact is refused with `unavailable`, naming
   the fix. Run `tower down host`, then `tower up`. That stops the running sessions; each one stays resumable.
2. **Rewrite your config.** Every 1.x config is refused until `argv` and the plugins and commands move under
   `runtimes`, on the board and by `tower config check`. See [Config](#config); `tower config check` passing is the
   sign the rewrite is complete.
3. **Bump your own extensions.** An extension that requires a 1.x tower is refused as `too-old` until it says
   `"requires": { "tower": "2.0" }` and makes the changes in
   [Extension and renderer authors](#extension-and-renderer-authors).
4. **Rebuild Tower.app,** if you use it: run `tower app` from the 2.0 checkout. See [Tower.app](#towerapp).
5. **Replace the old CLI words** in your scripts, prompts, skills and guidance. See [The CLI](#the-cli).

### Config

- **`argv`, `plugins` and a project's `plugins` and `command` moved under `runtimes`.** What serves a runtime's own
  harness is keyed by the runtime, `runtimes.<id>`, the same at the top level and in each project; the tower runs one
  runtime, `claude`. `env` stays at the top level. A config holding any moved key at its old place is refused: the
  board says so, naming the first, and `tower config check` fails each one at its old path, naming the new one, such
  as `argv moved to runtimes.claude.argv in 2.0`. Move each value unchanged, then remove the old key:

  | 1.x | 2.0 |
  | --- | --- |
  | `argv` | `runtimes.claude.argv` (still required) |
  | `plugins` | `runtimes.claude.plugins` |
  | `projects.<id>.plugins` | `projects.<id>.runtimes.claude.plugins` |
  | `projects.<id>.command` | `projects.<id>.runtimes.claude.command` |

  A 1.x config:

  ```json
  {
    "argv": { "claude": ["claude"], "mom": ["claude-mom"] },
    "env": { "EXAMPLE": "1" },
    "plugins": ["/abs/path/to/my-workflow"],
    "projects": {
      "my-app": {
        "name": "my-app",
        "hub": "/abs/path/to/my-app",
        "repos": [],
        "plugins": ["/abs/path/to/app-plugin"],
        "command": "mom"
      }
    }
  }
  ```

  The same config in 2.0:

  ```json
  {
    "runtimes": {
      "claude": {
        "argv": { "claude": ["claude"], "mom": ["claude-mom"] },
        "plugins": ["/abs/path/to/my-workflow"]
      }
    },
    "env": { "EXAMPLE": "1" },
    "projects": {
      "my-app": {
        "name": "my-app",
        "hub": "/abs/path/to/my-app",
        "repos": [],
        "runtimes": { "claude": { "plugins": ["/abs/path/to/app-plugin"], "command": "mom" } }
      }
    }
  }
  ```

  A plain `"argv": ["claude"]` becomes `"runtimes": { "claude": { "argv": ["claude"] } }`. A key under `runtimes` that
  names no runtime the tower knows is a failure in `tower config check`.
- **`probes` is refused.** `"probes": { "quota": { "off": …, "every": … } }`, the quota probe's spelling before 1.90,
  was read as the quota extension's until 2.0. A config that still has it is refused: the board says so, and
  `tower config check` fails it at `probes`, naming the line to write, such as
  `"extensions": { "quota": {"off":true,"settings":{"every":"1h"}} }`. Move `off` to `extensions.quota.off` and
  `every` to `extensions.quota.settings.every`, then remove `probes`.
- **`keys.pane-reviews` is refused.** The config is not taken, and `tower config check` names the line to write:
  `"reviews/thread": <its value>` under `keys`, the chord of the reviews extension's thread view.
- **A layout naming `tower/shown` no longer means the views that draw showings.** The view was retired at 1.115;
  1.x read it in a layout's `order` as leaving showings to their type's pick and in `hidden` as hiding each view
  that draws them. 2.0 reads it as any other id no view has: nothing. Remove it from `order`, and in `hidden` name
  the views by type you meant (`tower/document`, `tower/link`, `tower/text` and their kin, listed in
  [Views](extending.md#views)).

### The CLI

- **The seven old words that named bundled extensions are gone.** Each exits 1, runs nothing, and names its form
  under `tower x`, read from the running extensions: while the extension that owns a word is off, the word gets the
  plain `Unknown command`, and its `tower x` form doesn't run either. This table is the reference. Replace them in
  scripts, prompts, skills and guidance:

  | 1.x | 2.0 |
  | --- | --- |
  | `tower policies` | `tower x policies list` |
  | `tower policies run <id>` | `tower x policies run-now <id>` |
  | `tower policies approve <id>` | `tower x policies approve-now <id>` |
  | `tower runs …` | `tower x policies runs …` |
  | `tower probes` | `tower x quota probes` |
  | `tower probes run quota` | `tower x quota read-now` |
  | `tower note [on <checkout>] [re n<k>] [<anchor> …]` | `tower x reviews note [--on <checkout>] [--re <k>] [--at <anchor> …]` |
  | `tower note resolve n<k> … [on <checkout>]` | `tower x reviews resolve <k> … [--on <checkout>]` |
  | `tower thread [<checkout>]` | `tower x reviews thread [<checkout>]` |
  | `tower send <CALLSIGN>` | `tower x reviews send <CALLSIGN>` |
  | `tower review <CALLSIGN> [tell]` | `tower x reviews review <CALLSIGN> [--tell]` |

- **`tower x` takes no JSON argument.** `tower x <capability> <word> '<json>'` exits 1, runs nothing, and names the
  typed line to write instead: one flag per field, a list as its flag repeated, text on stdin where the word takes
  it. `tower x <capability> <word> --help` lists a word's flags. A structured field still takes JSON as its flag's
  value.
- **The CLI says a reviewer by its crew.** `tower agents` and `tower agent` no longer print `reviews <CALLSIGN>`; a
  reviewer's line reads `in <CALLSIGN>'s crew, by reviews`. Change scripts that grep the old words.

### Links and bookmarks

- **Old links to a floor's page open the skyline.** The tower page's hashes before 1.104, `#shelf/<p>/<n>`,
  `#draft/<p>[/<id>]`, `#archive/<p>`, `#policies/<p>` and `#kept/<p>/<c>[/<id>]`, are no longer read: a bookmark
  or a link in a note that uses one opens the default view. Open the page again and copy its address, which is the
  current form, `#v/<view>/<subject>`. A worker's link, `#<id>` with or without its tab, still opens the worker.
- **The page's `#<id>/reviews` link opens the worker's card,** without its thread tab: write
  `#v/tower/card/card%3A<id>;reviews/thread`.

### Review threads

- **A reviewer is only what its facts say.** A worker spawned before 1.95 on the prompt `/tower:review <CALLSIGN>`,
  which logged no reviewer facts, no longer reads as that callsign's reviewer: it has no `x.reviews.of`, sits in no
  crew by reviews, is not exempt from hiring, and its thread is its own checkout's. Its notes stay on the thread it
  wrote them on.

### Tower.app

- **Rebuild it once for 2.0:** run `tower app` from the 2.0 checkout. The app's window, Dock badge, menu-bar list and
  notifications come from the tower; the build is what reads them. A build from release 1.98 or later reads them
  through the library and keeps working, but only a rebuild carries what the app gained since: ⌘F finds text in the
  page, and Tower 3D's mouse-look follows the mouse under pointer lock.
- **A build from before release 1.98 loses its badge.** Its attention page imported `/cards.js`, which 2.0 no longer
  serves, so it shows no badge, menu-bar list or notifications until it is rebuilt.

## Extension and renderer authors

### The version and the manifest

- **`requires.tower` is `"2.0"`.** A manifest that requires a 1.x tower is refused as `too-old` before any other key
  is read, and the tower says so on the board and in `tower extensions check`. Set `"requires": { "tower": "2.0" }`,
  then make the changes the rest of this section lists. Every name in the library now says it arrived in 2.0.
- **`API_VERSION` is `2.0`.** `tower.version` reads `2.0`. A page that loads `/tower.js?v=1.<n>` is refused, since a
  pin names the major it was written against: load `/tower.js?v=2.0` once the page meets the rest of this section.
- **A manifest's `plugins` moved under `runtimes`.** `"plugins": { "claude": "<folder>" }` is refused, naming the new
  key, and the extension does not start, so its sessions would load no plugin anyway. Write the same folder under
  `runtimes`:

  ```jsonc
  // 1.x
  "plugins": { "claude": "plugin" }
  // 2.0
  "runtimes": { "claude": { "plugins": "plugin" } }
  ```

### Imports: the library only

- **The 28 modules at the root are gone; the library replaces them.** Before the library (API 1.151) the tower served
  its helpers as modules at the root, `/cards.js` and its siblings. 1.x kept serving them with a `Deprecation` header;
  2.0 answers each with `not_found`. Find every import of one, in a renderer, a shelf page or an extension's client,
  and import the same names from the library module beside it:

  | 1.x | 2.0 |
  | --- | --- |
  | `/cards.js` | `/lib/cards.js`, `/lib/board.js`, `/lib/layout.js`, `/lib/words.js`, `/lib/spawn.js` |
  | `/views.js` | `/lib/layout.js`, and `/lib/view.js` for a view's types |
  | `/panels.js` | `/lib/changes.js`, `/lib/stats.js`, `/lib/view.js`; the Reviews and Policies panels are their extensions' views |
  | `/items.js`, `/icons.js`, `/press.js` | `/lib/view.js` |
  | `/brief.js` | `/lib/brief.js` |
  | `/keymap.js` | `/lib/keys.js` |
  | `/terminal.js`, `/term-view.js` | `/lib/terminal.js` |
  | `/prefs.js`, `/viewer.js` | `/lib/viewer.js` |
  | `/settings.js` | `/lib/settings.js` |
  | `/tips.js`, `/toasts.js` | `/lib/chrome.js` |
  | `/capabilities.js` | `/lib/capabilities.js` |
  | `/verb-words.js` | `/lib/cards.js` |
  | `/palette.js` | `/lib/palette.js` |
  | `/markdown.js` | `/lib/markdown.js` |
  | `/slots.js` | `/lib/time.js` |
  | `/loop.js`, `/reads.js` | `/lib/machine.js` |
  | `/spawn.js` | `/lib/spawn.js` |
  | `/attend.js` | `/lib/attend.js` |
  | `/media.js`, `/repos.js` | `/lib/files.js` |
  | `/design.js` | `/lib/design.js` |
  | `/termkeys.js` | nothing: `mountTermView` of `/lib/terminal.js` takes your keymap |
  | `/drafts.js`, `/policies.js`, `/reviews.js` | their extensions' clients, `/x/drafts/drafts.js`, `/x/policies/policies.js` and `/x/reviews/reviews.js`, not served at the old URLs |

  The library was chosen name by name, so it holds fewer names than these modules served. A name you import that no
  library module exports is in [Every name, 1.x to 2.0](#every-name-1x-to-20): renamed, moved to an extension's
  client, or gone, to copy from the `v1` branch into your own code. `GET /schema` and `tower types <dir>` list what
  the library holds.
- **The library dropped the names nothing imported.** 2.0's library keeps a name when something in the tower imports
  it, when an author needs it to declare a function the library calls or to call one it gives, or when every view
  or extension author handles its value in their own code. Seven values and four types went: `floorLimits`,
  `keptWholes`, `joinedWholes`, `nextWait`, `chordsOf`, `commandUrl`, `safeHref`; `Fill`, `Fills`, `Lent`, spelled
  through `HostDeps`, which holds them; and `RouteInput`, whose verb inputs are `Verbs`. Each is a row in
  [Every name, 1.x to 2.0](#every-name-1x-to-20).
- **Server code imports the library, not `tower:`.** An extension's server module that imports
  `tower:<name>.js` fails to load: node is told the tower doesn't lend it, and the error lists the library's
  modules. Import `/lib/<module>.js` instead, the same line a client writes, by the table above.

### The board

- **`actions` is the one way to act on a subject.** Every card, conversation, leftover process (`card.resources[]`),
  floor, worktree and kept branch carried what it offers three times: `actions`, a list of `{ verb, call? }`, and
  the same split in two, `verbs` (the verbs in order) and `calls` (each call by verb). 2.0 drops `verbs` and `calls`
  from all six. The bundled extensions' own subjects drop them too: a review thread (`floor.x.reviews.threads[]`)
  loses `verbs` and `calls`, a policy and an open offer (`floor.x.policies.policies[]`, `.offers[]`) lose `calls`.
  Read `actions`, or `can` and `callOf` of `/lib/board.js`, which read it:

  ```js
  // 1.x
  if (card.verbs.includes('resume')) tower.run(card.calls.resume)
  const tidy = floor.calls.tidy
  const note = thread.calls.note
  const accept = offer.calls.accept

  // 2.0
  import { can, callOf } from '/lib/board.js'
  if (can(card, 'resume')) tower.run(callOf(card, 'resume'))
  const tidy = callOf(floor, 'tidy')
  const note = callOf(thread, 'note')
  const accept = callOf(offer, 'accept')
  // without the library: card.actions.find((a) => a.verb === 'resume')?.call
  ```

  The verbs keep their order in `actions`, the first still the subject's primary verb. A verb with no call (`drive`,
  `brief`, `goto`) is an action with no `call`.
- **The board's Claude-named fields are per runtime.** Every card says the runtime it runs, `card.runtime`, a string
  (`'claude'` for every session today, and for a log from before runtimes were logged). The board's
  `runtimes[<id>]` describes each runtime the tower knows. Draw a runtime from its entry, by the card's id, never by
  comparing the id to a literal:

  | 1.x | 2.0 |
  | --- | --- |
  | `card.claude` | `card.runtimeRelease` |
  | `card.claudeUntested` | `card.runtimeUntested` |
  | `board.claudeDefaults` | `board.runtimes.claude.defaults` (`board.runtimes[card.runtime].defaults`) |
  | `board.claudeUntested` | `board.runtimes.claude.untested` |
  | `board.commands` | `board.runtimes.claude.commands` |
  | `floor.command` | `floor.runtimes.claude.command` |
  | `floor.plugins` | gone: the raw project config is not on the board. Read `projects.<id>.runtimes.claude.plugins` from `GET /config` |
  | the words "claude" or "Claude Code" | `board.runtimes[card.runtime].label` |
  | the tested range in `CLAUDE_UNTESTED` | `board.runtimes[id].tested`, `{ lowest, highest }` |

  A board entry is `{ label, defaults, untested, tested, commands? }`; a floor's is `{ command? }`. The library names
  no type for them: write `Board['runtimes'][string]`, `Board['runtimes'][string]['defaults']` and
  `Floor['runtimes'][string]`, `Board` and `Floor` being types of `/lib/board.js`.
- **`board.limits` is the one shape for rate limits.** The top-level copies of the default command's limits are gone:
  `board.rateLimits`, `rateLimitsAt`, `rateLimitsFrom`, `turnLimits` and `extraUsage`. Read the same fields from
  `defaultLimits(board)` of `/lib/board.js`, or from a command's entry with `limitsOf(board, command)`. The limit
  words of `/lib/cards.js` (`extraUsageLine`, `extraUsageAmounts`, `limitsFromTitle`) take an entry of
  `board.limits`, no longer the board.
- **Quota readings written before 1.90 no longer set the limits.** The core folded the `p` facts the old core probe
  wrote into `probe.quota/` beside the readings of kind `tower/rate-limits`; it now folds only the latter. The quota
  extension still reads `p` facts for its own status. A reading of your own extension's is folded as before, as long
  as its fact code declares `"kind": "tower/rate-limits"`.
- **Four card fields nobody read are gone.** No renderer, `/lib/` module or extension in the checkout read them;
  a renderer of yours that did reads what the tower still derives:

  | 1.x | 2.0 |
  | --- | --- |
  | `card.pages`, the html files the worker wrote | `card.shown`, what it showed; a file it wrote and didn't show is its own to name |
  | `card.sent`, the messages it sent other sessions | the message steps of its turns in the Brief, `GET /conversations/<id>`, each naming its recipient |
  | `card.cols`, `card.rows` | the screen's own size, on each frame of `/screen/<id>` |
- **`card.seat` and `floor.gallery` are gone.** They were Tower 3D's seating and gallery, derived in the bridge
  until Tower 3D derived both itself. A renderer of yours that seats workers or hangs showings derives them the same
  way, over the board's cards and the floor's archive (`GET /archive/<project>`): `seatsOf` and `buildingSeats` in
  `renderers/tower3d/src/seating.ts`, `galleryOf` in `renderers/tower3d/src/showings.ts`, each short enough to copy.
  The type `GalleryShowing` is no longer in `/lib/board.js`: it is `{ worker: SessionRef; shown: CardShown }`.
- **An own kind's contributions are only at its key by the subject it was found in.** Since 1.98 an entry of an
  extension's own subject kind is keyed `<cap>.<kind>:<instance>/<key>`, and `board.adds` copied its contributions to
  the key before 1.98, `<cap>.<kind>:<key>`. 2.0 drops the copy: read `board.adds` at the subject's `key`
  (`subjectAt`, or the `key` of the subject your view or command is handed).

### What the bundled extensions own

The core kept copies of what moved into the bundled extensions in 1.x; 2.0 drops them. While an extension is off,
nothing of it is on the board or answers, as in 1.x. A removed route answers `not_found`; a removed board field is
absent.

- **Policies** have been the bundled policies extension since 1.91. Find each old name and change it to the
  extension's:

  | 1.x | 2.0 |
  | --- | --- |
  | `floor.policies` | `floor.x.policies.policies`, or `floorPolicies(floor).policies` of `/x/policies/policies.js`. Its calls name `policies/run` and `policies/approve` |
  | `board.offers` | each floor's `x.policies.offers` (`floorPolicies(floor).offers`), whose `accept` calls `policies/run`. An offer is also an ask in `board.asks` (`cap: 'policies'`, `sound: 'offer'`): draw that one to put offers among the waits |
  | `card.run` | `card.x.policies.run` |
  | `POST /policy/run`, `/policy/pass`, `/policy/approve` | `POST /policies/run`, `/policies/pass`, `/policies/approve`, the same input and reply. The old routes answer `not_found` |
  | `GET /runs/<project>?policy&limit` | `GET /policies/runs/<project>?policy&limit`, the same query and reply |
  | `/policies.js` | `/x/policies/policies.js` (404 at the old URL) |
  | `policiesHtml`, `policyZone`, `offerWords`, `policyDoneLine` of `/panels.js` | the extension's view `policies/policies`, mounted on a floor; its client is `/x/policies/panel.js` |
  | `heededOffers`, `offerTransitions`, `isOffer` of `/cards.js`, and `isOffer` of `/lib/cards.js` | `heededAsks`, `askTransitions` and `isAsk` of `/lib/cards.js`, over the offers' asks. `Attended` is a wait or an ask |
  | `offersBeganLine` of `/cards.js` | gone, as is `asksBeganLine`: copy it from `v1` |

  Workers and scripts use `tower x policies …` (see [The CLI](#the-cli)). The facts stay where they were: the runs
  and approvals of each project are still read from `streams/projects/<project>/runs/` and `approvals/`.
- **The quota probe and drafts** answer only under their extensions' names. Each old name had its replacement since
  1.90:

  | 1.x | 2.0 |
  | --- | --- |
  | `POST /probe/run` `{ "name": "quota" }`, `ctx.call('probe/run', …)` | `POST /quota/read-now` `{}`, or `{ "command": "<name>" }` for one command |
  | `GET /probe/<name>?last=<n>`, `tower.probe(name, { last })` | `GET /quota/reads?last=<n>`, `tower.get('quota/reads?last=<n>')` |
  | `board.probes` | `board.x.quota`, and `quotaOf`, `probeLine` and `probeTitle` of `/x/quota/quota.js` |
  | `quotaOf`, `PROBE_STATE_NAME`, `PROBE_ATTENTION`, `probeLine`, `probeTitle`, `probedLine` of `/cards.js` | the same names of `/x/quota/quota.js` |
  | the module `/drafts.js` | `/x/drafts/drafts.js` |
- **Review threads** have been the bundled reviews extension since 1.93. A tower with reviews on draws and writes
  threads as before. Find each old name and change it to the extension's:

  | 1.x | 2.0 |
  | --- | --- |
  | `card.reviews` | `card.x.reviews.of`, or `reviewerOf` of `/x/reviews/reviews.js` |
  | `card.threadState` | `card.x.reviews.threadState` |
  | `card.unseen` | `card.x.reviews.unseen` |
  | `card.checkoutState.filed` | `card.x.reviews.filed` (`card.checkoutState` says only where the checkout's work stands) |
  | `card.verbs`, `calls` and `actions` offering `note` | `card.x.reviews.note`, a call to `reviews/append` |
  | `card.verbs`, `calls` and `actions` offering `review` | the action `reviews/hire` in `board.adds['card:<id>']` |
  | `floor.threads` | `floor.x.reviews.threads` |
  | `floor.tidy.threads`, and `plan.threads` in a `tidy` call | `board.adds['floor:<project>'].tidy` entries with `cap: 'reviews'`, applied as `plan.x.reviews` |
  | the `tidy` reply's `threads` | its `x.reviews.done` |
  | the `worktree/discard` reply's `thread` | its `done.reviews.item` |
  | the verb `review/append` | `reviews/append` (`tower x reviews note`) |
  | the read `GET /reviews/<project>` | `GET /reviews/history/<project>` |
  | the module `/reviews.js` | `/x/reviews/reviews.js` |
  | `reviewerOf`, `threadCheckoutOf`, `pairLine` and `whereLine` of `/cards.js` | `reviewerOf` and `threadCheckoutOf` of `/x/reviews/reviews.js`; `pairLineOf` and `whereLineOf` of `/lib/cards.js` |
  | the reviews panel and anchors of `/panels.js` (`reviewsHtml`, `cardThread`, `readThread`, `pickAnchor`, `changesHtml` and their kin) | the extension's views `reviews/thread`, `reviews/checkout-thread` and `reviews/composer` |
  | `REVIEW_SKILL`, `reviewPrompt` and `reviewedIn` of `/x/reviews/reviews.js` | hire with `reviews/hire`; read a reviewer by `x.reviews.of` |
  | the mod's `tower:review` skill | `reviews:review`, which `reviews/hire` starts |
  | the keymap command `pane-reviews` | the view `reviews/thread`'s chord (see [Config](#config)) |

### Calls, words and styles

- **A client command is called without `subject`.** Its export was called with `{ tower, board, subject, target,
  args, kit }`, `subject` being the subject's value; 2.0 calls it with `{ tower, board, target, args, kit }`. Read the
  value from `target.value`:

  ```js
  // 1.x
  export async function set({ tower, subject }) { await tower.call('tabline/facts/line', { session: subject.id, … }) }
  // 2.0
  export async function set({ tower, target }) { await tower.call('tabline/facts/line', { session: target.value.id, … }) }
  ```
- **The library's Claude-named words are neutral.** Find each and change it:

  | 1.x | 2.0 |
  | --- | --- |
  | `claudeUntestedHtml(board)`, `claudeUntestedLine(board)` | `untestedHtml(board)`: one span per runtime with untested releases, `"Claude Code 2.1.330 untested"` |
  | `claudeFlagHtml(card)` | `untestedFlagHtml(card, board)` |
  | `detailsOf(card)` | `detailsOf(card, board.runtimes)`: the runtime's row is labelled by its `label` |
  | `TermViewIo.claude` (`mountTermView`'s `io`) | `wheelReports`: true for a session's terminal, false for a shell's |
  | `briefHtml({ briefs, … })` | `briefHtml({ briefs, agent, … })`, `agent` being `board.runtimes[card.runtime].label`, which signs the answers |
  | `saidWhat(briefs, key)` | `saidWhat(briefs, key, agent)`: a step's words are named by the runtime's label, `"Claude Code's words"` |

  `CLAUDE_UNTESTED`, `spawnFormHtml`, `spawnSummaryHtml` and `saidOf` were served only by the root modules and are
  not in the library: copy them from `v1`.
- **The Brief's answers are `.bubble.agent`.** The class `.bubble.claude` on an answer is `.bubble.agent`. A user theme
  or a renderer's stylesheet that targets `.brief-view .bubble.claude` targets `.brief-view .bubble.agent` instead.
- **`tower.schemeChoice()` and `tower.chooseScheme(c)` are gone.** The colour scheme is one field of the viewer's
  appearance: read it with `tower.prefs.get().scheme` and set it with `tower.prefs.set({ scheme })`. A shelf page
  that posts its own `{ t: 'tower', verb: 'scheme', scheme }` to the page framing it posts
  `{ t: 'tower', verb: 'prefs', prefs: { scheme } }` instead; the old verb is ignored. A framed page that ran its own
  relay and listened for `{ t: 'scheme' }` listens for `{ t: 'prefs', prefs }`: only a `url` entry's frame still gets
  the scheme alone.
- **`shortHashOf` is gone from `/lib/layout.js`.** It wrote the floor hashes 2.0 no longer reads (see
  [Links and bookmarks](#links-and-bookmarks)). Write `hashOf(location)`, the grammar, for every location;
  `locationOf` still reads a worker's `#<id>` and `#<id>/<tab>`.

### Every name, 1.x to 2.0

Every name 1.x served, at the root or in the library, that 2.0's library doesn't export under the same name. A name
not here is in the library: find its module with `GET /schema` or `tower types <dir>`. The tables are generated from
the two releases' export lists (`test/served-exports.json` at `v1.114.1` and now).

Renamed, or reached another way:

| 1.x name | Served by | 2.0 |
| --- | --- | --- |
| `claudeFlagHtml` | `/cards.js`, `/lib/cards.js` | `untestedFlagHtml(card, board)` of `/lib/cards.js` |
| `claudeUntestedHtml` | `/cards.js`, `/lib/cards.js` | `untestedHtml(board)` of `/lib/cards.js` |
| `claudeUntestedLine` | `/cards.js` | `untestedHtml(board)` of `/lib/cards.js` |
| `Fill` | `/lib/view.js` | `HostDeps['fills']['contributions']`, `HostDeps` of `/lib/view.js` |
| `Fills` | `/lib/view.js` | `HostDeps['fills']` |
| `GalleryShowing` | `/lib/board.js` | `{ worker: SessionRef; shown: CardShown }`, both of `/lib/board.js` |
| `heededOffers` | `/cards.js` | `heededAsks` of `/lib/cards.js` |
| `isOffer` | `/cards.js`, `/lib/cards.js` | `isAsk` of `/lib/cards.js` |
| `Lent` | `/lib/view.js` | `HostDeps['lent']` |
| `offerTransitions` | `/cards.js` | `askTransitions` of `/lib/cards.js` |
| `pairLine` | `/cards.js` | `pairLineOf` of `/lib/cards.js` |
| `RouteInput` | `/lib/extension.js` | `Verbs` of `/lib/extension.js`, a verb's input by its name |
| `shortHashOf` | `/views.js`, `/lib/layout.js` | `hashOf(location)` of `/lib/layout.js` |
| `whereLine` | `/cards.js` | `whereLineOf` of `/lib/cards.js` |

Moved to a bundled extension's client, served while the extension is on:

| 1.x names | Served by | 2.0 |
| --- | --- | --- |
| `PROBE_ATTENTION`, `PROBE_STATE_NAME`, `probedLine`, `probeLine`, `probeTitle`, `quotaOf` | `/cards.js` | the same names of `/x/quota/quota.js` |
| `reviewerOf`, `threadCheckoutOf` | `/cards.js`, `/reviews.js` | the same names of `/x/reviews/reviews.js` |
| `newDraft` | `/drafts.js` | the same names of `/x/drafts/commands.js` and `/x/drafts/drafts.js` |
| `AUTOSAVE_MS`, `discard`, `discardItem`, `DRAFT_STATE`, `draftItem`, `draftPath`, `DRAFTS`, `draftsOf`, `draftState`, `draftTitles`, `edit`, `follow`, `isEdited`, `keepsApart`, `keepUnsent`, `leave`, `openDraft`, `readDraft`, `restore`, `save`, `sendable`, `settle`, `titleOf` | `/drafts.js` | the same names of `/x/drafts/drafts.js` |
| `offerWords`, `policiesHtml`, `policyDoneLine`, `policyZone` | `/panels.js` | the same names of `/x/policies/panel.js` |
| `anchorOf`, `anchorWhere` | `/panels.js` | the same names of `/x/reviews/anchors.js` |
| `cardThread`, `floorThread`, `heldThread`, `readThread`, `reviewsHtml`, `threadFailure`, `threadFiles`, `threadItemFiles`, `threadSlot`, `threadViewOf`, `threadWant` | `/panels.js` | the same names of `/x/reviews/panel.js` |
| `checkFound`, `checkKey`, `checkWhy`, `decide`, `floorPolicies`, `heldWords`, `offerAskKey`, `offeredWords`, `POLICIES`, `policyLine`, `runOf`, `standing`, `standingOf`, `standingWords` | `/policies.js` | the same names of `/x/policies/policies.js` |
| `anchorState`, `anchorStates`, `appended`, `bodyProblem`, `checkoutOfId`, `landedOfId`, `landedThreadId`, `landedThreads`, `nextNumber`, `parseThread`, `printMessage`, `printThread`, `resolutionBody`, `resolvedIn`, `resolveProblem`, `resolvesOf`, `REVIEWS`, `sendText`, `stamp`, `THE_USER`, `threadId`, `unseenBy`, `verdictOf` | `/reviews.js` | the same names of `/x/reviews/reviews.js` |

Gone. Each is short; copy the ones you use from the `v1` branch into your own code:

| Served by | 1.x names with no 2.0 name: copy them from `v1` |
| --- | --- |
| `/attend.js` | `attendHandlers`, `attendStep`, `chooseRing`, `dismiss`, `eyeStep`, `remind`, `seeBoard`, `stored`, `watching` |
| `/brief.js` | `BRIEF_MARKDOWN_KEY`, `BRIEF_MARKDOWN_LABEL`, `BRIEF_MARKDOWN_MEANS`, `BRIEF_MARKDOWNS`, `briefParts`, `saidOf`, `toolKey`, `wholeHolds` |
| `/brief.js`, `/lib/brief.js` | `joinedWholes`, `keptWholes` |
| `/capabilities.js` | `parsePattern`, `TIP_MS` |
| `/cards.js` | `actionsOf`, `ADDRESS_TYPE`, `addsLinesOn`, `asksBeganLine`, `awayHiresOf`, `branchPlaceholder`, `BROKEN_DOES`, `brokenText`, `bubbleOf`, `BUDGETS`, `callsignRefusal`, `CARRY_ON_MEANS`, `changedIn`, `CLAUDE_UNTESTED`, `CLI_REGIONS`, `collectionSubject`, `crewFold`, `crewOf`, `CREWS_UNFOLDED_KEY`, `crewTree`, `cutNameOf`, `dutyOrder`, `EFFORTS`, `exemptFromHiring`, `exemptionsBy`, `exemptionWords`, `EXTENSION_STATE_NAME`, `foldAdds`, `formFields`, `hireDepth`, `hireRefusal`, `hirerName`, `hiresOf`, `HOLDS`, `HOST_OUTDATED`, `isAbout`, `isOwnKind`, `KIT_MEMBERS`, `landing`, `landingLine`, `linesOf`, `liveHires`, `matchesWords`, `MODELS`, `MOVE_KEYS`, `moveOfKey`, `neighbours`, `offersBeganLine`, `onKind`, `OVERFLOWS`, `ownLegacyKey`, `ownSubject`, `pastOf`, `PROBLEM_FIX`, `problemLine`, `REGION_ID`, `REMIND_MS`, `RING_KEY`, `RING_MARK`, `RING_NAME`, `ringing`, `ringingSound`, `RINGS`, `runAdded`, `runCommand`, `SCALES`, `SEVERITY`, `shelfSubject`, `sizeOf`, `soundOf`, `spawnForm`, `spawnFormHtml`, `spawnSummaryHtml`, `speechOf`, `STATUS_NAME`, `stepFrom`, `STUCK_TITLE`, `subagentEnd`, `subagentTokens`, `SUBJECT_KEY`, `tokenCount`, `unboundCommands`, `USER_LAYOUT_KEYS`, `WAIT_SAID`, `waitsBeganLine` |
| `/cards.js`, `/lib/cards.js` | `nextWait` |
| `/cards.js`, `/lib/layout.js` | `commandUrl` |
| `/design.js` | `controls`, `designCss`, `fonts`, `iconSize`, `onAttention`, `projectMix`, `reduced`, `shape`, `size`, `space` |
| `/icons.js` | `SVG_PATH` |
| `/items.js` | `collectionPeekHtml`, `itemMeta`, `itemRowHtml`, `keptKey`, `newestFirst`, `TRAY_ROWS` |
| `/keymap.js` | `addedKeys`, `chordProblem`, `keymapOf`, `keysProblems` |
| `/keymap.js`, `/lib/keys.js` | `chordsOf` |
| `/lib/board.js` | `floorLimits` |
| `/markdown.js`, `/lib/markdown.js` | `safeHref` |
| `/media.js` | `accepted`, `MEDIA_TYPES`, `UNKNOWN_TYPE` |
| `/palette.js` | `entryScore`, `matchScore`, `PATTERNS_ENTRY`, `RELOAD_ENTRY`, `WEIGHTS` |
| `/panels.js` | `anchorSpot`, `CHANGES_TREE_KEY`, `changesHtml`, `DIFF_LAYOUT_KEY`, `DIFF_LAYOUT_LABEL`, `DIFF_LAYOUT_MEANS`, `DIFF_LAYOUTS`, `fileRows`, `isCommitScope`, `isViewed`, `linesSpot`, `liveScope`, `markedChangesHtml`, `markedLines`, `markRanges`, `notedLines`, `pickAnchor`, `pickedLines`, `pickRange`, `splitRows`, `viewedCount`, `viewedKey`, `wordRanges`, `WORDS_ALIKE`, `WORDS_EDITS`, `WORDS_LONGEST` |
| `/prefs.js` | `faceFamily`, `GENERIC_FACES`, `PREF_CHOICES`, `PREFS_DEFAULT`, `TERM_SIZES` |
| `/press.js` | `identityOf` |
| `/reads.js` | `wantRead` |
| `/repos.js` | `projectDirs`, `worktreePath`, `WORKTREES_DIR` |
| `/reviews.js` | `REVIEW_SKILL`, `reviewedIn`, `reviewPrompt` |
| `/settings.js` | `ALERTS_MEANS`, `ALERTS_NAME`, `PREF_SECTIONS`, `RING_LABEL`, `RING_MEANS`, `SCHEME_CHOICES`, `SCHEME_LABEL`, `SCHEME_MEANS`, `SOUND_LABEL`, `SOUND_MEANS`, `themeSection` |
| `/slots.js` | `dueSlot`, `isCron`, `periodMs`, `periodProblem` |
| `/spawn.js` | `spawnClosed`, `spawnHandlers` |
| `/term-view.js` | `fileMentions`, `modeOf`, `resolvePath`, `SETTLE_MS`, `termHandlers`, `termOpening` |
| `/terminal.js` | `cellOf`, `fitSize`, `reportWheel` |
| `/termkeys.js` | `NATURAL_KEYS`, `naturalKey`, `terminalKeymap`, `terminalKeys` |
| `/tips.js` | `placeBeside`, `placeNear`, `tipsCss` |
| `/toasts.js` | `ACTION_TOAST_MS`, `sameToast`, `TOAST_MAX`, `TOAST_MS`, `toldTimes` |
| `/verb-words.js` | `RECUT_ON_RESUME`, `VERB_WORDS`, `verbId` |
| `/views.js` | `CORE_VIEWS`, `coreViewOf`, `VIEW_ALIASES` |

## Forks

- **Take upstream's `API_VERSION`**, as before: `2.0`. Your own extensions follow
  [Extension and renderer authors](#extension-and-renderer-authors), and your config follows [Config](#config).
