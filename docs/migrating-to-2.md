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

## Tower.app
