"""
A workstation in desk space (src/desk.ts): the desk centered on the origin, the monitor at its far edge (+z) facing
-z, the chair on the near side. The live screen, the paper stack and the status strip are the renderer's own and
go where the model leaves room for them: the screen at SCREEN, the strip along the desk's near edge.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import box, capsule, cylinder, empty, export, mat, out_path, preview, reset, slab, sphere, torus

DESK_W, DESK_D, DESK_H = 2.4, 1.1, 0.75
SCREEN_W, SCREEN_H, SCREEN_Y, SCREEN_Z = 1.56, 0.98, 1.33, 0.32
SEAT_Y, SEAT_Z = 0.48, -1.0

reset()
oak = mat("oak", "#9a7354")
frame = mat("frame", "#1c212c")
housing = mat("housing", "#1a1e27")
keycap = mat("keycap", "#3a4256")
board = mat("board", "#262c3a")
fabric = mat("fabric", "#2f3a52")
cup = mat("mug", "#e8e2d0")
pot = mat("pot", "#c46a4a")
leaf = mat("leaf", "#4f9a5c")

slab("top", (DESK_W, 0.06, DESK_D), (0, DESK_H - 0.06, 0), oak, bevel=0.012)
for side in (-1, 1):
    x = side * (DESK_W / 2 - 0.12)
    slab(f"leg_{side}", (0.06, DESK_H - 0.12, 0.06), (x, 0.06, 0), frame, bevel=0.01)
    box(f"foot_{side}", (0.08, 0.06, DESK_D - 0.1), (x, 0.03, 0), frame, bevel=0.015)
    box(f"brace_{side}", (0.06, 0.06, DESK_D - 0.2), (x, DESK_H - 0.09, 0), frame, bevel=0.01)
box("rail", (DESK_W - 0.3, 0.05, 0.04), (0, DESK_H - 0.12, DESK_D / 2 - 0.12), frame)
box("modesty", (DESK_W - 0.3, 0.32, 0.02), (0, DESK_H - 0.3, DESK_D / 2 - 0.1), frame)

back = SCREEN_Z + 0.05
slab("monitor_foot", (0.46, 0.02, 0.26), (0, DESK_H, SCREEN_Z + 0.06), frame, bevel=0.008)
slab("monitor_neck", (0.08, SCREEN_Y - DESK_H - 0.2, 0.05), (0, DESK_H, SCREEN_Z + 0.16), frame, bevel=0.01)
box("bezel", (SCREEN_W + 0.08, SCREEN_H + 0.08, 0.04), (0, SCREEN_Y, back), housing, bevel=0.015)
box("monitor_back", (SCREEN_W * 0.6, SCREEN_H * 0.5, 0.06), (0, SCREEN_Y - 0.05, back + 0.05), housing, bevel=0.025)
box("power_led", (0.02, 0.008, 0.006), (SCREEN_W / 2 - 0.05, SCREEN_Y - SCREEN_H / 2 - 0.018, back - 0.021), mat("led_glow", "#5ee38f"))

slab("keyboard", (0.9, 0.025, 0.28), (0, DESK_H, -0.18), board, bevel=0.008)
for row in range(4):
    for col in range(14 if row < 3 else 1):
        if row < 3:
            slab(f"key_{row}_{col}", (0.05, 0.014, 0.05), (-0.39 + col * 0.06, DESK_H + 0.025, -0.1 - row * 0.065), keycap)
        else:
            slab("spacebar", (0.38, 0.014, 0.045), (0, DESK_H + 0.025, -0.1 - 3 * 0.065 + 0.005), keycap)
capsule("mouse", 0.035, 0.04, (-0.62, DESK_H + 0.025, -0.2), board, squash=(1, 0.55))
slab("mousepad", (0.24, 0.004, 0.2), (-0.62, DESK_H, -0.2), mat("pad", "#3d2f4f"))

cylinder("mug", 0.055, 0.12, (-0.95, DESK_H + 0.06, 0.25), cup, radius_top=0.06)
torus("mug_handle", 0.035, 0.01, (-1.02, DESK_H + 0.065, 0.25), cup, rotation=(0, math.pi / 2, 0))
cylinder("coffee", 0.052, 0.005, (-0.95, DESK_H + 0.112, 0.25), mat("coffee", "#3b2418"))

cylinder("pot", 0.07, 0.1, (-0.55, DESK_H + 0.05, 0.38), pot, radius_top=0.085)
capsule("cactus", 0.045, 0.1, (-0.55, DESK_H + 0.17, 0.38), leaf)
capsule("cactus_arm", 0.025, 0.04, (-0.5, DESK_H + 0.2, 0.38), leaf)

chair = empty("chair", (0, 0, SEAT_Z))
slab("seat", (0.6, 0.09, 0.56), (0, SEAT_Y - 0.09, SEAT_Z), fabric, chair, bevel=0.035, segments=4)
backrest = box("backrest", (0.56, 0.62, 0.08), (0, SEAT_Y + 0.38, SEAT_Z - 0.38), fabric, chair, bevel=0.035, segments=4)
backrest.rotation_euler = (math.radians(-8), 0, 0)
box("spine", (0.06, 0.4, 0.04), (0, SEAT_Y + 0.05, SEAT_Z - 0.34), frame, chair)
cylinder("lift", 0.035, SEAT_Y - 0.12, (0, (SEAT_Y - 0.09) / 2 + 0.06, SEAT_Z), frame, chair, vertices=12)
for i in range(5):
    a = i * 2 * math.pi / 5
    dx, dz = math.sin(a) * 0.17, math.cos(a) * 0.17
    spoke = box(f"spoke_{i}", (0.04, 0.035, 0.34), (dx, 0.08, SEAT_Z + dz), frame, chair, bevel=0.01)
    spoke.rotation_euler = (0, 0, a)
    sphere(f"caster_{i}", 0.035, (dx * 2, 0.035, SEAT_Z + dz * 2), frame, chair)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 0.8, -0.3), distance=4.2, yaw=210, pitch=24)
