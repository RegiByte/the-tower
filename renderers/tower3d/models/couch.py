"""The lobby lounge's couch, facing +z: three seats, its seat at y 0.45."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import box, cylinder, export, mat, out_path, preview, reset, slab

reset()
fabric = mat("fabric", "#b5523b")
cushion = mat("couch_cushion", "#c9654c")
wood = mat("wood", "#4a3a30")

slab("base", (2.7, 0.28, 0.95), (0, 0.1, 0), fabric, bevel=0.05)
slab("back", (2.7, 0.62, 0.24), (0, 0.38, -0.36), fabric, bevel=0.08)
for side in (-1, 1):
    slab(f"arm_{side}", (0.24, 0.32, 0.95), (side * 1.23, 0.38, 0), fabric, bevel=0.08)
    for k in (-1, 1):
        cylinder(f"foot_{side}_{k}", 0.035, 0.1, (side * 1.2, 0.05, k * 0.38), wood, vertices=10)
for i in (-1, 0, 1):
    slab(f"seat_{i}", (0.72, 0.1, 0.66), (i * 0.74, 0.38, 0.1), cushion, bevel=0.045)
    box(f"pillow_{i}", (0.6, 0.42, 0.14), (i * 0.74, 0.72, -0.2), cushion, bevel=0.06)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 0.5, 0), distance=4, yaw=30, pitch=15)
