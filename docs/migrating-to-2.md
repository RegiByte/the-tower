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
- **The old CLI words are gone.** See [The CLI](#the-cli).
- **A config still spelling `probes` is refused.** See [Config](#config).

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
- **`keys.pane-reviews` is refused.** The config is not taken, and `tower config check` names the line to write:
  `"reviews/thread": <its value>` under `keys`, the chord of the reviews extension's thread view.

## Tower.app
