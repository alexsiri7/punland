"""The flyer, object/flyer: the Song Master's lesson flyer, a sheet of paper standing on its
bottom edge, curled a little across. docs/design/rooms/high-street.svg (`lesson-flyer`) is the
reference: flyer paper, a poster-red headline and two lines of ink under it.

    blender -b --factory-startup --python art/blender/flyer.py -- \\
        --out frontend/public/models/objects/flyer.glb \\
        [--previews docs/screenshots/blender/objects/flyer]

Built from scratch every run. Points are in glTF axes, metres: +Y up, the printed side facing +Z.
"""

import math
import os
import sys
from itertools import pairwise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, anchor
from lib.export import arguments, empty_scene, export_glb
from lib.palette import material

# STYLE.md: flyer paper, poster red, the ink of the architecture's frame stroke.
COLOURS = {"paper": "#D9CDB4", "headline": "#C8483B", "ink": "#2A1C1A"}

#: The art's 32 x 40 px at its spot on the pavement, its side edges curled towards the front
#: round a cylinder of radius CURL.
WIDTH, HEIGHT, THICKNESS, CURL = 0.2, 0.25, 0.003, 0.2
#: The flat strips the curl is made of.
STRIPS = 6
#: How far the curl brings the side edges forward of the middle.
SAG = CURL * (1 - math.cos(WIDTH / 2 / CURL))


def surface(u: float, v: float, out: float = 0.0):
    """The printed side `u` across from the middle and `v` up, raised `out` off it. The base's
    middle, half way between the middle and the edges, is the origin."""
    a = u / CURL
    radius = CURL - out
    return (radius * math.sin(a), v, CURL - radius * math.cos(a) - SAG / 2)


def sheet(body: Body, u0: float, u1: float, v0: float, v1: float, out: float, part: str) -> None:
    """The rectangle (u0..u1, v0..v1) of the printed side, `out` off it and THICKNESS thick, in
    strips that follow the curl."""
    step = WIDTH / STRIPS
    cuts = sorted(
        {u0, u1}
        | {-WIDTH / 2 + i * step for i in range(STRIPS + 1) if u0 < -WIDTH / 2 + i * step < u1}
    )
    for a, b in pairwise(cuts):
        body.hull(
            [surface(u, v, d) for u in (a, b) for v in (v0, v1) for d in (out, out - THICKNESS)],
            part,
        )


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    body = Body({part: material(part, hex_colour) for part, hex_colour in COLOURS.items()})
    half = WIDTH / 2
    sheet(body, -half, half, 0, HEIGHT, 0, "paper")
    sheet(body, -0.75 * half, 0.75 * half, 0.73 * HEIGHT, 0.9 * HEIGHT, 0.0015, "headline")
    sheet(body, -0.62 * half, 0.62 * half, 0.48 * HEIGHT, 0.52 * HEIGHT, 0.0015, "ink")
    sheet(body, -0.62 * half, 0.38 * half, 0.32 * HEIGHT, 0.36 * HEIGHT, 0.0015, "ink")
    flyer = body.finish("flyer")
    anchor("anchor_grip", surface(0, HEIGHT / 2, -THICKNESS / 2))
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import object_previews

        object_previews(flyer, os.path.abspath(args.previews), 0.3, "high-street", "lesson-flyer")


main()
