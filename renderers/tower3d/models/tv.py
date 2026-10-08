"""A TV on a low cabinet, facing +z: its picture is the renderer's, 1.3 x 0.75 centered at y 1.45, z 0.05."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import box, cylinder, export, mat, out_path, preview, reset, slab

reset()
body = mat("tvbody", "#15181f")
cabinet = mat("cabinet", "#4a3a30")
metal = mat("brushed", "#8a93a6")
slab("cabinet", (1.45, 0.5, 0.42), (0, 0.06, 0), cabinet, bevel=0.02)
for side in (-1, 1):
    cylinder(f"foot_{side}", 0.03, 0.06, (side * 0.6, 0.03, 0), metal, vertices=10)
    box(f"door_seam_{side}", (0.005, 0.4, 0.005), (side * 0.0025, 0.31, 0.212), body)
    cylinder(f"knob_{side}", 0.015, 0.02, (side * 0.06, 0.31, 0.22), metal, vertices=10, axis="z")
slab("stand", (0.36, 0.02, 0.2), (0, 0.56, 0), metal, bevel=0.006)
slab("neck", (0.06, 0.5, 0.04), (0, 0.56, -0.02), metal)
box("bezel", (1.38, 0.83, 0.05), (0, 1.45, 0.02), body, bevel=0.012)
box("speaker", (1.2, 0.05, 0.06), (0, 1.0, 0.02), body, bevel=0.02)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 0.9, 0), distance=3, yaw=30, pitch=12)
