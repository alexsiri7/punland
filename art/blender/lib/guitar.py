"""The cat's broken guitar: the one on the protagonist's back and object/broken-guitar are the
same parts, placed differently.

The guitar's own frame, metres: the middle of the lower bout's back at the origin, the body up
+Y, the soundboard facing +Z and the neck leaning to -X. A script places it with a rigid `place`
from that frame to its model's.
"""

from collections.abc import Callable
from itertools import pairwise

from mathutils import Vector

from .build import Body, Point, Skin, disc, limb

COLOURS = {
    "guitar": "#8A5A34",
    "guitar-neck": "#4A3A30",
    "headstock": "#3A2E26",
    "tape": "#9A968C",
    "patch": "#5FA39A",
    "soundhole": "#2A1C1A",
    "bridge": "#3A2E26",
    "strings": "#CFC9BE",
}

#: The lower bout's radius and the body's depth, back to soundboard.
LOWER, DEPTH = 0.125, 0.075
#: The neck, from the body to where it snapped, on the soundboard's side of the body's middle.
NECK = ((-0.04, 0.22, 0.035), (-0.13, 0.48, 0.035))
#: On the soundboard, on the neck's line: the soundhole's and the bridge's middles.
SOUNDHOLE, BRIDGE = (0.015, 0.06), (0.057, -0.06)
#: Where the strings end, at the snap.
SNAP = (-0.125, 0.465, 0.06)
#: The snapped string, curling loose off the bridge's end.
LOOSE = [
    (0.087, -0.06, 0.083),
    (0.12, -0.03, 0.1),
    (0.15, 0.02, 0.11),
    (0.16, 0.08, 0.1),
    (0.135, 0.11, 0.09),
]

Place = Callable[[Point], Point]


def guitar(body: Body, place: Place, skin: Skin | None = None) -> None:
    """Adds the guitar to `body`, placed by `place`, skinned by `skin` on a character."""

    def hull(points, part: str):
        return body.hull([place(p) for p in points], part, skin)

    def bout(y: float, x: float, radius: float, depth: float):
        return [p for z in (0, depth) for p in disc((x, y, z), (x, y, z + 1), radius, 8)]

    lobe = hull(bout(0, 0, LOWER, DEPTH), "guitar")
    hull(bout(0.17, -0.035, 0.095, 0.07), "guitar")
    facing_back = place((0, 0, 1))[2] < place((0, 0, 0))[2]

    def decal(outline, depth: float, part: str):
        points = [place((x, y, DEPTH)) for x, y in outline]
        body.decal(lobe, [(x, y) for x, y, _ in points], depth, part, skin, back=facing_back)

    decal([(0.07, -0.03), (0.02, -0.03), (0.02, 0.02), (0.07, 0.02)], 0.004, "patch")
    hole = disc((*SOUNDHOLE, DEPTH), (*SOUNDHOLE, DEPTH + 1), 0.03, 8)
    decal([p[:2] for p in hole], 0.002, "soundhole")
    bx, by = BRIDGE
    decal([(bx + dx, by + dy) for dx in (-0.03, 0.03) for dy in (-0.008, 0.008)], 0.008, "bridge")
    hull(limb(*NECK, 0.022, 0.02, 4, 0.785), "guitar-neck")
    hull(limb((-0.112, 0.42, 0.035), (-0.122, 0.45, 0.035), 0.03, 0.03, 4, 0.785), "tape")
    hull(limb((-0.14, 0.49, 0.03), (-0.2, 0.42, 0.03), 0.028, 0.022, 4, 0.785), "headstock")
    strings(hull)
    for a, b in pairwise(LOOSE):
        hull(limb(a, b, 0.005, 0.005, 4), "strings")


def strings(hull) -> None:
    """The strings left, as one band from the bridge up the neck to the snap."""
    (bx, by), (sx, sy, sz) = BRIDGE, SNAP
    across = Vector((sy - by, bx - sx)).normalized() * 0.008
    hull(
        [
            (x + side * across.x, y + side * across.y, z + lift)
            for x, y, z in ((bx, by, DEPTH + 0.008), (sx, sy, sz))
            for side in (-1, 1)
            for lift in (0, 0.004)
        ],
        "strings",
    )
