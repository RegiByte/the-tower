"""A calico: white, with orange and black patches, one ear of each, and a patch over one eye."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from catkit import cat, finish
from kit import mat, out_path, reset, sphere

reset()
COAT = dict(fur="#f3ede2", belly="#f3ede2", muzzle="#f3ede2", paws="#f3ede2", orange="#e0873a", dark="#23262e", eye="#f2c14e", nose="#ff9fb4", whiskers="#3a3d45", collar="#ff4fa3")
COAT.update(ears=("orange", "dark"), tail=("fur", "orange", "orange", "fur", "dark", "dark"))
pivots = cat(COAT)
orange = mat("orange", COAT["orange"])
dark = mat("dark", COAT["dark"])

for i, (pos, r, m) in enumerate((((0.07, 0.2, -0.06), 0.06, orange), ((-0.08, 0.15, -0.1), 0.055, dark), ((0.0, 0.24, -0.08), 0.05, orange), ((-0.09, 0.09, 0.0), 0.04, orange), ((0.08, 0.1, -0.12), 0.045, dark))):
    sphere(f"patch_{i}", r, pos, m, scale=(1, 0.8, 1))
sphere("eyepatch", 0.034, (-0.04, 0.322, 0.11), dark, pivots["head"], scale=(1.1, 1, 0.7))
sphere("crown", 0.05, (0.03, 0.36, 0.04), orange, pivots["head"], scale=(1.2, 0.6, 1.2))

finish(*out_path())
