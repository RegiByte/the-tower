"""
A high-wing single-engine plane facing +z, its wheels on y 0: an 11 m wing, 9 m nose to tail. `prop` spins about
z at the nose; `strobe` holds the white strobes the renderer blinks. Its left wingtip (+x) glows red, its right green.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import box, cylinder, empty, export, mat, out_path, preview, reset

SPAN, NOSE_Z, TAIL_Z, WING_Y = 11.0, 3.9, -5.1, 2.4

reset()
paint = mat("planebody", "#e6e3da")
trim = mat("planetrim", "#2b3f5c")
red = mat("navred_glow", "#ff3a2a")
green = mat("navgreen_glow", "#3aff7a")
white = mat("strobe_glow", "#ffffff")

box("fuselage", (1.2, 1.4, 5.0), (0, 1.55, 0.6), paint, bevel=0.25, segments=3)
box("tailboom", (0.6, 0.8, 3.4), (0, 1.85, -3.4), paint, bevel=0.15, segments=2)
cylinder("cowling", 0.62, 0.8, (0, 1.5, 3.3), trim, axis="z", vertices=20)
cylinder("spinner", 0.28, 0.4, (0, 1.5, 3.8), paint, axis="z", vertices=16, radius_top=0.05)
box("windows", (1.24, 0.45, 1.8), (0, 2.0, 1.0), trim, bevel=0.08)
box("stripe", (1.24, 0.14, 5.2), (0, 1.3, 0.2), trim)
box("wing", (SPAN, 0.18, 1.6), (0, WING_Y, 0.6), paint, bevel=0.06)
for side in (-1, 1):
    strut = box(f"strut_{side}", (0.08, 2.4, 0.12), (side * 1.6, 1.65, 0.6), trim)
    strut.rotation_euler = (0, side * math.radians(57), 0)
    box(f"leg_{side}", (0.1, 0.7, 0.12), (side * 1.0, 0.6, 0.2), trim)
    cylinder(f"wheel_{side}", 0.32, 0.22, (side * 1.15, 0.32, 0.2), trim, axis="x", vertices=16)
box("nose_leg", (0.1, 0.8, 0.1), (0, 0.6, 2.9), trim)
cylinder("nose_wheel", 0.26, 0.18, (0, 0.26, 2.9), trim, axis="x", vertices=16)
box("stabilizer", (3.8, 0.12, 1.0), (0, 1.95, -4.6), paint, bevel=0.04)
box("fin", (0.12, 1.7, 1.3), (0, 2.95, -4.6), trim, bevel=0.04)
box("navred", (0.12, 0.16, 0.3), (SPAN / 2 + 0.06, WING_Y, 0.9), red)
box("navgreen", (0.12, 0.16, 0.3), (-SPAN / 2 - 0.06, WING_Y, 0.9), green)

prop = empty("prop", (0, 1.5, NOSE_Z))
box("blade", (0.18, 2.3, 0.05), (0, 1.5, NOSE_Z), trim, parent=prop)
strobe = empty("strobe", (0, 0, 0))
for side in (-1, 1):
    box(f"strobe_{side}", (0.1, 0.1, 0.18), (side * (SPAN / 2 + 0.06), WING_Y, 0.25), white, parent=strobe)
box("strobe_tail", (0.12, 0.14, 0.14), (0, 3.85, TAIL_Z + 0.1), white, parent=strobe)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 1.8, -0.4), distance=15, yaw=40, pitch=22)
