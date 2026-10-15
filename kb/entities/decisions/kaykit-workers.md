---
{
  "type": "decision",
  "name": "Workers as KayKit characters on KayKit's rigs, posed by clips on the sim clock",
  "summary": "Tower 3D's workers are KayKit characters (CC0): the Adventurers, the Skeletons, the Series 5's Helpers, Combat Mech and Clanker, dressed from hashed parts, heads, helms, capes, gear, atlases and skin and hair colours, or the bot, whose rigid parts are skinned to Rig_Medium's bones. Rig_Medium's characters mix parts; the Clanker stands on Rig_Large, whose clips the packer retargets from Rig_Medium's. One set of KayKit clips per skeleton (plus a typing clip derived at load) poses every worker through a mixer of its own, set from sim time each frame, so stepped frames repeat. The bean and the puff retired. New parts are modelled by hand in a Blender kit (parts/parts.blend) and join a look's slots by their names, with no code.",
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
    { "to": "office-kaykit", "verb": "uses", "carries": "the vendored KayKit folder, its characters beside the office's Bits" },
    { "to": "tower3d-door", "verb": "uses", "carries": "the stepped sim clock every pose is read from" }
  ]
}
---
**Problem.** Workers were the bean, the puff and the bot: rigid parts moved by code (pivots `body`, `arm_L`,
`arm_R`), seven to ten draw calls each, three looks and a colour. They could not sit, type, walk or dance the way
the KayKit office around them looked, and every new motion was hand-written trigonometry.

**Why.** NEMO-27's research, done before the decision, found KayKit's `Rig_Medium` the best
fit: the office's own artist and atlas technique, a skeleton with hand slots, and 150+ CC0 clips. RegiByte chose
the KayKit Adventurers as the base and liked the fantasy bits showing up at random; the bot stays as a species.

**How.**
- Assets. [`tower3d-characters.ts`](ref:hub/scripts/tower3d-characters.ts) packs the packs' own files into
  `renderers/tower3d/kaykit/Characters`: `adventurers.glb` (1.1 MB), every part the contract names from the five
  Adventurers files on one skeleton with their four atlases and no clips; `rig_medium.glb` (0.45 MB), the contract's
  [`CLIPS`](ref:hub/renderers/tower3d/src/contract.ts#CLIPS) on Rig_Medium's bones; `medium.glb` (2.4 MB), the
  Skeletons' and the Series 5's Rig_Medium characters skinned to adventurers.glb's joints by name; `large.glb` (1.7 MB),
  the Clanker on his own Rig_Large skeleton, with his family's colourways and props; `rig_large.glb` (0.45 MB), Rig_Medium's clips on it. It checks that every
  character of a rig is skinned to the same joints, by name, in the same bind pose before moving a part onto the rig's
  one skeleton, splits a glowing primitive off as `<part>_Glow`, and packs only the parts the contract names, never a
  whole pack, each pack's licence beside them.
- Characters ([`KAYKIT`](ref:hub/renderers/tower3d/src/contract.ts#KAYKIT), [`bodyOf`](ref:hub/renderers/tower3d/src/contract.ts#bodyOf)).
  Every KayKit character is built alike: Body, ArmLeft, ArmRight, LegLeft, LegRight skinned, a head, and extras. The
  contract names each character beyond the Adventurers: its rig, its atlas, its head and what is drawn with it (a
  skull's jaw and glowing eyes, the Clanker's glowing eyes), extras that belong to its body (the mech's shoulders and
  wings), those that join a slot (helmets, hoods and the mage's hat as `Helm`, cloaks and capes as `Cape`, the helpers'
  hats as `Hat`, the Clanker's exhausts as `Cape`, both joined into one part by the packer or the left one alone), and
  what the body wears unless a look says otherwise (its own head; the Clanker his two exhausts). Rig_Medium's parts mix on every Rig_Medium body (a skull on a knight);
  parts made on Rig_Large only on Rig_Large's; the pieces of `models/wear.py` hang at an anchor and fit on any. A
  body's paints are its atlas's colourways ([`COLOURWAYS`](ref:hub/renderers/tower3d/src/contract.ts#COLOURWAYS): the
  Clanker's and the mech's `_Alt` textures repaint every part made in their atlas) or, for an adventurer, the four
  adventurers' atlases, the body alone as before. Only the adventurers' atlases share the swatch layout the skin and
  hair tint reads; the others draw as made.
- Two skeletons. The Clanker is on KayKit's Rig_Large: the same 23 bones, built longer (hips 2.6 times as high, upper
  arms 4 times as long), rest orientations within 3.2° of Rig_Medium's. KayKit's own Rig_Large clips are combat and
  locomotion only, so the packer retargets ours: each bone's rotations as they are, every translation moved from
  Rig_Medium's rest to the large rest by the ratio of the hips' heights. A rig carries its kind; `pose`, `seatedAt`
  and `seatOf` read that skeleton's clips and seated measurement, so no caller changed. Rig units to meters by skeleton
  ([`RIG_SCALES`](ref:hub/renderers/tower3d/src/rig.ts#RIG_SCALES)): the Clanker stands a head over a worker, his
  status light and held things scaled to keep their size in meters (Rig_Large's rest stands 3.8 units, so at 0.48 m
  a unit he is 1.8 m; at first 0.3 put him at 1.1 m, under a worker's 1.5).
- The Clanker's family. Eight variants another model generated from the Clanker's file (Sentinel, Tinker, Brute, Sir
  Clanksworth, Scout, Frostbyte, Sludge, King Bolt): his meshes vertex for vertex, each with a gradient atlas and an
  eye glow of its own, props on his bones, exhausts dropped, and bone rest scales for its proportions. None of it is
  copied as nine bodies: each atlas is a colourway of the Clanker's
  ([`CLANKER_FAMILY`](ref:hub/renderers/tower3d/src/contract.ts#CLANKER_FAMILY)), the packer reading it and its glow from
  the variant's file, and a colourway glows in its own colour (`<atlas>_glow`, the base's for a colourway without one),
  so a part's glowing companion takes the glow of the paint it is drawn in. The props are the Clanker's slot parts
  ([`CLANKER_PROPS`](ref:hub/renderers/tower3d/src/contract.ts#CLANKER_PROPS): the antennas, top hat and crown as `Hat`,
  wrench and sledgehammer as `Gear`, drill, arm cannon, beacon and canister as `Prop`), rigid, so fits and the dresser
  reach them, their glowing primitive riding them. The proportions are a look's `shape`, a scale per bone: KayKit's
  clips key every bone's scale, so a rest scale vanishes under any pose; [`shapeRig`](ref:hub/renderers/tower3d/src/rig.ts#shapeRig)
  hands them to the rig and [`pose`](ref:hub/renderers/tower3d/src/rig.ts#pose) multiplies them in after the mixer (over
  the rest where no layer keys a bone, so nothing compounds). Each variant is an outfit (paint, slots, shape; King
  Bolt's root scale is his build), and `mix.outfits.bodies` dresses every worker the mix makes a Clanker in one of the
  Clanker's outfits by rendezvous, the plain one among them. The generator's table is kept as the family's provenance
  (`kaykit/Characters/clanker-family.json`, the README says how it was made).
- One rig. [`loadCast`](ref:hub/renderers/tower3d/src/rig.ts#loadCast) parses both, derives `Type` (both forearms on
  the keyboard tapping, aimed from the seated clip's first frame) and cuts every clip to its arms (`:arms`) or the
  rest (`:rest`), so an upper-body clip plays over a seated or idle one. A worker is a copy of the bones and a mixer;
  [`pose`](ref:hub/renderers/tower3d/src/rig.ts#pose) sets it from layers, each a clip at a time and weight, every
  frame: a pose is a function of sim time and the card. The one thing a rig carries is the pose before: a pose of
  other clips fades in over it in 0.3 s of sim time (sitting down after walking in, turning from typing to waving,
  a new dance move), eased like a desk's turn, so `?stepped` still repeats. Bones are posed only on the levels
  drawn ([[tower3d-levels]]); everyone still moves where it goes on every level.
- Looks are data: the wardrobe, `renderers/tower3d/wardrobe.json`, one document checked by a zod schema
  ([`Wardrobe`](ref:hub/renderers/tower3d/src/wardrobe.ts#Wardrobe)) as the bundle loads it
  ([`WARDROBE`](ref:hub/renderers/tower3d/src/closet.ts#WARDROBE)), over a catalogue of parts derived from the files at load
  and never stored ([`catalogueOf`](ref:hub/renderers/tower3d/src/catalogue.ts#catalogueOf): the pack's, the made
  ones and `models/wear.py`'s hats and glasses, each with its slot, its attachment, skinned or rigid on a bone at its made
  placement, and its atlas; a wear piece's made placement is the top or the face of the head parts are made on, the
  Knight's, at the size that makes its beanie as wide as that head). Three layers: **fits** (below), **outfits** (named looks: body, paint, colours, build and a
  part or bare per slot, anything left out hashed), and the **mix**: the bot's share and what it wears, the outfits'
  share, the bodies, colours and build range, and a rule per slot (its chance, a `group` of exclusive slots sharing one
  roll, a `seed` it hashes under, its pool and exclusions, `unless`: bare when the look wears one of these, as the hooded
  head keeps hats and helms off). Bodies and colours are chosen by rendezvous like parts, so adding a colour recolours
  only the workers it wins. [`lookOf`](ref:hub/renderers/tower3d/src/wardrobe.ts#lookOf) hashes a session id
  into it: a bot one time in five; else maybe an outfit, the rest from the mix. The roof's bartender and DJ are outfits
  kept out of the share, dressed by name ([`STAFF`](ref:hub/renderers/tower3d/src/wardrobe.ts#STAFF)): `problems`
  reports either missing or in the mix, so the dresser locks them and Tower 3D's load names the fix (a dresser save
  that deleted the bartender once left Tower 3D drawing nothing). `mix.named` gives an outfit to the workers whose
  callsign has a name, whatever their id rolls ([`lookOfWorker`](ref:hub/renderers/tower3d/src/wardrobe.ts#lookOfWorker)):
  every CLANKER is the Clanker. The mix's `bodies` are the characters it dresses from, each with a weight
  ([`weighted`](ref:hub/renderers/tower3d/src/hashed.ts#weighted): rendezvous scored `weight / -ln(roll)`, so a body
  wins about its weight's share, and at equal weights it picks what plain rendezvous picks): a pack's parts join the
  slots' pools only while their character is one of them, so a new character changes no worker until it is added. A
  head the mix rolls is painted in one of the body's paints: adventurers swap the adventurers' heads, the skeletons
  their skulls, the helpers theirs, and the mech and the Clanker keep their own; the dresser still mixes anything by
  hand. One function,
  `avatar(models, look, wardrobe)`, dresses every look, and keeps
  each rigid part it hangs by name with its made placement (`worn`), so the dresser re-fits a part live. Saved through
  [`formatWardrobe`](ref:hub/renderers/tower3d/src/wardrobe.ts#formatWardrobe) (keys in a fixed order), the file diffs
  by what changed. The skin and hair colours are multiplied by a shader into the atlas's first two swatches.
- Fits are data, not code. Every worn piece used to hang from one anchor measured on the Knight's head, whose top is
  its hair, at one scale on every head: hats floated over bald heads (the bartender's cap), glasses stood off the face
  at the nose tip and sank into hoods, and each fix was a brute-forced script. A fit is `{ at, turn, scale }` over a
  rigid part's made placement in its bone's space, about the part's own origin
  ([`fitted`](ref:hub/renderers/tower3d/src/avatar.ts#fitted), the one function Tower 3D and the dresser apply it
  with); `fits[part]["*"]` is its default, and `fits[part][other]` overrides it on a look that also wears `other`
  (a head, an outfit, any part) or on a bot (`bot`). A look wears one part per slot, so at most one override per slot
  matches; they resolve by the slot of their key ([`FIT_PRECEDENCE`](ref:hub/renderers/tower3d/src/wardrobe.ts#FIT_PRECEDENCE):
  bot, Head, Outfit, Body, Helm, Hat, Face, Cape, Prop, Gear), field by field over `*`
  ([`fitFrom`](ref:hub/renderers/tower3d/src/wardrobe.ts#fitFrom), which also says which key set each field). The
  first pass lowers the hats onto each head's own top (each head measured in the head bone's space: the Mage's,
  Rogue's and Barbarian's 0.11 to 0.13 rig units under the Knight's hair, the hood's 0.07), squashes the beanie and cap
  a little on the lower heads, and moves the wear glasses and shades back from the nose to the eyes at 0.82 of their
  size (0.74 in the hood); the bot keeps its own placement. Fits move rigid parts only; heads and outfits are skinned.
- Draw calls. The skinned parts of one atlas merge into one mesh per worker (geometry cached per combination);
  the bot's rigid parts (`models/bot.py`, built in the rig's rest pose, a pivot per bone) are skinned to their bones
  at load, one mesh per material ([`wearModel`](ref:hub/renderers/tower3d/src/rig.ts#wearModel)). Each worker
  carries a glowing status light over its head.
- Parts made by hand ([`parts/README.md`](ref:hub/renderers/tower3d/parts/README.md)). `parts/parts.blend`, built
  once by [`build.py`](ref:hub/renderers/tower3d/parts/build.py) from `adventurers.glb`, holds the rig at rest, the
  Knight on a stage and four other bodies in a line-up as collection instances of their body and of `Wardrobe`, a
  collection per slot, so a part shows on five bodies at once and follows the rig's pose. The file is committed: it is
  the source of the parts made in it. `npm run tower3d:parts` exports `Wardrobe`
  ([`export.py`](ref:hub/renderers/tower3d/parts/export.py)) and
  [`tower3d-parts.ts`](ref:hub/scripts/tower3d-parts.ts) writes `parts/parts.glb` in `adventurers.glb`'s terms
  (its skeleton and skin, joints remapped by name, rigid parts re-hung on its bones, the atlas named by the
  material), refusing with the fix what the runtime could not wear. A part's name starts with its slot
  ([`SLOTS`](ref:hub/renderers/tower3d/src/contract.ts#SLOTS): `Head`, `Helm`, `Face`, `Cape`, `Gear`, `Prop`,
  `Outfit`); `loadCast` reads `parts.glb` beside the pack and every slot's pool is the pack's parts then the made
  ones, so a part reaches looks with no code. Whether a worker wears something in a slot is its own roll; which
part is the rendezvous of the pool ([`rendezvous`](ref:hub/renderers/tower3d/src/hashed.ts#rendezvous): the part
scoring highest for the worker), so a part added to a slot of N takes about one in N+1 of its wearers and the rest
keep theirs, whatever the order of the GLB's names. Bots wear only the hats and glasses of `models/wear.py`, at their model's own anchors. Examples to copy: round glasses, a headset, a coffee mug, a vest cut from the Knight's body keeping its
  weights.
- Poses: at the desk, `Type` while working, `Waving:arms` while asking (turned round), `Cheering:arms` while holding
  up a showing, the seated clip leaned back watching or slumped idle or failed
  ([`poseDesk`](ref:hub/renderers/tower3d/src/desk.ts#poseDesk)); `Walking_A` walking in and out; on the roof,
  dances changing every two bars on the music's beat, sitting at the bar with a beer, mingling with `Interact`.
- Seats are measured, not tuned. The seated clip puts the hips 0.4 rig units behind the rig's root, so a body is
  placed by what it sits on: [`seatOf`](ref:hub/renderers/tower3d/src/rig.ts#seatOf) skins each part's vertices
  into the clip's first frame and keeps the lowest point of what bears on the seat (hips and thighs) and the back of
  what leans on a back rest (hips, spine, chest; on Rig_Large the hips and thighs, since its characters carry their
  bulk on their backs: measured by the chest, the Clanker sat 0.5 m in front of the back rest, off the seat's front
  edge, and by the pelvis his hunch rises over the back rest); [`seatedAt`](ref:hub/renderers/tower3d/src/avatar.ts#seatedAt)
  puts that underside on the seat's top and that back against the back rest's face, or the hips over a stool's
  middle. Every body, bot or outfit sits by its own mesh, measured at its rest proportions: a shape that lengthens
  the legs lets the feet dangle lower, unmeasured. The office chair's seat and back are a `swivel` pivot
  (`models/desk.py`) turned with the worker, about the post, so a worker turned round to you stays in its chair.

**Alternatives considered.**
- *Kenney Mini Characters*: lighter, but a seven-bone rig with no elbows or knees.
- *Quaternius' animation library*: a different skeleton; its dance and talk loops are a later, retargeted slice.
  Quaternius' characters were set aside too: realistic proportions and flat materials beside KayKit's office.
- *The new characters as species beside the bot*: they share the adventurers' build, and as characters their parts
  mix (a skull on a knight, a helper's hat on a skeleton) through the same slots, with no species code.
- *Buying KayKit's Rig_Large clips*: the full animation pack holds none of the office poses (sitting, typing, waving)
  on Rig_Large; retargeted, Rig_Medium's read right on the Clanker.
- *Retargeting at load*: the packer does it once, and the runtime keeps one path, a skeleton and its clips.
- *Keeping the bot code-posed beside skinned adventurers*: two pose systems in every place a worker is drawn.
- *Typing as a per-frame code layer* (the prototype): world-space aims every frame per worker; a derived clip costs
  nothing per frame.
- *Unmerged parts*: an adventurer was six skinned meshes; merged, the busy board draws no more calls than before.
- *A far LOD (baked vertex animation)*: not needed at today's sizes (Impact).
- *Made parts merged into `adventurers.glb`*: its packer reads the packs' own files, which live outside the repo;
  a file of their own is rewritten whole on every export and never touches the pack's.
- *The slot in glTF extras, or in a list in code*: the name is what the Outliner, the contract test and the runtime
  all read; a list would have to be edited for every part.
- *A rig per body in the `.blend`*: a part would need copying onto each; instances of `Wardrobe` show it on all.
- *A `none` candidate in each slot's rendezvous* (TURING-72's first suggestion): at equal weight the bare share
  shrinks with every part added (1 in N+1); weighted to hold it, its weight changes with N and moves workers. A roll
  of its own for wearing keeps both stable.
- *Fits derived from each head's measured shape* (no data): a rule good for one piece (a dome on the top) is wrong for
  the next (a bow on the side, a crown in the hair), and a measured rule can't be adjusted by eye in the dresser.
- *Override priority by the file's key order*: formatters, agents and the dresser reorder keys; precedence by slot is
  order-free, and `formatWardrobe` writes a fixed order so a save diffs by what changed.
- *Hats in the `Helm` slot*: a helm covers the head and lifts the status light, a hat sits on it; one roll group keeps
  them exclusive.
- *The wardrobe in the config or a collection*: it is the project's art, versioned with the parts it names, and
  Tower 3D embeds it at build time; one repo file is what the dresser saves.
- *Palettes picked by index*: adding a colour or a body recoloured most workers; rendezvous re-dresses only the
  share it wins.
- *Fitting the old wear to each worn head's bounding box* (the bean's rule): beards and hair stretch the box, so
  pieces sank or floated per head, and it assumed a 0.36 head where the pieces fit a 0.56 one, so on KayKit heads
  everything worn was drawn nearly twice its size.
- *Picking by index into the pool* (the first cut): every part added re-dressed most of a slot's wearers.
- *Every new character at the adventurers' weight*: seven of the busy board's twelve desks turned to new characters,
  drowning the adventurers; weights keep them a share RegiByte tunes.
- *Heads mixed across characters on the floor*: a skeleton's body under a human head and a knight's helmet read as a
  glitch more than a look; mixing across characters stays a choice made by hand in the dresser.
- *The Clanker's family as nine copies of his geometry* (+13 MB): the variants share his meshes vertex for vertex;
  only atlases, glows, props and bone scales differ, each of which the look already models or now does.
- *Bone rest scales in the file*: KayKit's clips key every bone's scale, so a pose would undo them; a shape applied
  after the mixer survives every clip.
- *Blender's export as the runtime's file*: its skin orders joints its own way; normalizing keeps one skeleton and
  lets skinned made parts merge with the pack's into one mesh.

**Impact.** On `?board=busy&seed=1` (stepped, lit): draw calls 578 → 574 on a floor, 1272 → 1212 in the overview,
468 → 466 on the roof; frame time on a floor 3.5 → 4.4 ms (medians of three, the same afternoon), of which posing
only the levels drawn won back 0.4 ms. A reviewer sits 1.2 m beside its author and a fork's twin 1.05 m, clear of
the wider bodies; seated heads top about 1.75 m, over the 1.6 m eye, so from behind a worker what lies in front of it on
the desk is aimed past its head, not through it. Every worker looks different from before, so `tool:frames` shows every stage with a worker
changed. `npm test` checks both GLBs hold the contract's parts, bones and clips, and that `parts.glb`'s parts are named
after a slot, painted in an atlas and hung on the clips' bones or the pack's skin. The repo grew by 1.1 MB (1.5 MB of
characters in, the bean and the puff out), and the kit by 1.2 MB (`parts.blend` 1 MB, `parts.glb` 0.13 MB with the
examples).

The Skeletons, Helpers, Combat Mech and Clanker (2026-10-12) grew the repo and Tower 3D's bundle by 4.4 MB of
characters (most of it geometry: the Clanker alone is 17k triangles, three times a worker; his atlas is 0.5 MB) and
changed no frame of the fixture boards (`tool:frames`: identical on all eight) until they join the mix.
