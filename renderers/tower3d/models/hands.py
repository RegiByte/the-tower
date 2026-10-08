"""
Your own hands in first person, in camera space: -z ahead, x right, y up, meters. Each hand is a round mitt with a
thumb nub and a sleeve running back past the camera, on a pivot at the palm (`hand_L`, `hand_R`) placed where it
rests at the bottom corners of the view; the renderer turns each pivot in toward the middle.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import cylinder, empty, export, mat, out_path, preview, reset, sphere

reset()
skin = mat("skin", "#e8b48f")
sleeve = mat("sleeve", "#3b3f4a")
cuff = mat("cuff", "#565b68")

for name, side in (("hand_L", -1), ("hand_R", 1)):
    x, y, z = side * 0.2, -0.2, -0.5
    hand = empty(name, (x, y, z))
    sphere(f"{name}_palm", 0.045, (x, y, z - 0.012), skin, hand, scale=(1, 0.8, 1.15))
    sphere(f"{name}_thumb", 0.018, (x - side * 0.038, y + 0.008, z - 0.022), skin, hand, scale=(1, 0.9, 1.3))
    cylinder(f"{name}_cuff", 0.038, 0.028, (x, y, z + 0.052), cuff, hand, axis="z")
    cylinder(f"{name}_sleeve", 0.034, 0.5, (x, y, z + 0.31), sleeve, hand, axis="z")

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, -0.2, -0.5), distance=0.9, yaw=160, pitch=30)
