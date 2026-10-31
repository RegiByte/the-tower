---
{
  "type": "decision",
  "name": "The dresser: workers dressed, posed and fitted by hand, saved to the wardrobe",
  "summary": "A Tower 3D page beside the lab (dresser.html) that puts one worker on a stand, dressed through the same avatar path as Tower 3D, to build a look, pose it and fit its rigid pieces head by head, kept as outfits and fits in a copy of the wardrobe that tool:dresser serve writes back, and that agents drive and shoot headless through the same page.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-11",
  "reviewed": "2026-10-31",
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
    "hub/renderers/tower3d/src/api.ts#tower",
    "hub/package.json"
  ],
  "links": [
    { "to": "kaykit-workers", "verb": "uses", "carries": "the wardrobe, its catalogue and the one avatar path, read and written by hand" }
  ]
}
---
**Problem.** Worn pieces were misplaced on some heads, and every fix was a number changed in code, a rebuild and a
walk to the desk to look. The user wanted to move pieces, swap parts and scale them by hand, saved as data.

**Why.** The wardrobe makes looks, outfits and fits data ([[kaykit-workers]]); what was missing was a surface to edit
that data by eye, and the same surface for agents, so a fit is judged from a picture rather than guessed.

**How.**
- One page in Tower 3D's bundle, beside the lab ([`dresser.ts`](ref:hub/renderers/tower3d/src/dresser.ts),
  [`dresser.html`](ref:hub/renderers/tower3d/dresser.html)). It dresses with `avatar(models, look, wardrobe)`, so what
  it shows is what Tower 3D draws, and reads every list (bodies, each slot's parts, palettes, outfits) from the
  catalogue and the wardrobe, so a part made in the Blender kit appears with no code.
- A look starts from a body ([`based`](ref:hub/renderers/tower3d/src/dresser.ts#based): a character of the contract
  or the bot, as it comes) or a random one, then each slot's part and each colour is picked or rolled. Colours are
  only the swatches of the mix's palettes (`skins`, `hairs`, `wears`), the curated set the shared atlas is tinted with.
- Poses ([`poseAt`](ref:hub/renderers/tower3d/src/dresser.ts#poseAt)) are the layers Tower 3D plays, the seated ones
  in the desk's own chair ([`CHAIR`](ref:hub/renderers/tower3d/src/chair.ts#CHAIR)).
- Fitting is per head, because heads differ and one `*` fit cannot suit them all. A gizmo edit on a rigid piece writes
  only the field it moved into the override keyed by the head worn (`bot` on a bot). The line-up
  ([`restage`](ref:hub/renderers/tower3d/src/dresser.ts#restage)) puts the look on every head, each tagged with whether
  the piece is fitted on it, follows the default or is as made ([`fitState`](ref:hub/renderers/tower3d/src/dresser.ts#fitState));
  a click makes a head the one fitted, and "set as default" writes the fit as worn to `*`. Tower 3D's own
  [`fitFrom`](ref:hub/renderers/tower3d/src/wardrobe.ts#fitFrom) says where each value comes from, and
  [`fitOfObject`](ref:hub/renderers/tower3d/src/dresser.ts#fitOfObject), the inverse of
  [`fitted`](ref:hub/renderers/tower3d/src/avatar.ts#fitted), turns the gizmo's placement back into a fit.
- Outfits are kept, renamed (in the mix's `except` too) and deleted, the ones Tower 3D dresses by name (`STAFF`)
  locked; an outfit kept here sets every slot, bare ones too ([`outfitOf`](ref:hub/renderers/tower3d/src/dresser.ts#outfitOf)).
  The mix is edited as JSON, checked by the wardrobe's schema. The page shows the worker's draw calls and triangles
  ([`cost`](ref:hub/renderers/tower3d/src/dresser.ts#cost)).
- Saving ([`save`](ref:hub/renderers/tower3d/src/dresser.ts#save)) first lists what writing would change in the file
  as it is now ([`changesOf`](ref:hub/renderers/tower3d/src/dresser.ts#changesOf)), checks the wardrobe's `problems`
  against the page's catalogue, and PUTs it to [`tool:dresser serve`](ref:hub/scripts/dresser.ts), which parses it
  and writes it through [`formatWardrobe`](ref:hub/renderers/tower3d/src/wardrobe.ts#formatWardrobe)
  ([`saveWardrobe`](ref:hub/scripts/dresser.ts#saveWardrobe)), so a save diffs by what changed. With no serve behind
  it, the page asks for the JSON to be copied. The serve rebuilds Tower 3D on each load of the page.
- Agents drive the same page through `window.dresser`, and `tool:dresser shot` renders a look, a pose or the line-up
  as a PNG through it in headless Chrome.

**Alternatives considered.**
- *A mode of the KayKit playground*: its scenes are static models; the dresser needs the rig, clips, tinting and
  dressing code, which live in Tower 3D's bundle.
- *The server checking the catalogue*: the catalogue is derived from the GLBs as the page loads them; the page that
  has it checks, and the server checks the schema.
- *One fit for every head with a "save under" choice*: it showed the document's keys rather than the task. Fitting on
  the head clicked is the task itself; `*` stays one button away.
- *A native colour picker*: any colour breaks the curated palettes the shared atlas is tinted from.
- *Dragging the uniform-scale handle alone*: the gizmo's centre handle jumps when grabbed near its middle, so uniform
  size is a slider too.

**Impact.** Fits, outfits and the mix are adjusted by eye and saved as a reviewed diff of `wardrobe.json`; agents
check a fit from a picture. Tower 3D's modules use [`window.tower`](ref:hub/renderers/tower3d/src/api.ts#tower) only
when a read is called, so a Tower 3D page loads where no tower serves it.
