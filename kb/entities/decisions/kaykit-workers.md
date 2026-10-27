---
{
  "type": "decision",
  "name": "Workers as KayKit characters on KayKit's rigs, posed by clips on the sim clock",
  "summary": "Tower 3D's workers are KayKit characters (CC0) on KayKit's rigs, one skeleton per rig kind with its clips (the large rig's retargeted by the packer), posed through a mixer of their own set from sim time each frame, so stepped frames repeat. Looks are data, the wardrobe: fits, outfits and a mix that hashes each worker's id (or its callsign's name) into a body, paint and a part per slot by rendezvous. New parts are modelled by hand in a Blender kit (parts/parts.blend) and join a look's slots by their names, with no code.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-11",
  "reviewed": "2026-10-26",
  "refs": [
    "hub/renderers/tower3d/src/life.ts#moveTo",
    "hub/scripts/tower3d-characters.ts",
    "hub/scripts/ual.ts#retargetUal",
    "hub/renderers/tower3d/src/contract.ts#UAL_CLIPS",
    "hub/renderers/tower3d/src/desk.ts#seatedPose",
    "hub/renderers/tower3d/src/life.ts#arrivalPose",
    "hub/renderers/tower3d/src/life.ts#leaverPose",
    "hub/renderers/tower3d/src/rig.ts#seatedness",
    "hub/renderers/tower3d/src/life.ts#headingAt",
    "hub/renderers/tower3d/kaykit/Characters/README.md",
    "hub/renderers/tower3d/src/rig.ts#loadCast",
    "hub/renderers/tower3d/src/rig.ts#pose",
    "hub/renderers/tower3d/src/rig.ts#wearSkinned",
    "hub/renderers/tower3d/src/rig.ts#wearModel",
    "hub/renderers/tower3d/src/wardrobe.ts#lookOf",
    "hub/renderers/tower3d/src/wardrobe.ts#Wardrobe",
    "hub/renderers/tower3d/src/wardrobe.ts#fitFrom",
    "hub/renderers/tower3d/src/wardrobe.ts#FIT_PRECEDENCE",
    "hub/renderers/tower3d/src/wardrobe.ts#formatWardrobe",
    "hub/renderers/tower3d/src/catalogue.ts#catalogueOf",
    "hub/renderers/tower3d/src/avatar.ts#fitted",
    "hub/renderers/tower3d/src/closet.ts#WARDROBE",
    "hub/renderers/tower3d/wardrobe.json",
    "hub/test/wardrobe.test.ts",
    "hub/renderers/tower3d/src/avatar.ts#avatar",
    "hub/renderers/tower3d/src/avatar.ts#seatedAt",
    "hub/renderers/tower3d/src/rig.ts#seatOf",
    "hub/renderers/tower3d/src/contract.ts#CLIPS",
    "hub/renderers/tower3d/src/contract.ts#KAYKIT",
    "hub/renderers/tower3d/src/contract.ts#bodyOf",
    "hub/renderers/tower3d/src/contract.ts#COLOURWAYS",
    "hub/renderers/tower3d/src/rig.ts#RIG_SCALES",
    "hub/renderers/tower3d/src/wardrobe.ts#rigOfLook",
    "hub/renderers/tower3d/src/wardrobe.ts#STAFF",
    "hub/renderers/tower3d/src/wardrobe.ts#lookOfWorker",
    "hub/renderers/tower3d/src/contract.ts#ADVENTURER_PARTS",
    "hub/renderers/tower3d/models/bot.py",
    "hub/renderers/tower3d/src/desk.ts#poseDesk",
    "hub/renderers/tower3d/src/desk.ts#poseRigs",
    "hub/renderers/tower3d/src/life.ts#walkPose",
    "hub/renderers/tower3d/src/party.ts#poseGuest",
    "hub/test/models.test.ts",
    "hub/renderers/tower3d/src/contract.ts#SLOTS",
    "hub/renderers/tower3d/parts/README.md",
    "hub/renderers/tower3d/parts/build.py",
    "hub/renderers/tower3d/parts/export.py",
    "hub/scripts/tower3d-parts.ts",
    "hub/renderers/tower3d/src/hashed.ts#rendezvous",
    "hub/renderers/tower3d/src/hashed.ts#weighted",
    "hub/test/rendezvous.test.ts",
    "hub/renderers/tower3d/src/contract.ts#CLANKER_FAMILY",
    "hub/renderers/tower3d/src/contract.ts#CLANKER_PROPS",
    "hub/renderers/tower3d/src/rig.ts#shapeRig",
    "hub/renderers/tower3d/kaykit/Characters/clanker-family.json",
    "hub/renderers/tower3d/src/layout.ts#walkway"
  ],
  "links": [
    {
      "to": "office-kaykit",
      "verb": "uses",
      "carries": "the vendored KayKit folder, its characters beside the office's Bits"
    },
    {
      "to": "tower3d-door",
      "verb": "uses",
      "carries": "the stepped sim clock every pose is read from"
    }
  ]
}
---
**Problem.** Workers made of rigid parts moved by code could not sit, type, walk or dance the way the KayKit office
around them looked, and every new motion was hand-written trigonometry.

**Why.** KayKit's `Rig_Medium` fits the office: the same artist and atlas technique, a skeleton with hand slots, and
many CC0 clips. Characters on one skeleton mix their parts through slots, so variety is data, and a pose read from sim
time keeps `?stepped` frames identical ([[tower3d-door]]).

**How.**
- Assets. [`tower3d-characters.ts`](ref:hub/scripts/tower3d-characters.ts) packs only the parts the contract names
  ([`KAYKIT`](ref:hub/renderers/tower3d/src/contract.ts#KAYKIT), [`bodyOf`](ref:hub/renderers/tower3d/src/contract.ts#bodyOf))
  onto each rig's one skeleton, with the contract's [`CLIPS`](ref:hub/renderers/tower3d/src/contract.ts#CLIPS), into
  `kaykit/Characters` ([`README.md`](ref:hub/renderers/tower3d/kaykit/Characters/README.md)), refusing a character
  skinned to other joints or another bind pose. Quaternius's Universal Animation Library clips (CC0,
  [`UAL_CLIPS`](ref:hub/renderers/tower3d/src/contract.ts#UAL_CLIPS)) are baked onto Rig_Medium as `UAL_<name>` by
  [`retargetUal`](ref:hub/scripts/ual.ts#retargetUal), their sitting clips moved onto KayKit's seated hips.
- Two skeletons. Most characters are on Rig_Medium, whose parts mix on any Rig_Medium body. The Clanker is on
  Rig_Large, whose own clips hold none of the office poses, so the packer retargets Rig_Medium's clips onto it once.
  A rig carries its kind; [`RIG_SCALES`](ref:hub/renderers/tower3d/src/rig.ts#RIG_SCALES) turns its units into meters.
  The Clanker's family ([`CLANKER_FAMILY`](ref:hub/renderers/tower3d/src/contract.ts#CLANKER_FAMILY),
  [`CLANKER_PROPS`](ref:hub/renderers/tower3d/src/contract.ts#CLANKER_PROPS)) is his geometry in other colourways,
  props on his bones, and a look's `shape`, a scale per bone ([`shapeRig`](ref:hub/renderers/tower3d/src/rig.ts#shapeRig))
  applied after the mixer, since KayKit's clips key every bone's scale.
- Posed by clips. [`loadCast`](ref:hub/renderers/tower3d/src/rig.ts#loadCast) derives `Type` and cuts every clip to
  its arms or the rest, so an upper-body clip plays over a seated one. A worker is a copy of the bones and a mixer;
  [`pose`](ref:hub/renderers/tower3d/src/rig.ts#pose) sets it every frame from layers that are a function of sim time
  and the card, on the levels drawn only ([[tower3d-levels]]). [`poseDesk`](ref:hub/renderers/tower3d/src/desk.ts#poseDesk)
  (the card picks the layers, [`seatedPose`](ref:hub/renderers/tower3d/src/desk.ts#seatedPose)),
  [`walkPose`](ref:hub/renderers/tower3d/src/life.ts#walkPose) and [`poseGuest`](ref:hub/renderers/tower3d/src/party.ts#poseGuest)
  pick them. A layer played `once` starts from a moment on the board (a failure's `enteredAt`, a new subagent), so
  frames stay a function of the clock and the board.
- Sitting. KayKit's sit clips carry the body straight back onto a seat behind it, so a worker walks to stand in front
  of its chair, from the side its way comes from, and sits back while the chair comes in under it and the body is lifted
  as far as the clip's hips have travelled ([`seatedness`](ref:hub/renderers/tower3d/src/rig.ts#seatedness),
  [`arrivalPose`](ref:hub/renderers/tower3d/src/life.ts#arrivalPose), [`leaverPose`](ref:hub/renderers/tower3d/src/life.ts#leaverPose)).
  The way ([`walkway`](ref:hub/renderers/tower3d/src/layout.ts#walkway), [`moveTo`](ref:hub/renderers/tower3d/src/life.ts#moveTo)
  between desks on a level, [[whereabouts]]) is worked out in the desk's own space, so a turned desk ([[workstations]])
  changes nothing in how a worker sits. A walk's clip runs by distance over the rig's stride, so feet stay planted, and
  a walker faces the mean of its way around it ([`headingAt`](ref:hub/renderers/tower3d/src/life.ts#headingAt)), turning
  corners over a stretch.
- Seats are measured: [`seatOf`](ref:hub/renderers/tower3d/src/rig.ts#seatOf) skins each body into the seated clip's
  first frame, and [`seatedAt`](ref:hub/renderers/tower3d/src/avatar.ts#seatedAt) puts what bears on the seat and the
  back rest on the chair, so every body sits by its own mesh.
- Looks are data: `wardrobe.json`, checked by [`Wardrobe`](ref:hub/renderers/tower3d/src/wardrobe.ts#Wardrobe) as the
  bundle loads it ([`WARDROBE`](ref:hub/renderers/tower3d/src/closet.ts#WARDROBE)), over a catalogue derived from the
  files ([`catalogueOf`](ref:hub/renderers/tower3d/src/catalogue.ts#catalogueOf)): **fits**, **outfits** (named
  looks) and the **mix**. [`lookOf`](ref:hub/renderers/tower3d/src/wardrobe.ts#lookOf) hashes a session id into the
  mix; [`lookOfWorker`](ref:hub/renderers/tower3d/src/wardrobe.ts#lookOfWorker) first gives `mix.named`'s outfit to a
  worker whose callsign has that name; the roof's staff are outfits dressed by name
  ([`STAFF`](ref:hub/renderers/tower3d/src/wardrobe.ts#STAFF)). Whether a slot is worn is its own roll; which part,
  body and colour are chosen by rendezvous ([`rendezvous`](ref:hub/renderers/tower3d/src/hashed.ts#rendezvous),
  [`weighted`](ref:hub/renderers/tower3d/src/hashed.ts#weighted)), so an addition re-dresses only the workers it wins.
  [`formatWardrobe`](ref:hub/renderers/tower3d/src/wardrobe.ts#formatWardrobe) writes keys in a fixed order, so the
  dresser's saves diff by what changed ([[character-creator]]).
- A fit is `{ at, turn, scale }` over a rigid part's made placement ([`fitted`](ref:hub/renderers/tower3d/src/avatar.ts#fitted)):
  a default per part and overrides keyed by another part worn, resolved by that part's slot
  ([`FIT_PRECEDENCE`](ref:hub/renderers/tower3d/src/wardrobe.ts#FIT_PRECEDENCE),
  [`fitFrom`](ref:hub/renderers/tower3d/src/wardrobe.ts#fitFrom)), so key order never matters.
- Drawing. [`avatar`](ref:hub/renderers/tower3d/src/avatar.ts#avatar) merges the skinned parts of one atlas into one
  mesh per worker ([`wearSkinned`](ref:hub/renderers/tower3d/src/rig.ts#wearSkinned)) and skins the bot's rigid parts
  (`models/bot.py`) to their bones at load ([`wearModel`](ref:hub/renderers/tower3d/src/rig.ts#wearModel)).
- Parts made by hand ([`parts/README.md`](ref:hub/renderers/tower3d/parts/README.md)). `parts/parts.blend` is
  committed as the parts' source; `npm run tower3d:parts` exports it and
  [`tower3d-parts.ts`](ref:hub/scripts/tower3d-parts.ts) writes `parts/parts.glb` in `adventurers.glb`'s terms,
  refusing with the fix what the runtime could not wear. A part's name starts with its slot
  ([`SLOTS`](ref:hub/renderers/tower3d/src/contract.ts#SLOTS)), and every slot's pool holds the pack's parts and the
  made ones, so a part reaches looks with no code.

**Alternatives considered.**
- *Other character kits* (Kenney's, Quaternius'): a rig with no elbows or knees, or another skeleton and look beside
  KayKit's office.
- *Retargeting at load*: the packer does it once, and the runtime keeps one path, a skeleton and its clips.
- *Quaternius's bodies beside its clips*: far taller proportions than KayKit's, no clothes in the free set and many
  more triangles; its clips are taken alone.
- *Picking by index* into a pool, palette or list of bodies: every addition re-dresses most workers. A `none`
  candidate in the rendezvous would shrink the bare share with each part added; a roll of its own keeps both stable.
- *Fits derived from each head's measured shape*: a rule right for one piece is wrong for the next, and cannot be
  adjusted by eye.
- *Copies of a body per variant, or bone rest scales in the file*: a rest scale vanishes under any clip; colourways and
  a shape after the mixer carry the difference.

**Consequences.** `npm test` checks the GLBs hold the contract's parts, bones and clips, that `parts.glb`'s parts are
named after a slot, painted in an atlas and on the clips' bones or the pack's skin, and the wardrobe and rendezvous
rules ([`models.test.ts`](ref:hub/test/models.test.ts), [`wardrobe.test.ts`](ref:hub/test/wardrobe.test.ts),
[`rendezvous.test.ts`](ref:hub/test/rendezvous.test.ts)). A new character joins the mix by a weight in `wardrobe.json`.
