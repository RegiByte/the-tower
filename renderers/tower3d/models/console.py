"""The control room's console: a desk facing the video wall (-z), its operator's side and chair at +z. `tint_glow_own` takes the floor's color."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import box, cylinder, export, mat, out_path, preview, reset, slab, sphere

reset()
walnut = mat("walnut", "#5a3d2e")
frame = mat("frame", "#1c212c")
panel = mat("panel", "#232a38")
leather = mat("leather", "#3a2a26")
tint = mat("tint_glow_own", "#c792ea")
amber = mat("amber_glow", "#ffb547")
cyan = mat("cyan_glow", "#4fb3c8")

slab("pedestal", (2.0, 0.74, 0.6), (0, 0, -0.15), frame, bevel=0.03)
slab("top", (2.6, 0.07, 1.1), (0, 0.74, 0), walnut, bevel=0.03, segments=4)
box("edge", (2.4, 0.025, 0.02), (0, 0.775, 0.56), tint)
slab("deck", (1.8, 0.05, 0.5), (0, 0.81, -0.22), panel, bevel=0.015)
for i in range(8):
    for row, color in enumerate((amber, cyan, tint)):
        slab(f"button_{row}_{i}", (0.09, 0.018, 0.07), (-0.7 + i * 0.2, 0.86, -0.38 + row * 0.13), color if (i + row) % 3 else frame)
slab("chair_seat", (0.66, 0.12, 0.6), (0, 0.42, 0.95), leather, bevel=0.05, segments=4)
back = box("chair_back", (0.62, 0.62, 0.12), (0, 0.86, 1.27), leather, bevel=0.05, segments=4)
back.rotation_euler = (math.radians(-10), 0, 0)
for side in (-1, 1):
    slab(f"arm_{side}", (0.08, 0.06, 0.45), (side * 0.36, 0.62, 0.98), leather, bevel=0.02)
    slab(f"arm_post_{side}", (0.04, 0.16, 0.04), (side * 0.36, 0.46, 1.0), frame)
cylinder("lift", 0.04, 0.32, (0, 0.24, 0.95), frame, vertices=12)
for i in range(5):
    a = i * 2 * math.pi / 5
    box(f"spoke_{i}", (0.05, 0.04, 0.38), (math.sin(a) * 0.19, 0.08, 0.95 + math.cos(a) * 0.19), frame).rotation_euler = (0, 0, a)
    sphere(f"caster_{i}", 0.04, (math.sin(a) * 0.38, 0.04, 0.95 + math.cos(a) * 0.38), frame)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 0.8, 0.2), distance=4, yaw=30, pitch=30)
