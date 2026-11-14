# Migrating to 2.0

2.0 removes what 1.x kept for compatibility: old shapes, old names and old ways in, each of which had a replacement
in 1.x. It adds nothing. This guide lists every change that can break something of yours, by who it reaches, each
with what to do instead.

It is written so that Claude can apply it. Point a Claude session at this file and at your extension, renderer, fork
or config, and ask it to bring them to 2.0: each entry says what to find and what to change it to, and the tower's
own checks (`tower extensions check <dir>`, `tower config check`, `tower doctor`) say whether it worked.

## Everyone who runs a tower

- **The host must speak protocol 5.** A 2.0 tower starts sessions and logs facts only on a host at the current host
  protocol, which arrived in 1.x. While an older host runs, a spawn, a hire, a resume or a logged fact is refused
  with `unavailable`, naming the fix. Restart the host: `tower down host`, then `tower up`. That stops the running
  sessions; each one stays resumable.
- **Old links to a floor's page open the skyline.** The tower page's hashes before 1.104, `#shelf/<p>/<n>`,
  `#draft/<p>[/<id>]`, `#archive/<p>`, `#policies/<p>` and `#kept/<p>/<c>[/<id>]`, are no longer read: a bookmark
  or a link in a note that uses one opens the default view. Open the page again and copy its address, which is the
  current form, `#v/<view>/<subject>`. A worker's link, `#<id>` with or without its tab, still opens the worker.
- **The old CLI words are gone.** See [The CLI](#the-cli).
- **A config still spelling `probes` is refused.** See [Config](#config).
- **Every config must be rewritten: `argv` and the plugins and commands moved under `runtimes`.** A 1.x config is
  refused until it is, on the board and by `tower config check`. See [Config](#config).

## Extension and renderer authors

- **`API_VERSION` is `2.0`.** `tower.version` reads `2.0`. A page that loads `/tower.js?v=1.<n>` is refused, since a
  pin names the major it was written against: load `/tower.js?v=2.0` once the page meets the rest of this section.
- **`requires.tower` is `"2.0"`.** A manifest that requires a 1.x tower is refused as `too-old` before any other key
  is read, and the tower says so on the board and in `tower extensions check`. Set `"requires": { "tower": "2.0" }`,
  then make the changes the rest of this section lists. Every name in the library now says it arrived in 2.0.
- **The core's copy of policies is gone.** Policies have been the bundled policies extension since 1.91; the core
  kept their old names as copies of the extension's, and 2.0 drops them. While the extension is off, nothing of a
  policy is on the board or answers, as in 1.x. Find each old name and change it to the extension's:

  | 1.x | 2.0 |
  | --- | --- |
  | `floor.policies` | `floor.x.policies.policies`, or `floorPolicies(floor).policies` of `/x/policies/policies.js`. Its calls name `policies/run` and `policies/approve` |
  | `board.offers` | each floor's `x.policies.offers` (`floorPolicies(floor).offers`), whose `accept` calls `policies/run`. An offer is also an ask in `board.asks` (`cap: 'policies'`, `sound: 'offer'`): draw that one to put offers among the waits |
  | `card.run` | `card.x.policies.run` |
  | `POST /policy/run`, `/policy/pass`, `/policy/approve` | `POST /policies/run`, `/policies/pass`, `/policies/approve`, the same input and reply. The old routes answer `not_found` |
  | `GET /runs/<project>?policy&limit` | `GET /policies/runs/<project>?policy&limit`, the same query and reply |
  | `/policies.js` | `/x/policies/policies.js` (404 at the old URL) |
  | `policiesHtml`, `policyZone`, `offerWords`, `policyDoneLine` of `/panels.js` | the extension's view `policies/policies`, mounted on a floor; its client is `/x/policies/panel.js` |
  | `heededOffers`, `offerTransitions`, `offersBeganLine`, `isOffer` of `/cards.js`, and `isOffer` of `/lib/cards.js` | `heededAsks`, `askTransitions`, `asksBeganLine` and `isAsk` of `/lib/cards.js`, over the offers' asks. `Attended` is a wait or an ask |

  Workers and scripts use `tower x policies …` (see [The CLI](#the-cli)). The facts stay where they were: the runs
  and approvals of each project are still read from `streams/projects/<project>/runs/` and `approvals/`.
- **The quota probe and drafts answer only under their extensions' names.** Each old name had its replacement since
  1.90:

  | 1.x | 2.0 |
  | --- | --- |
  | `POST /probe/run` `{ "name": "quota" }`, `ctx.call('probe/run', …)` | `POST /quota/read-now` `{}`, or `{ "command": "<name>" }` for one command |
  | `GET /probe/<name>?last=<n>`, `tower.probe(name, { last })` | `GET /quota/reads?last=<n>`, `tower.get('quota/reads?last=<n>')` |
  | `board.probes` | `board.x.quota`, and `quotaOf`, `probeLine` and `probeTitle` of `/x/quota/quota.js` |
  | `quotaOf`, `PROBE_STATE_NAME`, `PROBE_ATTENTION`, `probeLine`, `probeTitle`, `probedLine` of `/cards.js` | the same names of `/x/quota/quota.js` |
  | the module `/drafts.js` | `/x/drafts/drafts.js` |

  A removed route answers `not_found`; a removed board field is absent.
- **`board.limits` is the one shape for rate limits.** The top-level copies of the default command's limits are gone:
  `board.rateLimits`, `rateLimitsAt`, `rateLimitsFrom`, `turnLimits` and `extraUsage`. Read the same fields from
  `defaultLimits(board)` of `/lib/board.js`, or from a command's entry with `limitsOf(board, command)`. The limit
  words of `/lib/cards.js` (`extraUsageLine`, `extraUsageAmounts`, `limitsFromTitle`) take an entry of
  `board.limits`, no longer the board.
- **Quota readings written before 1.90 no longer set the limits.** The core folded the `p` facts the old core probe
  wrote into `probe.quota/` beside the readings of kind `tower/rate-limits`; it now folds only the latter. The quota
  extension still reads `p` facts for its own status. A reading of your own extension's is folded as before, as long
  as its fact code declares `"kind": "tower/rate-limits"`.

- **The core's copy of review threads is gone.** Review threads have been the bundled reviews extension since 1.93;
  2.0 drops the core's copy of them. A tower with reviews on draws and writes threads as before. Find each old name
  and change it to the extension's:

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

  - **A reviewer is only what its facts say.** A worker spawned before 1.95 on the prompt `/tower:review <CALLSIGN>`,
    which logged no reviewer facts, no longer reads as that callsign's reviewer: it has no `x.reviews.of`, sits in no
    crew by reviews, is not exempt from hiring, and its thread is its own checkout's. Its notes stay on the thread it
    wrote them on.

  - **The CLI says a reviewer by its crew.** `tower agents` and `tower agent` no longer print `reviews <CALLSIGN>`; a
    reviewer's line reads `in <CALLSIGN>'s crew, by reviews`. Change scripts that grep the old words.

  - **The page's `#<id>/reviews` link opens the worker's card,** without its thread tab: write
    `#v/tower/card/card%3A<id>;reviews/thread`.

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

- **A client command is called without `subject`.** Its export was called with `{ tower, board, subject, target,
  args, kit }`, `subject` being the subject's value; 2.0 calls it with `{ tower, board, target, args, kit }`. Read the
  value from `target.value`:

  ```js
  // 1.x
  export async function set({ tower, subject }) { await tower.call('tabline/facts/line', { session: subject.id, … }) }
  // 2.0
  export async function set({ tower, target }) { await tower.call('tabline/facts/line', { session: target.value.id, … }) }
  ```

- **A manifest's `plugins` moved under `runtimes`.** `"plugins": { "claude": "<folder>" }` is refused, naming the new
  key, and the extension does not start, so its sessions would load no plugin anyway. Write the same folder under
  `runtimes`:

  ```jsonc
  // 1.x
  "plugins": { "claude": "plugin" }
  // 2.0
  "runtimes": { "claude": { "plugins": "plugin" } }
  ```

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

  A board entry is `{ label, defaults, untested, tested, commands? }`; a floor's is `{ command? }`. The type
  `ClaudeDefaults` of `/lib/board.js` is `RuntimeDefaults`, and the new entries are the types `BoardRuntime` and
  `FloorRuntime`.

- **The library's Claude-named words are neutral.** Find each and change it:

  | 1.x | 2.0 |
  | --- | --- |
  | `claudeUntestedHtml(board)`, `claudeUntestedLine(board)` | `untestedHtml(board)`: one span per runtime with untested releases, `"Claude Code 2.1.330 untested"` |
  | `claudeFlagHtml(card)` | `untestedFlagHtml(card, board)` |
  | `CLAUDE_UNTESTED` | `untestedTitle(board.runtimes[id])` |
  | `detailsOf(card)` | `detailsOf(card, board.runtimes)`: the runtime's row is labelled by its `label` |
  | `spawnFormHtml(floor, { sign, draft, defaults, fields, commands })` | `spawnFormHtml(floor, { sign, draft, runtime, fields })`, `runtime` being `board.runtimes.claude` |
  | `spawnSummaryHtml(floor, form, defaults, fields)` | `spawnSummaryHtml(floor, form, runtime, fields)` |
  | `floorLimits(board, { command })` | `floorLimits(board, { runtimes })`, a floor as the board has it |
  | `TermViewIo.claude` (`mountTermView`'s `io`) | `wheelReports`: true for a session's terminal, false for a shell's |
  | `briefHtml({ briefs, … })` | `briefHtml({ briefs, agent, … })`, `agent` being `board.runtimes[card.runtime].label`, which signs the answers |
  | `saidWhat(briefs, key)`, `saidOf(briefs)` | `saidWhat(briefs, key, agent)`, `saidOf(briefs, agent)`: a step's words are named by the runtime's label, `"Claude Code's words"` |

- **The Brief's answers are `.bubble.agent`.** The class `.bubble.claude` on an answer is `.bubble.agent`. A user theme
  or a renderer's stylesheet that targets `.brief-view .bubble.claude` targets `.brief-view .bubble.agent` instead.

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

  The library was chosen name by name, so it holds fewer names than these modules served. A name you import that no
  library module exports has no replacement: copy it from the `v1` branch into your own code. `GET /schema` and
  `tower types <dir>` list what the library holds.
- **`tower.schemeChoice()` and `tower.chooseScheme(c)` are gone.** The colour scheme is one field of the viewer's
  appearance: read it with `tower.prefs.get().scheme` and set it with `tower.prefs.set({ scheme })`. A shelf page
  that posts its own `{ t: 'tower', verb: 'scheme', scheme }` to the page framing it posts
  `{ t: 'tower', verb: 'prefs', prefs: { scheme } }` instead; the old verb is ignored. A framed page that ran its own
  relay and listened for `{ t: 'scheme' }` listens for `{ t: 'prefs', prefs }`: only a `url` entry's frame still gets
  the scheme alone.
- **`shortHashOf` is gone from `/lib/layout.js`.** It wrote the floor hashes 2.0 no longer reads (see
  [Everyone who runs a tower](#everyone-who-runs-a-tower)). Write `hashOf(location)`, the grammar, for every location;
  `locationOf` still reads a worker's `#<id>` and `#<id>/<tab>`.
- **Server code imports the library, not `tower:`.** An extension's server module that imports
  `tower:<name>.js` fails to load: node is told the tower doesn't lend it, and the error lists the library's
  modules. Import `/lib/<module>.js` instead, the same line a client writes, by the table above.

## The CLI

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

## Forks

- **Take upstream's `API_VERSION`**, as before: `2.0`. Your own extensions follow the authors' section above.

## Config

- **`probes` is refused.** `"probes": { "quota": { "off": …, "every": … } }`, the quota probe's spelling before 1.90,
  was read as the quota extension's until 2.0. A config that still has it is refused: the board says so, and
  `tower config check` fails it at `probes`, naming the line to write, such as
  `"extensions": { "quota": {"off":true,"settings":{"every":"1h"}} }`. Move `off` to `extensions.quota.off` and
  `every` to `extensions.quota.settings.every`, then remove `probes`.
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
  names no runtime the tower knows is a failure in `tower config check`. `tower config check` passing is the sign the
  rewrite is complete.
- **A layout naming `tower/shown` no longer means the views that draw showings.** The view was retired at 1.115;
  1.x read it in a layout's `order` as leaving showings to their type's pick and in `hidden` as hiding each view
  that draws them. 2.0 reads it as any other id no view has: nothing. Remove it from `order`, and in `hidden` name
  the views by type you meant (`tower/document`, `tower/link`, `tower/text` and their kin, listed in
  [Views](extending.md#views)).
- **`keys.pane-reviews` is refused.** The config is not taken, and `tower config check` names the line to write:
  `"reviews/thread": <its value>` under `keys`, the chord of the reviews extension's thread view.

## Tower.app

- **An app built before release 1.98 loses its badge.** Tower.app reads its attention badge, menu-bar list and
  notifications from a page that imports the tower's modules. Until 1.98 that page imported `/attend.js`, which 2.0
  no longer serves, so an older build shows no badge. Run `tower app` from a 2.0 checkout, which builds it again.
