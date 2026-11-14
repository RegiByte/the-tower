---
{
  "type": "decision",
  "name": "The library: one curated surface for code outside the core",
  "summary": "Code outside the core builds on the library, 24 modules at /lib/<module>.js, each a file of src/lib/ holding only named re-exports and deprecated aliases. One specifier works in a browser, in server code through the resolve hook, and in a bundler through a tsconfig path. API_VERSION versions it, every name with its since, and five checks in npm test hold it: shape, declarations, reach, runtimes and direction.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-05",
  "reviewed": "2026-11-14",
  "refs": ["hub/src/lib/words.ts", "hub/src/shared/view-parts.ts", "hub/src/lib/extension.ts", "hub/src/tower/served.ts#LIBRARY", "hub/src/tower/served.ts#SERVER_ONLY", "hub/src/tower/served.ts#serverOnlyModule", "hub/src/lent-modules.ts", "hub/src/types.ts#writeTypes", "hub/test/types.test.ts", "hub/tsconfig.types.json", "hub/test/library.ts#shapeOf", "hub/test/library.ts#reachNow", "hub/test/library.ts#libraryInCore", "hub/test/library.test.ts", "hub/test/runtimes/generic.json"]
}
---
**Problem.** The contract for code outside the core was whatever `src/shared` happened to export through a barrel:
`/cards.js` alone served 280 values, most of them helpers exported for a sibling module. An extension's server and
client had no single way to import a name, since a client used `/media.js` and server code `tower:media.js`. The
bundled extensions used no public name at all. Nothing could be refactored freely, because nobody had chosen what was
API.

**Why.** The core can refactor only if its contract is a short list someone chose name by name, and a list is only the
contract if authors can find everything they need on it.

**How.**
- **Files that only name.** Each `src/lib/<module>.ts` holds named re-exports, named re-exports of types, and deprecated
  aliases with the import each needs. Adding an export to a source file changes no library name until someone writes it
  into a library file. A name stands in one module.
- **One specifier.** `/lib/<module>.js` is a URL in a browser ([`LIBRARY`](ref:hub/src/tower/served.ts#LIBRARY) in
  `SOURCE_DIRS`, so a library file is served like any other, once, with its imports as URLs, and a page's import map and
  preloads cover it). [`lent-modules.ts`](ref:hub/src/lent-modules.ts) maps the prefix to the source in node, and
  tsconfig paths do it for bundlers.
- **Membership is use.** A name is in the library when some extension, example, renderer, core view or Tower.app uses
  it, or when an author needs it to use what the library already holds: the type of a library function's argument
  (`TermViewIo`, `mountTermView`'s `io`), the kit for a renderer that lends none (`NO_KIT`), the splitting and naming
  a view needs to publish the `section` subjects `tower/document` publishes (`sectionsHtml`, `sectionLabels`, beside
  `sectionsOf`). A name that has met one consumer is marked `@provisional`: it may change in a minor until a second
  consumer promotes it. A name whose output carries something for the core alone says that part is unspecified:
  `sectionsHtml`'s html draws the sections, and the source marks in it are not contract.
- **A core view is a client.** `src/views/` imports the library by URL, and reaches `src/shared` by path for what only
  the views use, until a second consumer asks. A sibling renderer can mount a core view, so a view's drawing is no
  contract: what enters the library is what a renderer needs to draw for itself, the subjects and the href checks
  among it. What the views draw alike ([`view-parts.ts`](ref:hub/src/shared/view-parts.ts)) sits below `src/shared`, so `/lib/view.js` reaches no view.
- **Each module says where it runs.** Generic, browser or server, by the tsconfig under `test/runtimes/` that checks it.
  To make that true the data the board and the panels are made of left the I/O modules that declared them:
  `repo-changes.ts` holds a repo's commits, files and hunks, `model.ts` holds `SystemPaths`, `viewer.ts` the kinds a
  viewer keeps, and `panel-html.ts` a panel's html, none of it reaching node or the DOM. A generic file imports the file
  it means, never the `cards.ts` barrel, which reaches browser code. highlight.js's and xterm's types name the DOM's
  library, which would give every module in the same program the DOM's types: the generic check maps highlight.js to a
  small declaration, and fails if it ever reads `lib.dom.d.ts` or node's types.
- **Server code stays in node.** `/lib/extension.js` answers a browser with a module that throws the reason as it runs
  ([`serverOnlyModule`](ref:hub/src/tower/served.ts#serverOnlyModule)), still exporting its names so that the browser
  doesn't stop first at a missing name.
- **Versioned by `API_VERSION`.** `test/served-exports.json`'s `library` holds each module's runtime, each name's
  `since`. `served:update` stamps a new name and keeps a known name's `since`. A name removed under the same major fails
  the test. What a name's type means is for the pull request to call a minor or a major.
- **Five checks in `npm test`** ([`library.test.ts`](ref:hub/test/library.test.ts)): shape, with once across modules;
  declarations; reach, nothing in `extensions/`, `examples/`, `renderers/` and `apps/` importing the core by path, nor through
  its old served modules or a core view's URL; runtimes; direction, nothing in `src/` importing the library by path, and only a core
  view by URL.
- **The old way out.** The 28 served modules answer with `Deprecation` and a `Link` to the library's docs until 2.0
  removes them. A page's import map names their files' hashed URLs, so only an unmapped client sees the header.
- **Types outside the checkout.** `tower types <dir>` ([`writeTypes`](ref:hub/src/types.ts#writeTypes)) writes the
  declarations the checkout's TypeScript emits for the library and the bundled clients (`tsconfig.types.json`, comments
  kept so `@deprecated` reaches editors) into `<dir>/.tower/types/`, with a tsconfig to extend that maps `/lib/*.js`,
  `/tower.js` and `/x/<cap>/*.js`. Every package the tree names is vendored, worked out from the declarations, and the
  written tsconfig leaves `skipLibCheck` off, since with it on a missing package turns what it reaches into `any`
  unsaid. A fixture in `test/outside/`,
  importing from every module, typechecks in a temporary folder against that tree alone.

**Alternatives considered.** Keeping the 28 modules with named lists fixes accidents but keeps the grab-bags. Two
surfaces, one for authors and one for renderers, means two contracts. An npm package needs an account and a release
step, and the project is local only. `tower:` as the one specifier can't resolve in a browser without an import map on
every page. A version number of the library's own would be a second number that must agree with `API_VERSION`. A digest of the
declarations each module reaches, kept in `served-exports.json` to show in review which modules' types moved, was
dropped: it hashed the transitive declaration closure by file path, so moving a type between files, or nearly any
shared-type edit, moved it with no change to a library type. Of the 33 commits that touched the list, 13 moved only
digests, usually 17 to 19 of 24 modules, a pure refactor among them. A signal that fires on every change gets
regenerated unread, and adds a conflict-prone diff to most pull requests. A note that doesn't fail would be as
unread, and a per-name signature is a larger design than the contract needs; the hard failure on a removed name is
what holds it.

**Impact.** The library landed additive: nothing moved onto it in the minor that added it, and each later change
deleted its lines from a reach list that only shrank, until none reached in and the list became the plain rule. Only `/lib/` is contract, which the docs say plainly; the repo's checks hold the repo, and
an outside author can still import a checkout path. See [[renderer-api-contract]], [[renderer-shared-modules]] and
[[extensions]].
