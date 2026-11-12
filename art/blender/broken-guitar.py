"""The broken guitar, object/broken-guitar: the cat's battered acoustic, the one on the
protagonist's back (lib/guitar.py), standing on its own with its neck snapped and taped, the
headstock hanging off it and a snapped string curling loose.

    blender -b --factory-startup --python art/blender/broken-guitar.py -- \\
        --out frontend/public/models/objects/broken-guitar.glb \\
        [--previews docs/screenshots/blender/objects/broken-guitar]

Built from scratch every run. Points are in glTF axes, metres: +Y up, the soundboard facing +Z.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, anchor
from lib.export import arguments, empty_scene, export_glb
from lib.guitar import COLOURS, DEPTH, LOWER, NECK, guitar
from lib.palette import material

#: Turned so it stands on a flat edge of the lower bout, the neck near upright.
TURN = math.radians(-22.5)
#: Where that edge is, in the guitar's frame turned: the middle of the resting base.
BASE = (0.0, -LOWER * math.cos(math.pi / 8), DEPTH / 2)


def standing(p):
    x, y, z = p
    c, s = math.cos(TURN), math.sin(TURN)
    return (c * x - s * y, s * x + c * y - BASE[1], z - BASE[2])


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    materials = {part: material(part, hex_colour) for part, hex_colour in COLOURS.items()}
    body = Body(materials)
    guitar(body, standing)
    guitar_object = body.finish("broken-guitar")
    start, end = NECK
    anchor("anchor_grip", standing(tuple((a + b) / 2 for a, b in zip(start, end, strict=True))))
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import object_previews

        object_previews(guitar_object, os.path.abspath(args.previews), 0.75, "opening")


main()
