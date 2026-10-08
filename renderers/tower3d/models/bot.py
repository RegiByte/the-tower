"""A worker: a little robot, a screen for a face and a bulb on an antenna, its seat at y 0, facing +z. Contract in src/avatar.ts."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import box, capsule, cylinder, empty, export, mat, out_path, preview, reset, sphere, torus

reset()
hue = mat("hue_own", "#7ab8ff")
shell = mat("botshell", "#d5dbe6")
joint = mat("gear", "#20242e")
screen = mat("botscreen", "#0b1020")
eyes = mat("eye_glow", "#7ff6ff")
bulb = mat("bulb_glow_own", "#ffffff")

body = empty("body", (0, 0, 0))

for side in (-1, 1):
    box(f"foot_{side}", (0.13, 0.07, 0.2), (side * 0.13, 0.035, 0.05), joint, body, bevel=0.025)
box("torso", (0.5, 0.42, 0.38), (0, 0.29, 0), hue, body, bevel=0.07, segments=4)
box("belly", (0.26, 0.14, 0.02), (0, 0.27, 0.19), shell, body, bevel=0.01)
cylinder("neck", 0.07, 0.08, (0, 0.53, 0), joint, body)

box("head", (0.5, 0.36, 0.4), (0, 0.74, 0), shell, body, bevel=0.08, segments=4)
box("screen", (0.38, 0.22, 0.02), (0, 0.74, 0.2), screen, body, bevel=0.03)
for side in (-1, 1):
    sphere(f"eye_{side}", 0.04, (side * 0.09, 0.76, 0.21), eyes, body, scale=(1, 1.3, 0.4))
    cylinder(f"bolt_{side}", 0.05, 0.05, (side * 0.26, 0.74, 0), joint, body, axis="x")
torus("mouth", 0.04, 0.008, (0, 0.71, 0.212), eyes, body, arc=math.pi, rotation=(0, 0, math.pi))

cylinder("antenna", 0.012, 0.2, (0, 1.0, 0), joint, body, vertices=8)
sphere("bulb", 0.06, (0, 1.12, 0), bulb, body)

for name, side in (("arm_L", 1), ("arm_R", -1)):
    pivot = empty(name, (side * 0.29, 0.42, 0.03), body)
    arm = capsule(f"{name}_limb", 0.05, 0.18, (0, 0, 0), joint)
    arm.parent = pivot
    arm.location = (0, -0.12, 0.0)
    arm.rotation_euler = (math.radians(78), 0, 0)
    hand = sphere(f"{name}_hand", 0.065, (0, 0, 0), hue, scale=(1, 0.8, 1.1))
    hand.parent = pivot
    hand.location = (0, -0.25, -0.03)
    if name == "arm_R":
        empty("hand_R", (0, -0.03, 0.25), pivot)

empty("hat", (0, 0.92, 0), body)
empty("face", (0, 0.76, 0.22), body).scale = (0.85, 0.85, 0.85)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 0.6, 0), distance=2.6, yaw=30, pitch=12)
