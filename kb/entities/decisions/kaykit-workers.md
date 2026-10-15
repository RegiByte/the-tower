---
{
  "type": "decision",
  "name": "Workers as KayKit characters on KayKit's rigs, posed by clips on the sim clock",
  "summary": "Tower 3D's workers are KayKit characters (CC0) on KayKit's rigs, one skeleton per rig kind with its clips (the large rig's retargeted by the packer), posed through a mixer of their own set from sim time each frame, so stepped frames repeat. Looks are data, the wardrobe: fits, outfits and a mix that hashes each worker's id (or its callsign's name) into a body, paint and a part per slot by rendezvous. New parts are modelled by hand in a Blender kit (parts/parts.blend) and join a look's slots by their names, with no code.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-11",
  "reviewed": "2026-10-15",
  "refs": [
    "hub/scripts/tower3d-characters.ts",
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
    "hub/renderers/tower3d/kaykit/Characters/clanker-family.json"
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
**Problem.** Workers were rigid parts moved by code, a few looks and a colour. They could not sit, type, walk or
dance the way the KayKit office around them looked, and every new motion was hand-written trigonometry.

**Why.** KayKit's `Rig_Medium` fits the office: the same artist and atlas technique, a skeleton with hand slots, and
many CC0 clips. Characters built on one skeleton mix their parts through slots, so variety is data, and a pose read
from sim time keeps `?stepped` frames identical ([[tower3d-door]]).

**How.**
- Assets. [`tower3d-characters.ts`](ref:hub/scripts/tower3d-characters.ts) packs the packs' own files into
  `renderers/tower3d/kaykit/Characters` ([`README.md`](ref:hub/renderers/tower3d/kaykit/Characters/README.md)): the
  parts the contract names ([`KAYKIT`](ref:hub/renderers/tower3d/src/contract.ts#KAYKIT),
  [`bodyOf`](ref:hub/renderers/tower3d/src/contract.ts#bodyOf)) on each rig's one skeleton, the contract's
  [`CLIPS`](ref:hub/renderers/tower3d/src/contract.ts#CLIPS) per rig, each pack's licence beside them. It checks that
  every character of a rig is skinned to the same joints in the same bind pose before moving a part onto it, and
  never packs a whole pack.
- Two skeletons. Most characters are on Rig_Medium, and its parts mix on any Rig_Medium body. The Clanker is on
  Rig_Large, whose own clips hold none of the office poses, so the packer retargets Rig_Medium's onto it once. A rig
  carries its kind; `pose`, `seatedAt` and `seatOf` read that skeleton's clips and measurements, and
  [`RIG_SCALES`](ref:hub/renderers/tower3d/src/rig.ts#RIG_SCALES) turns rig units into meters. The Clanker's family
  ([`CLANKER_FAMILY`](ref:hub/renderers/tower3d/src/contract.ts#CLANKER_FAMILY),
  [`CLANKER_PROPS`](ref:hub/renderers/tower3d/src/contract.ts#CLANKER_PROPS)) is his geometry in other colourways,
  props on his bones and a look's `shape`, a scale per bone that [`shapeRig`](ref:hub/renderers/tower3d/src/rig.ts#shapeRig)
  hands to the rig and [`pose`](ref:hub/renderers/tower3d/src/rig.ts#pose) multiplies in after the mixer, since
  KayKit's clips key every bone's scale.
- One rig, posed by clips. [`loadCast`](ref:hub/renderers/tower3d/src/rig.ts#loadCast) derives `Type` (both forearms
  tapping the keyboard, from the seated clip) and cuts every clip to its arms (`:arms`) or the rest (`:rest`), so an
  upper-body clip plays over a seated one. A worker is a copy of the bones and a mixer; `pose` sets it from layers
  every frame, a function of sim time and the card, fading from the pose before over sim time. Bones are posed only
  on the levels drawn ([[tower3d-levels]]). [`poseDesk`](ref:hub/renderers/tower3d/src/desk.ts#poseDesk),
  [`walkPose`](ref:hub/renderers/tower3d/src/life.ts#walkPose) and
  [`poseGuest`](ref:hub/renderers/tower3d/src/party.ts#poseGuest) pick the layers for the desk, walking and the
  roof.
- Looks are data: `renderers/tower3d/wardrobe.json`, checked by a zod schema
  ([`Wardrobe`](ref:hub/renderers/tower3d/src/wardrobe.ts#Wardrobe)) as the bundle loads it
  ([`WARDROBE`](ref:hub/renderers/tower3d/src/closet.ts#WARDROBE)), over a catalogue of parts derived from the files
  at load ([`catalogueOf`](ref:hub/renderers/tower3d/src/catalogue.ts#catalogueOf)). Three layers: **fits**, **outfits**
  (named looks) and the **mix** (the bot's share, the bodies and their weights, colours, build and a rule per slot).
  [`lookOf`](ref:hub/renderers/tower3d/src/wardrobe.ts#lookOf) hashes a session id into it;
  [`lookOfWorker`](ref:hub/renderers/tower3d/src/wardrobe.ts#lookOfWorker) first gives `mix.named`'s outfit to a worker
  whose callsign has that name. The roof's staff are outfits dressed by name
  ([`STAFF`](ref:hub/renderers/tower3d/src/wardrobe.ts#STAFF)). Whether a worker wears something in a slot is its own
  roll; which part, bodies and colours are chosen by rendezvous ([`rendezvous`](ref:hub/renderers/tower3d/src/hashed.ts#rendezvous),
  [`weighted`](ref:hub/renderers/tower3d/src/hashed.ts#weighted)), so adding a part, a colour or a body re-dresses
  only the workers it wins. [`formatWardrobe`](ref:hub/renderers/tower3d/src/wardrobe.ts#formatWardrobe) writes keys in
  a fixed order, so the dresser's saves diff by what changed ([[character-creator]]).
- Fits are data: `{ at, turn, scale }` over a rigid part's made placement in its bone's space
  ([`fitted`](ref:hub/renderers/tower3d/src/avatar.ts#fitted), applied alike by Tower 3D and the dresser), a default
  per part and overrides when the look also wears another part, resolved by the override key's slot
  ([`FIT_PRECEDENCE`](ref:hub/renderers/tower3d/src/wardrobe.ts#FIT_PRECEDENCE),
  [`fitFrom`](ref:hub/renderers/tower3d/src/wardrobe.ts#fitFrom)), so key order never matters.
- Drawing. [`avatar`](ref:hub/renderers/tower3d/src/avatar.ts#avatar) dresses every look: the skinned parts of one
  atlas merge into one mesh per worker ([`wearSkinned`](ref:hub/renderers/tower3d/src/rig.ts#wearSkinned)); the
  bot's rigid parts (`models/bot.py`) are skinned to their bones at load
  ([`wearModel`](ref:hub/renderers/tower3d/src/rig.ts#wearModel)). Each worker carries a status light over its head.
- Parts made by hand ([`parts/README.md`](ref:hub/renderers/tower3d/parts/README.md)). `parts/parts.blend`, built once
  by [`build.py`](ref:hub/renderers/tower3d/parts/build.py), holds the rig at rest and several bodies as instances of a
  `Wardrobe` collection per slot, so a part shows on all of them. It is committed: it is the source of the parts.
  `npm run tower3d:parts` exports it ([`export.py`](ref:hub/renderers/tower3d/parts/export.py)) and
  [`tower3d-parts.ts`](ref:hub/scripts/tower3d-parts.ts) writes `parts/parts.glb` in `adventurers.glb`'s terms, refusing
  with the fix what the runtime could not wear. A part's name starts with its slot
  ([`SLOTS`](ref:hub/renderers/tower3d/src/contract.ts#SLOTS)), and every slot's pool is the pack's parts then the made
  ones, so a part reaches looks with no code.
- Seats are measured: [`seatOf`](ref:hub/renderers/tower3d/src/rig.ts#seatOf) skins each body into the seated clip's
  first frame and keeps what bears on the seat and leans on the back rest;
  [`seatedAt`](ref:hub/renderers/tower3d/src/avatar.ts#seatedAt) puts that on the chair, so every body sits by its own
  mesh.

**Alternatives considered.**
- *Other character kits* (Kenney's, Quaternius'): a rig with no elbows or knees, or another skeleton and look beside
  KayKit's office.
- *Retargeting at load*: the packer does it once, and the runtime keeps one path, a skeleton and its clips.
- *Picking by index* (into a pool, a palette, a list of bodies): every addition re-dressed most workers; rendezvous
  moves only the share it wins. A `none` candidate in the rendezvous would shrink the bare share with each part
  added; a roll of its own keeps both stable.
- *Fits derived from each head's measured shape*: a rule right for one piece is wrong for the next, and cannot be
  adjusted by eye in the dresser.
- *Copies of a body per variant, or bone rest scales in the file*: the variants share the meshes, and a rest scale
  vanishes under any clip; colourways and a shape after the mixer carry the difference.

**Consequences.** `npm test` checks the GLBs hold the contract's parts, bones and clips, and that `parts.glb`'s parts
are named after a slot, painted in an atlas and hung on the clips' bones or the pack's skin
([`models.test.ts`](ref:hub/test/models.test.ts), [`wardrobe.test.ts`](ref:hub/test/wardrobe.test.ts),
[`rendezvous.test.ts`](ref:hub/test/rendezvous.test.ts)). A new character joins the mix by a weight in
`wardrobe.json` and changes no worker until it is added.
