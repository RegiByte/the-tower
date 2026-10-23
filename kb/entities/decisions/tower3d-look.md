---
{
  "type": "decision",
  "name": "Tower 3D's look: a procedural city and shell, and lighting as a setting",
  "summary": "The city, the building's shell and its roof plant are geometry generated in TypeScript at load (exterior/), always drawn. The lighting (a sun that follows the clock and casts shadows with the interior's own ceiling light, contact shadows under your level, and the night's bloom on what is tagged to glow) is one setting in Tower 3D's settings popover, on by default, kept in tower.store and read before the page loads, so a change applies on reload. Off, the building and city are lit by the outside's hemisphere, sun and ambient alone.",
  "in": "tower3d",
  "status": "accepted",
  "date": "2026-10-10",
  "reviewed": "2026-10-23",
  "refs": [
    "hub/renderers/tower3d/src/boot.ts",
    "hub/renderers/tower3d/src/light/setting.ts#startLighting",
    "hub/renderers/tower3d/src/light/setting.ts#LIGHTING_KEY",
    "hub/renderers/tower3d/src/light/setting.ts#lightingSection",
    "hub/renderers/tower3d/src/light/rig.ts#riseRig",
    "hub/renderers/tower3d/src/light/rig.ts#rigFrame",
    "hub/renderers/tower3d/src/light/rig.ts#rigRamp",
    "hub/renderers/tower3d/src/light/contact.ts#contactShadows",
    "hub/renderers/tower3d/src/light/bloom.ts#bloom",
    "hub/renderers/tower3d/src/toon.ts#glows",
    "hub/renderers/tower3d/src/main.ts#lightFrame",
    "hub/renderers/tower3d/src/exterior/geo.ts",
    "hub/renderers/tower3d/src/exterior/skyline.ts#skyline",
    "hub/renderers/tower3d/src/exterior/neighbourhood.ts#neighbourhood",
    "hub/renderers/tower3d/src/exterior/neighbourhood.ts#inNeighbourhood",
    "hub/renderers/tower3d/src/exterior/shell.ts#frame",
    "hub/renderers/tower3d/src/exterior/roof.ts#roofPlant",
    "hub/renderers/tower3d/src/exterior/windows.ts#keepHours",
    "hub/renderers/tower3d/src/exterior/windows.ts#keepsHours",
    "hub/renderers/tower3d/src/exterior/beacons.ts#beacons",
    "hub/renderers/tower3d/src/exterior/clouds.ts#clouds",
    "hub/renderers/tower3d/src/outside.ts#buildings",
    "hub/renderers/tower3d/src/world.ts#plantOnRoof"
  ]
}
---
**Problem.** A building and city worth looking at through the day, generated rather than modelled, and a light rig
with shadows and a night bloom. The lighting costs GPU time, so anyone it annoys, or whose machine it slows, needs a
way to turn it off.

**How.**
- *The exterior is always drawn.* [`exterior/`](ref:hub/renderers/tower3d/src/exterior/geo.ts) is geometry as
  plain data, built by pure functions and turned into one BufferGeometry per material. The city
  ([`skyline`](ref:hub/renderers/tower3d/src/exterior/skyline.ts#skyline), drawn by
  [`buildings`](ref:hub/renderers/tower3d/src/outside.ts#buildings)) is tiered towers seeded per site. A building
  leaves out what is thinner than a pixel from the nearest a viewer at the glass comes to it: drawn thinner, it
  blinks as the view moves. Behind the roof's big screen the city gives way to a neighbourhood of houses and street
  trees ([`neighbourhood`](ref:hub/renderers/tower3d/src/exterior/neighbourhood.ts#neighbourhood)), which the city
  skips ([`inNeighbourhood`](ref:hub/renderers/tower3d/src/exterior/neighbourhood.ts#inNeighbourhood)). The shell
  ([`frame`](ref:hub/renderers/tower3d/src/exterior/shell.ts#frame)) is mullions, spandrels and a coping, a floor's
  glass the height of its storey ([[floor-plan]]); the roof plant
  ([`roofPlant`](ref:hub/renderers/tower3d/src/exterior/roof.ts#roofPlant)) is placed by
  [`plantOnRoof`](ref:hub/renderers/tower3d/src/world.ts#plantOnRoof).
- *The city follows the clock*, every part a pure function of the wall clock's hour (`?at`) or sim time
  (`?stepped`), so frames repeat. Each lit window keeps office hours hashed from where it stands
  ([`keepHours`](ref:hub/renderers/tower3d/src/exterior/windows.ts#keepHours)); the hours ride on its vertices and
  the window material compares them with the hour on the GPU
  ([`keepsHours`](ref:hub/renderers/tower3d/src/exterior/windows.ts#keepsHours)). Warning lights flash on the
  tallest towers and the roof's mast ([`beacons`](ref:hub/renderers/tower3d/src/exterior/beacons.ts#beacons)),
  tagged to glow, and clouds drift overhead, placed on the GPU from sim time
  ([`clouds`](ref:hub/renderers/tower3d/src/exterior/clouds.ts#clouds)). The rig's interior light is chained after a
  material's own shader patch, so the windows keep their hours with the lighting on.
- *The lighting is one setting.* [`startLighting`](ref:hub/renderers/tower3d/src/light/setting.ts#startLighting)
  reads `tower.store` under [`LIGHTING_KEY`](ref:hub/renderers/tower3d/src/light/setting.ts#LIGHTING_KEY) (on
  unless `false`) in [`boot.ts`](ref:hub/renderers/tower3d/src/boot.ts), the bundle's entry, and only then loads
  `main.ts`. Every lighting path reads that one value, `LIT`:
  - [`riseRig`](ref:hub/renderers/tower3d/src/light/rig.ts#riseRig) takes over the outside's lights and turns on a
    sun shadow map, which [`rigFrame`](ref:hub/renderers/tower3d/src/light/rig.ts#rigFrame) fits to what is seen
    each frame; the interior's ceiling light is patched into every lit material's shader, and the toon ramp is
    [`rigRamp`](ref:hub/renderers/tower3d/src/light/rig.ts#rigRamp)'s, so a low sun shows all three bands.
  - [`contactShadows`](ref:hub/renderers/tower3d/src/light/contact.ts#contactShadows) draws your level from under its
    floor, blurred, onto the floor.
  - [`bloom`](ref:hub/renderers/tower3d/src/light/bloom.ts#bloom) draws only what is tagged with
    [`glows`](ref:hub/renderers/tower3d/src/toon.ts#glows) and adds it to the canvas, as strong as the night is dark.

  [`lightFrame`](ref:hub/renderers/tower3d/src/main.ts#lightFrame) runs the passes before the scene is drawn. With
  the camera within your level's storey (walking, seated, or flying between a desk and your eye) the sun's shadow
  fits that level and the contact shadows are drawn; anywhere else (the overview, the elevator) the sun's shadow
  fits the whole building and there are none.
- *It applies on reload.* The ramp and the shader patches are fixed as materials are made, and the shadow map is
  renderer state. The popover's section
  ([`lightingSection`](ref:hub/renderers/tower3d/src/light/setting.ts#lightingSection)) stores the choice and offers
  "Reload to apply" while the page draws something other than what was chosen. A fixture page (`?board=`) reads no
  store and takes `?lighting=off`. The lab never starts the lighting.
- *Off* lights the building and city by the outside's hemisphere, sun and ambient alone, with the three-step toon
  ramp.

**Alternatives considered.**
- *Each piece as its own setting*: the lighting's parts were tuned together (the bloom turns the rig's interior
  light off for its glow pass). One switch is what a viewer wants.
- *Switching live*: contact shadows and the bloom could, the rig can't without rebuilding every material. Half a
  switch that works live is worse than an honest reload.
- *The renderer's config `settings`* (as the cats' names are): no UI, so only someone who edits the config could
  turn it off. A viewer's choice about how the page draws is view state, and that goes through `tower.store`.
- *Screen-space AO and point lamps over your level*: a lot of GPU time for a subtle effect.

**Impact.** Tower 3D's frames on the fixture boards are drawn with the lighting on, unless `?lighting=off`.
