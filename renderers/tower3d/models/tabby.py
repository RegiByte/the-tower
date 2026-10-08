"""A grey tabby with a white belly, white socks and muzzle: stripes on the back, an M on the forehead, a ringed tail."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from catkit import BODY, SKULL, band, cat, finish, stroke
from kit import mat, out_path, reset, sphere

reset()
COAT = dict(fur="#8e8a84", belly="#f2efe8", muzzle="#f2efe8", paws="#f2efe8", mark="#3b3936", eye="#b9cf5a", nose="#f29aa8", whiskers="#f2efe8", collar="#4fb3c8")
COAT.update(ears=("fur", "fur"), tail=("fur", "mark", "fur", "mark", "fur", "mark"))
pivots = cat(COAT)
mark = mat("mark", COAT["mark"])

for i, (z, w, lean) in enumerate(((-0.1, 0.022, -0.2), (-0.05, 0.024, -0.08), (0.0, 0.022, 0.06), (0.045, 0.018, 0.18))):
    band(f"stripe_{i}", BODY, mark, (0, lean, 1), z + 0.02, w, floor=0.07)
for k, (x, y, tilt) in enumerate(((-0.028, 0.35, 30), (-0.011, 0.352, -30), (0.011, 0.352, 30), (0.028, 0.35, -30))):
    stroke(f"m_{k}", (x, y), SKULL, 0.034, tilt, mark, pivots["head"])
for side in (-1, 1):
    for k, y in enumerate((0.31, 0.295)):
        stroke(f"cheek_{side}_{k}", (side * 0.083, y), SKULL, 0.03, side * 75, mark, pivots["head"])
    for k, y in enumerate((0.105, 0.075)):
        band(f"leg_{side}_{k}", dict(radius=0.0254, center=(side * 0.045, y, 0.1), scale=(1, 1, 1)), mark, (0, 1, 0), 0, 0.01, floor=-1, parent=pivots["paw_R" if side < 0 else "paw_L"], lift=1)

finish(*out_path())
