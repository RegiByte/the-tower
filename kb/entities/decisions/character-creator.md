---
{
  "type": "decision",
  "name": "The dresser: workers dressed, posed and fitted by hand, saved to the wardrobe",
  "summary": "A Tower 3D page beside the lab (dresser.html) puts one worker on a stand, dressed by the wardrobe through the same avatar path as Tower 3D, to start from a body or a random look, change or roll its parts and its colours (the wardrobe's palettes), pose it as Tower 3D does (the office chair included) and fit its rigid pieces head by head: in the line-up a click makes a head the one fitted and an edit saves as that head's override. Looks are kept as outfits. It edits a copy of the wardrobe; tool:dresser serve shows what saving changes in the file and writes it, and tool:dresser shot renders a look headless through the same page for agents.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-11",
  "reviewed": "2026-10-16",
  "refs": [
    "hub/renderers/tower3d/dresser.html",
    "hub/renderers/tower3d/src/dresser.ts",
    "hub/renderers/tower3d/src/dresser.ts#poseAt",
    "hub/renderers/tower3d/src/dresser.ts#fitOfObject",
    "hub/renderers/tower3d/src/dresser.ts#restage",
    "hub/renderers/tower3d/src/dresser.ts#outfitOf",
    "hub/renderers/tower3d/src/dresser.ts#save",
    "hub/renderers/tower3d/src/dresser.ts#changesOf",
    "hub/renderers/tower3d/src/dresser.ts#based",
    "hub/renderers/tower3d/src/dresser.ts#fitState",
    "hub/renderers/tower3d/src/dresser.ts#cost",
    "hub/renderers/tower3d/src/chair.ts#CHAIR",
    "hub/scripts/dresser.ts",
    "hub/scripts/dresser.ts#saveWardrobe",
    "hub/renderers/tower3d/src/avatar.ts#fitted",
    "hub/renderers/tower3d/src/wardrobe.ts#fitFrom",
    "hub/renderers/tower3d/src/wardrobe.ts#formatWardrobe",
    "hub/package.json"
  ],
  "links": [
    { "to": "kaykit-workers", "verb": "uses", "carries": "the wardrobe, its catalogue and the one avatar path, read and written by hand" }
  ]
}
---
**Problem.** Worn pieces were misplaced on some heads, and every fix was brute force: change a number in code or a
script, rebuild, walk to the desk, look. The user asked for a UI to move components around, swap outfit and body
parts and change the scale of items, saved as data.

**Why.** Once the wardrobe made looks, outfits and fits data ([[kaykit-workers]]), what was missing was a surface
to edit that data by eye, and the same surface for agents, so a fit is judged from a picture rather than guessed.

**How.**
- One page in Tower 3D's bundle, beside the lab: [`dresser.ts`](ref:hub/renderers/tower3d/src/dresser.ts) and
  [`dresser.html`](ref:hub/renderers/tower3d/dresser.html), built into `out/` by `npm run tower3d`. It dresses with
  `avatar(models, look, wardrobe)`, so what it shows is what Tower 3D draws. The look on the stand is a wardrobe
  `Look`; every list (bodies, each slot's parts, palettes, outfits) is read from the catalogue and the wardrobe, so
  a part made in the Blender kit appears with no code.
- Building a look follows the user's flow: start from a body
  ([`based`](ref:hub/renderers/tower3d/src/dresser.ts#based): any KayKit character of the contract or the bot, its own
  head and nothing else) or randomize the whole look (`lookOf` on a fresh id), then pick or roll (a die) each slot's part
  and each colour. Colours are only the swatches of the mix's palettes (`skins`, `hairs`, `wears`), the curated set
  the shared atlas is tinted with: offering a colour is adding it to a palette. Loading a worker by session id or
  callsign is an advanced field.
- Poses ([`poseAt`](ref:hub/renderers/tower3d/src/dresser.ts#poseAt)) are the layers Tower 3D plays: standing,
  sitting and typing in the desk's own chair ([`CHAIR`](ref:hub/renderers/tower3d/src/chair.ts#CHAIR)), walking and
  the rest, played or scrubbed on the page's clock.
- Fitting is per head, because heads differ and one `*` fit cannot suit them all. A rigid piece (clicked, or picked
  from the list) takes three's `TransformControls`, number fields and a size slider, and an edit writes only the field the gizmo moves into the override keyed by the head worn (`bot` on a
  bot). "Line up every head" ([`restage`](ref:hub/renderers/tower3d/src/dresser.ts#restage)) is the fitting surface:
  the look on every head, re-fitted live, each with a tag saying whether the piece is fitted on it, follows the
  default or is as made ([`fitState`](ref:hub/renderers/tower3d/src/dresser.ts#fitState)); a click on a worker makes
  its head the one worn and fitted. "Set as default for every head" writes the fit as worn to `*` and lets the head
  follow it. Tower 3D's own [`fitFrom`](ref:hub/renderers/tower3d/src/wardrobe.ts#fitFrom) says where each value
  comes from, folded away. The gizmo's placement is turned back into a fit by
  [`fitOfObject`](ref:hub/renderers/tower3d/src/dresser.ts#fitOfObject), the inverse of
  [`fitted`](ref:hub/renderers/tower3d/src/avatar.ts#fitted).
- Outfits: a list to load, rename (in the mix's `except` too), delete (the ones Tower 3D dresses by name, `STAFF`,
  locked), and keep the look as a new one or update the
  one loaded: an outfit kept here sets every slot, bare ones too
  ([`outfitOf`](ref:hub/renderers/tower3d/src/dresser.ts#outfitOf)). The mix is edited as JSON, checked by the
  wardrobe's schema.
- Cost: the worker's draw calls and triangles, a call per visible mesh
  ([`cost`](ref:hub/renderers/tower3d/src/dresser.ts#cost)), and the selected piece's triangles.
- Saving ([`save`](ref:hub/renderers/tower3d/src/dresser.ts#save)): the page starts from the file the server reads
  (`GET /wardrobe`), and Save first lists what writing would change in the file as it is now
  ([`changesOf`](ref:hub/renderers/tower3d/src/dresser.ts#changesOf): fits by piece and head, outfits added, renamed,
  changed and removed, mix fields) to confirm. Then it checks `problems` against its catalogue and PUTs the document
  to [`tool:dresser serve`](ref:hub/scripts/dresser.ts), which parses it and writes it through
  [`formatWardrobe`](ref:hub/renderers/tower3d/src/wardrobe.ts#formatWardrobe)
  ([`saveWardrobe`](ref:hub/scripts/dresser.ts#saveWardrobe)), so a save diffs by what changed. Node has no catalogue
  (it is derived from the GLBs with three), so the catalogue check is the page's. `serve --wardrobe <file>` reads and
  writes another file, a copy to try saving on. Served elsewhere (the tower, a shelf frame), the page has no server
  and copies the JSON instead. The serve rebuilds on each load of the page, and Tower 3D takes the file on its next
  `npm run tower3d`.
- Agents drive the same page through `window.dresser`, and `npm run tool:dresser -- shot` renders a look, a pose or
  the line-up as a PNG through it in headless Chrome (usage in `scripts/dresser.ts`).

**Alternatives considered.**
- *A mode of the KayKit playground*: its scenes are static models; the dresser needs the rig,
  clips, tinting and dressing code, which live in Tower 3D's bundle.
- *Fits saved by the server checking the catalogue*: the catalogue comes from parsing the GLBs with three; the page
  that already has it checks, and the server checks the schema.
- *One fit for every head with a "save under" choice*: it showed the document's keys rather than the user's task.
  Fitting on the head clicked, with its state on
  each head, is the task itself; `*` stays one button away.
- *A native colour picker*: any colour breaks the curated palettes the shared atlas is tinted from.
- *Dragging the uniform-scale handle alone*: TransformControls' centre handle jumps when grabbed near its middle,
  so uniform size is a slider too.

**Impact.** Fits, outfits and the mix are adjusted by eye and saved as a reviewed diff of `wardrobe.json`; agents
check a fit from a picture. Tower 3D modules that read `window.tower` at import (`api.ts`'s reads, `fixtures.ts`'s
streams and blobs) read it when called, so a Tower 3D page loads where no tower serves it.
