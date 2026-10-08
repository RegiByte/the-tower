"""A black-and-white tuxedo: white bib and paws, and under its black nose a white mustache across the mouth."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from catkit import cat, finish
from kit import mat, out_path, reset, sphere

reset()
COAT = dict(fur="#1d2028", belly="#f6f3ec", muzzle="#1d2028", paws="#f6f3ec", eye="#e0a63a", nose="#2c2a30", whiskers="#f6f3ec", collar="#ffd166")
COAT.update(ears=("fur", "fur"), tail=("fur",) * 6)
pivots = cat(COAT)
white = mat("belly", COAT["belly"])

sphere("lip", 0.02, (0, 0.279, 0.157), white, pivots["head"], scale=(1.5, 0.7, 0.6))
for side in (-1, 1):
    stache = sphere(f"stache_{side}", 0.022, (side * 0.024, 0.274, 0.15), white, pivots["head"], scale=(1.3, 0.6, 0.6))
    stache.rotation_euler = (0, math.radians(side * -25), 0)

finish(*out_path())
