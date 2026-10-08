"""A shell terminal facing +z: its screen is the renderer's, 1.4 x 0.86 centered at y 1.62, z 0.17."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import box, export, mat, out_path, preview, reset, slab

reset()
shell = mat("kioskbody", "#232b3c")
dark = mat("kioskdark", "#11151f")
keys = mat("kioskkeys", "#3a4256")
slab("plinth", (1.0, 0.08, 0.6), (0, 0, 0), dark, bevel=0.02)
slab("column", (0.5, 1.0, 0.4), (0, 0.08, -0.05), shell, bevel=0.04, segments=4)
box("bezel", (1.52, 0.98, 0.1), (0, 1.62, 0.1), dark, bevel=0.03, segments=4)
box("hood", (1.52, 0.05, 0.22), (0, 2.13, 0.18), shell, bevel=0.015)
shelf = box("keyboard_shelf", (0.9, 0.04, 0.32), (0, 1.07, 0.26), shell, bevel=0.012)
shelf.rotation_euler = (math.radians(12), 0, 0)
keyboard = box("keyboard", (0.7, 0.025, 0.2), (0, 1.1, 0.27), keys, bevel=0.006)
keyboard.rotation_euler = (math.radians(12), 0, 0)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 1.1, 0), distance=3.4, yaw=30, pitch=10)
