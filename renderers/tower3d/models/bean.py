"""A worker: a bean in a headset with a status bulb on an antenna, its seat at y 0, facing +z. Contract in src/avatar.ts."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import at, box, capsule, cylinder, empty, export, mat, out_path, preview, reset, sphere, torus

reset()
skin = mat("hue_own", "#7ab8ff")
white = mat("eye", "#ffffff")
ink = mat("ink", "#161a24")
gear = mat("gear", "#20242e")
cushion = mat("cushion", "#3a4256")
bulb = mat("bulb_glow_own", "#ffffff")

body = empty("body", (0, 0, 0))

torso = capsule("torso", 0.3, 0.34, (0, 0.47, 0), skin, body)
for v in torso.data.vertices:
    height = (v.co.z + 0.47) / 0.94
    widen = 1 + 0.14 * (1 - height) ** 2
    v.co.x *= widen
    v.co.y *= widen

for side in (-1, 1):
    eye = sphere(f"eye_{side}", 0.1, (side * 0.12, 0.66, 0.24), white, body, scale=(1, 1.15, 0.55))
    sphere(f"pupil_{side}", 0.05, (side * 0.12, 0.65, 0.29), ink, body, scale=(1, 1.1, 0.5))
    sphere(f"glint_{side}", 0.016, (side * 0.12 + 0.018, 0.68, 0.31), white, body)
    sphere(f"cheek_{side}", 0.045, (side * 0.19, 0.53, 0.25), mat("cheek", "#ff8fb0"), body, scale=(1, 0.6, 0.3))

torus("smile", 0.05, 0.013, (0, 0.545, 0.305), ink, body, arc=math.pi, rotation=(0, 0, math.pi))

torus("headset_band", 0.33, 0.022, (0, 0.66, 0), gear, body, arc=math.pi)
for side in (-1, 1):
    cylinder(f"ear_{side}", 0.075, 0.07, (side * 0.32, 0.66, 0), gear, body, axis="x", bevel=0.01)
    cylinder(f"ear_pad_{side}", 0.06, 0.02, (side * 0.285, 0.66, 0), cushion, body, axis="x")
boom = cylinder("mic_boom", 0.011, 0.2, (0.29, 0.58, 0.12), gear, body, vertices=8, axis="z")
boom.rotation_euler = (0, 0, math.radians(-28))
sphere("mic", 0.026, (0.25, 0.53, 0.22), gear, body)

cylinder("antenna", 0.012, 0.24, (0, 1.06, 0), gear, body, vertices=8)
sphere("bulb", 0.065, (0, 1.2, 0), bulb, body)

for name, side in (("arm_L", 1), ("arm_R", -1)):
    pivot = empty(name, (side * 0.3, 0.5, 0.05), body)
    arm = capsule(f"{name}_limb", 0.06, 0.2, (0, 0, 0), skin)
    arm.parent = pivot
    arm.location = (0, -0.13, 0.0)
    arm.rotation_euler = (math.radians(78), 0, 0)
    hand = sphere(f"{name}_hand", 0.07, (0, 0, 0), skin, scale=(1, 0.8, 1.1))
    hand.parent = pivot
    hand.location = (0, -0.27, -0.03)
    if name == "arm_R":
        empty("hand_R", (0, -0.03, 0.27), pivot)

empty("hat", (0, 0.94, 0), body)
empty("face", (0, 0.66, 0.28), body)

for side in (-1, 1):
    sphere(f"foot_{side}", 0.085, (side * 0.13, 0.04, 0.2), skin, body, scale=(1, 0.55, 1.4))

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 0.6, 0), distance=2.6, yaw=30, pitch=12)
