"""
What workers wear: each piece a pivot named `hat_*` or `face_*` at the origin, hung by the renderer on a worker's
`hat` (the top of its head) or `face` (between its eyes, on the face) anchor. `wear_own` takes a color per worker.
"""
import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(__file__))
from kit import _finish, at, box, cylinder, empty, export, mat, out_path, preview, reset, sphere, torus

reset()
cloth = mat("wear_own", "#ff6b6b")
gold = mat("gold", "#ffcc4d")
gem = mat("gem_glow", "#ff4fa3")
ink = mat("ink", "#161a24")
lens = mat("lens", "#0b0f18")
petal = mat("petal", "#fff4f8")
pollen = mat("pollen", "#ffd166")


def dome(name, radius, height, base_y, material, parent):
    """The top half of a sphere, `height` tall, its open base at `base_y`."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=(0, 0, 0))
    obj = bpy.context.object
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.scale = (1, 1, height / radius)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.location = at(0, base_y, 0)
    return _finish(obj, name, material, parent, smooth=True)


flat = (math.pi / 2, 0, 0)

beanie = empty("hat_beanie", (0, 0, 0))
dome("beanie_dome", 0.285, 0.25, -0.13, cloth, beanie)
torus("beanie_rim", 0.28, 0.045, (0, -0.12, 0), cloth, beanie, rotation=flat)

cap = empty("hat_cap", (0, 0, 0))
dome("cap_dome", 0.28, 0.21, -0.1, cloth, cap)
brim = box("cap_brim", (0.36, 0.025, 0.24), (0, -0.09, 0.3), cloth, cap, bevel=0.01)
brim.rotation_euler = (math.radians(-8), 0, 0)

crown = empty("hat_crown", (0, 0, 0))
cylinder("crown_band", 0.155, 0.09, (0, 0, 0), gold, crown, vertices=20)
for i in range(5):
    a = i / 5 * 2 * math.pi
    cylinder(f"crown_point_{i}", 0.035, 0.09, (math.sin(a) * 0.13, 0.09, math.cos(a) * 0.13), gold, crown, vertices=8, radius_top=0.0)
    sphere(f"crown_gem_{i}", 0.018, (math.sin(a) * 0.157, 0.0, math.cos(a) * 0.157), gem, crown)

bow = empty("hat_bow", (0, 0, 0))
for side in (-1, 1):
    loop = sphere(f"bow_loop_{side}", 0.06, (0.15 + side * 0.065, -0.04, 0.05), cloth, bow, scale=(1.2, 0.75, 0.5))
    loop.rotation_euler = (0, side * math.radians(15), 0)
sphere("bow_knot", 0.03, (0.15, -0.04, 0.06), cloth, bow)

flower = empty("hat_flower", (0, 0, 0))
for i in range(5):
    a = i / 5 * 2 * math.pi
    sphere(f"petal_{i}", 0.04, (-0.15 + math.cos(a) * 0.05, -0.04 + math.sin(a) * 0.05, 0.06), petal, flower, scale=(1, 1, 0.45))
sphere("flower_heart", 0.03, (-0.15, -0.04, 0.075), pollen, flower)

glasses = empty("face_glasses", (0, 0, 0))
for side in (-1, 1):
    torus(f"glasses_ring_{side}", 0.075, 0.012, (side * 0.12, 0, 0.03), ink, glasses)
box("glasses_bridge", (0.1, 0.016, 0.016), (0, 0.015, 0.03), ink, glasses)

shades = empty("face_shades", (0, 0, 0))
for side in (-1, 1):
    box(f"shades_lens_{side}", (0.16, 0.1, 0.025), (side * 0.11, 0, 0.035), lens, shades, bevel=0.03)
box("shades_bridge", (0.08, 0.02, 0.02), (0, 0.025, 0.035), lens, shades)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 0, 0), distance=1.6, yaw=30, pitch=20)
