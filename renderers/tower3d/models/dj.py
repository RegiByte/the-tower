"""The roof's DJ booth, facing +z: decks, a mixer and speaker stacks. `neon_glow_own` pulses with the beat."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import box, cylinder, export, mat, out_path, preview, reset, slab

reset()
black = mat("booth", "#15181f")
metal = mat("brushed", "#8a93a6")
vinyl = mat("vinyl", "#0b0c10")
label = mat("label_glow", "#ff4fa3")
neon = mat("neon_glow_own", "#c792ea")
cone = mat("cone", "#2a2f3a")
knob = mat("knob_glow", "#5ee38f")

slab("riser", (4.2, 0.3, 2.2), (0, 0, 0), black, bevel=0.04)
slab("booth", (2.6, 1.0, 0.8), (0, 0.3, 0.2), black, bevel=0.04)
box("neon_front", (2.4, 0.06, 0.02), (0, 0.95, 0.61), neon)
box("neon_front_low", (2.4, 0.06, 0.02), (0, 0.55, 0.61), neon)
slab("top", (2.8, 0.05, 0.95), (0, 1.3, 0.2), metal, bevel=0.01)
for side in (-1, 1):
    slab(f"deck_{side}", (0.75, 0.08, 0.6), (side * 0.85, 1.35, 0.2), black, bevel=0.01)
    cylinder(f"platter_{side}", 0.27, 0.02, (side * 0.85, 1.44, 0.2), vinyl, vertices=32)
    cylinder(f"label_{side}", 0.08, 0.025, (side * 0.85, 1.445, 0.2), label, vertices=20)
    arm = box(f"tonearm_{side}", (0.03, 0.02, 0.32), (side * 0.85 + 0.24, 1.47, 0.2), metal)
    arm.rotation_euler = (0, 0, math.radians(20))
    slab(f"speaker_{side}", (0.9, 2.0, 0.8), (side * 1.75, 0.3, 0.0), black, bevel=0.03)
    for k, (y, r) in enumerate(((0.75, 0.3), (1.55, 0.3), (2.05, 0.12))):
        cylinder(f"cone_{side}_{k}", r, 0.04, (side * 1.75, 0.3 + y, 0.41), cone, axis="z", vertices=28)
        cylinder(f"ring_{side}_{k}", r * 0.35, 0.05, (side * 1.75, 0.3 + y, 0.42), neon, axis="z", vertices=20)
slab("mixer", (0.5, 0.06, 0.5), (0, 1.35, 0.2), black, bevel=0.01)
for i in range(4):
    for j in range(3):
        cylinder(f"knob_{i}_{j}", 0.025, 0.03, (-0.15 + i * 0.1, 1.42, 0.05 + j * 0.13), knob, vertices=10)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 1.0, 0), distance=5.5, yaw=25, pitch=15)
