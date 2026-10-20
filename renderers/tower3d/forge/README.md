# Forge props

A snapshot of the forge's `dist/`, copied unchanged: a kit of real-size low-poly props made for the tower in a
repository of its own, to take KayKit's place in Tower 3D over time. They are CC0 (`License.txt`).

`catalog.json` lists every prop's sidecar and how each of the three materials binds the textures in `textures/`;
`props/<category>/<name>.glb` carry the meshes, with no images. `npm run tower3d` measures the props the office
places into the renderer's kit, as the pack `forge` (ids `forge/<category>/<name>`). Replace the snapshot with a
newer `dist/`: `tsx scripts/tower3d-kit.ts vendor-forge <dist>`.
