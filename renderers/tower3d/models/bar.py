"""The roof bar, facing +z: a counter with stools in front, a bottle shelf behind it. `strip_glow_own` takes a party color."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import box, capsule, cylinder, export, mat, out_path, preview, reset, slab

reset()
wood = mat("barwood", "#6b4a35")
top = mat("bartop", "#d8c9a8")
metal = mat("brushed", "#8a93a6")
seat = mat("stool", "#c46a4a")
strip = mat("strip_glow_own", "#ffb547")
glass = [mat(f"bottle_glow_{i}", c) for i, c in enumerate(("#5ee38f", "#ffb547", "#6cb6ff", "#ff4fa3", "#c792ea"))]

slab("counter", (4.0, 1.05, 0.7), (0, 0, 0), wood, bevel=0.03)
slab("countertop", (4.2, 0.06, 0.85), (0, 1.05, 0.05), top, bevel=0.015)
box("counter_strip", (3.9, 0.04, 0.02), (0, 0.15, 0.36), strip)
for i in range(4):
    x = -1.5 + i
    cylinder(f"stool_post_{i}", 0.03, 0.7, (x, 0.35, 0.85), metal, vertices=10)
    cylinder(f"stool_foot_{i}", 0.2, 0.03, (x, 0.015, 0.85), metal, vertices=20)
    cylinder(f"stool_seat_{i}", 0.2, 0.08, (x, 0.74, 0.85), seat, vertices=24, bevel=0.02)
slab("shelf_back", (4.0, 2.4, 0.1), (0, 0, -1.3), wood, bevel=0.02)
for k, y in enumerate((1.1, 1.65)):
    slab(f"shelf_{k}", (3.8, 0.04, 0.3), (0, y, -1.1), top)
    for i in range(12):
        c = glass[(i + k * 3) % len(glass)]
        x = -1.65 + i * 0.3
        cylinder(f"bottle_{k}_{i}", 0.05, 0.22, (x, y + 0.15, -1.1), c, vertices=12)
        cylinder(f"neck_{k}_{i}", 0.018, 0.08, (x, y + 0.3, -1.1), c, vertices=8)
box("back_strip", (3.9, 0.04, 0.02), (0, 2.3, -1.24), strip)
capsule("shaker", 0.04, 0.08, (1.4, 1.17, 0.0), metal)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 1.0, -0.2), distance=5.5, yaw=25, pitch=15)
