"""A worker: a round puff with a status bulb on a curled stalk, its seat at y 0, facing +z. Contract in src/avatar.ts."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import capsule, cylinder, empty, export, mat, out_path, preview, reset, sphere, torus

reset()
skin = mat("hue_own", "#7ab8ff")
white = mat("eye", "#ffffff")
ink = mat("ink", "#161a24")
gear = mat("gear", "#20242e")
bulb = mat("bulb_glow_own", "#ffffff")

body = empty("body", (0, 0, 0))

sphere("puff", 0.32, (0, 0.33, 0), skin, body, scale=(1.12, 0.92, 1.0), segments=32)
for i, (x, z) in enumerate(((-0.08, 0.04), (0.0, -0.02), (0.08, 0.04))):
    sphere(f"tuft_{i}", 0.06, (x, 0.62, z), skin, body, scale=(1, 1.3, 1))

for side in (-1, 1):
    sphere(f"eye_{side}", 0.085, (side * 0.12, 0.4, 0.27), white, body, scale=(1, 1.2, 0.5))
    sphere(f"pupil_{side}", 0.045, (side * 0.12, 0.39, 0.31), ink, body, scale=(1, 1.15, 0.5))
    sphere(f"glint_{side}", 0.014, (side * 0.12 + 0.016, 0.42, 0.33), white, body)
torus("smile", 0.04, 0.011, (0, 0.28, 0.315), ink, body, arc=math.pi, rotation=(0, 0, math.pi))

torus("stalk", 0.09, 0.012, (-0.09, 0.66, -0.04), gear, body, arc=math.pi / 2, rotation=(0, 0, 0))
cylinder("stalk_top", 0.012, 0.14, (-0.09, 0.82, -0.04), gear, body, vertices=8)
cylinder("lamp_cap", 0.05, 0.03, (-0.09, 0.9, -0.04), gear, body, bevel=0.006)
sphere("bulb", 0.065, (-0.09, 0.96, -0.04), bulb, body)

for name, side in (("arm_L", 1), ("arm_R", -1)):
    pivot = empty(name, (side * 0.33, 0.3, 0.04), body)
    arm = capsule(f"{name}_limb", 0.055, 0.14, (0, 0, 0), skin)
    arm.parent = pivot
    arm.location = (0, -0.1, 0.0)
    arm.rotation_euler = (math.radians(78), 0, 0)
    hand = sphere(f"{name}_hand", 0.065, (0, 0, 0), skin, scale=(1, 0.8, 1.1))
    hand.parent = pivot
    hand.location = (0, -0.21, -0.03)
    if name == "arm_R":
        empty("hand_R", (0, -0.03, 0.21), pivot)

for side in (-1, 1):
    sphere(f"foot_{side}", 0.08, (side * 0.14, 0.04, 0.17), skin, body, scale=(1, 0.55, 1.35))

empty("hat", (0, 0.62, 0), body).scale = (0.95, 0.95, 0.95)
empty("face", (0, 0.4, 0.3), body)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 0.45, 0), distance=2.2, yaw=30, pitch=12)
