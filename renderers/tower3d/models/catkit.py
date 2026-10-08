"""
The tower's cats share one body, sitting and facing +z; each cat's script paints its own coat on it.

`cat(coat)` builds the body and returns its pivots: `head`, `tail`, `paw_L` and `paw_R` are moved by the renderer.
A coat names its colors; `band` and `stroke` lay markings on the body's ellipsoids.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from kit import at, box, capsule, cylinder, empty, mat, sphere

BODY = dict(radius=0.13, center=(0, 0.13, -0.02), scale=(0.9, 1.05, 1.15))
SKULL = dict(radius=0.09, center=(0, 0.3, 0.05), scale=(1.1, 0.95, 1))
TAIL = [(0.028 - i * 0.002, (0, 0.05 + i / 5 * 0.18 + math.sin(i / 5 * 2.5) * 0.04, -0.17 - math.sin(i / 5 * 2) * 0.1)) for i in range(6)]


def cat(coat):
    """
    The body in `coat`'s colors, keyed by part: `fur`, `belly` (the chest), `muzzle`, `paws`, `eye`, `nose`,
    `whiskers`, `collar`, plus any of the coat's own. `ears` (right, left) and `tail` (base to tip, six balls) name
    those keys. Returns the pivots by name.
    """
    paint = lambda key: mat("collar_glow" if key == "collar" else key, coat[key])
    fur = paint("fur")
    ink = mat("ink", "#161a24")

    sphere("body", BODY["radius"], BODY["center"], fur, scale=BODY["scale"])
    sphere("chest", 0.08, (0, 0.13, 0.085), paint("belly"), scale=(0.9, 1.2, 0.7))
    for side in (-1, 1):
        sphere(f"haunch_{side}", 0.075, (side * 0.08, 0.07, -0.06), fur, scale=(0.8, 1, 1.2))
    cylinder("collar", 0.06, 0.02, (0, 0.235, 0.03), paint("collar"), vertices=16)

    paws = {}
    for side, name in ((-1, "paw_R"), (1, "paw_L")):
        paw = empty(name, (side * 0.045, 0.13, 0.1))
        capsule(f"{name}_leg", 0.025, 0.1, (side * 0.045, 0.06, 0.1), paint("paws"), paw)
        paws[name] = paw

    head = empty("head", (0, 0.27, 0.04))
    sphere("skull", SKULL["radius"], SKULL["center"], fur, head, scale=SKULL["scale"])
    sphere("muzzle", 0.04, (0, 0.28, 0.125), paint("muzzle"), head, scale=(1.3, 0.8, 0.8))
    sphere("nose", 0.012, (0, 0.295, 0.16), paint("nose"), head)
    for side, ear in zip((-1, 1), coat["ears"]):
        cone = cylinder(f"ear_{side}", 0.035, 0.07, (side * 0.055, 0.39, 0.04), paint(ear), head, vertices=4, radius_top=0.0)
        cone.rotation_euler = (0, math.radians(side * -15), 0)
        sphere(f"eye_{side}", 0.017, (side * 0.035, 0.315, 0.135), paint("eye"), head, scale=(1, 1.3, 0.6))
        sphere(f"pupil_{side}", 0.008, (side * 0.035, 0.315, 0.143), ink, head, scale=(0.6, 1.6, 0.5))
        for k in (-1, 1):
            w = box(f"whisker_{side}_{k}", (0.09, 0.003, 0.003), (side * 0.08, 0.285 + k * 0.008, 0.13), paint("whiskers"), head)
            w.rotation_euler = (0, math.radians(side * 12), math.radians(side * k * 8))

    tail = empty("tail", (0, 0.05, -0.15))
    for i, ((radius, center), key) in enumerate(zip(TAIL, coat["tail"])):
        sphere(f"tail_{i}", radius, center, paint(key), tail)

    return dict(head=head, tail=tail, **paws)


def band(name, part, material, normal, offset, width, floor, parent=None, lift=1.006):
    """A stripe on ellipsoid `part`: a skin just over it, kept between two planes along `normal` and above height `floor`."""
    radius, center, scale = part["radius"], part["center"], part["scale"]
    skin = sphere(name, radius * lift, center, material, parent, scale=scale, segments=64)
    n = at(*normal).normalized()
    bm = bmesh.new()
    bm.from_mesh(skin.data)
    for co, clear_inner in ((n * (offset - width / 2), True), (n * (offset + width / 2), False)):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=n, clear_inner=clear_inner, clear_outer=not clear_inner)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=at(0, floor - center[1], 0), plane_no=at(0, 1, 0), clear_inner=True)
    bm.to_mesh(skin.data)
    bm.free()
    return skin


def stroke(name, xy, part, length, tilt, material, parent, breadth=0.13):
    """A flat ellipse lying on the front of ellipsoid `part` at (x, y), its long axis tilted `tilt` degrees from up."""
    x, y = xy
    cx, cy, cz = part["center"]
    rx, ry, rz = (part["radius"] * s for s in part["scale"])
    z = cz + rz * math.sqrt(1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2)
    normal = Vector(((x - cx) / rx**2, (y - cy) / ry**2, (z - cz) / rz**2)).normalized()
    up = Vector((math.sin(math.radians(tilt)), math.cos(math.radians(tilt)), 0))
    up = (up - normal * up.dot(normal)).normalized()
    side = up.cross(normal)
    thickness = 0.004
    surface = Vector((x, y, z)) - normal * thickness * 0.3
    obj = sphere(name, 1, (0, 0, 0), material, scale=(length * breadth, length / 2, thickness))
    basis = Matrix((at(*side), at(*up), at(*normal))).transposed()
    renderer_to_blender = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1))).inverted()
    obj.matrix_world = Matrix.Translation(at(*surface)) @ basis.to_4x4() @ renderer_to_blender
    bpy.context.view_layer.update()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def finish(out, shot):
    """Exports the cat, and renders its preview from the front-right."""
    from kit import export, preview

    export(out)
    if shot:
        preview(shot, target=(0, 0.2, 0), distance=0.9, yaw=40, pitch=12)
