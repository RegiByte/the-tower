---
{
  "type": "decision",
  "name": "The library: one curated surface for code outside the core",
  "summary": "Code outside the core builds on the library, 24 modules at /lib/<module>.js, each a file of src/lib/ holding only named re-exports and deprecated aliases. One specifier works in a browser, in server code through the resolve hook, and in a bundler through a tsconfig path. API_VERSION versions it, every name with its since, and five checks in npm test hold it: shape, declarations, reach, runtimes and direction.",
  "in": "tower",
  "status": "accepted",
  "date": "2026-11-05",
  "reviewed": "2026-11-05",
  "refs": ["hub/src/lib/words.ts", "hub/src/lib/extension.ts", "hub/src/tower/served.ts#LIBRARY", "hub/src/tower/served.ts#SERVER_ONLY", "hub/src/tower/served.ts#serverOnlyModule", "hub/src/lent-modules.ts", "hub/src/types.ts#writeTypes", "hub/test/types.test.ts", "hub/tsconfig.types.json", "hub/test/library.ts#shapeOf", "hub/test/library.ts#declarationDigests", "hub/test/library.ts#reachNow", "hub/test/library.ts#libraryInCore", "hub/test/library.test.ts", "hub/test/runtimes/generic.json", "hub/test/library-reach.json"]
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
  it. A name that has met one consumer is marked `@provisional`: it may change in a minor until a second consumer
  promotes it.
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
  `since`, and a digest of the declarations the module reaches, comments dropped. `served:update` stamps a new name and
  keeps a known name's `since`. A name removed under the same major fails the test. A moved digest shows in review which
  modules' types changed, and the pull request calls it a minor or a major.
- **Five checks in `npm test`** ([`library.test.ts`](ref:hub/test/library.test.ts)): shape, with once across modules;
  declarations; reach, a list of every way into the core from `extensions/`, `examples/`, `renderers/` and `apps/` that
  only shrinks, and ends empty; runtimes; direction, nothing in `src/` importing the library by path, and only a core
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
every page. A version number of the library's own would be a second number that must agree with `API_VERSION`.

**Impact.** The library lands additive: nothing moves onto it in the minor that adds it, and each later change deletes
its lines from the reach list. Only `/lib/` is contract, which the docs say plainly; the repo's checks hold the repo, and
an outside author can still import a checkout path. See [[renderer-api-contract]], [[renderer-shared-modules]] and
[[extensions]].
