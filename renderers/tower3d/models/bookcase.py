"""A bookcase facing +z, 1.4 wide: its books are the renderer's, one per file, on the shelves at BOOK_SHELVES (src/room.ts)."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from kit import box, export, mat, out_path, preview, reset, slab

W, H, D, T = 1.4, 2.1, 0.4, 0.04
reset()
wood = mat("shelfwood", "#7a5a42")
dark = mat("shelfback", "#3a2c22")
for side in (-1, 1):
    slab(f"side_{side}", (T, H, D), (side * (W / 2 - T / 2), 0, 0), wood, bevel=0.008)
slab("back", (W, H, 0.02), (0, 0, -D / 2 + 0.01), dark)
for i, y in enumerate((0.0, 0.08, 0.58, 1.08, 1.58, H - T)):
    slab(f"board_{i}", (W - 2 * T if 0 < i < 5 else W, T, D - 0.02), (0, y, 0.01), wood, bevel=0.006)
slab("plinth", (W - 2 * T, 0.08, 0.02), (0, 0, D / 2 - 0.02), dark)

path, shot = out_path()
export(path)
if shot:
    preview(shot, target=(0, 1.05, 0), distance=3.4, yaw=25, pitch=10)
