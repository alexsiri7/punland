"""The beetroot cop on the pavement outside The Three Crows: a round beetroot of a body that is
also his head, a tuft of leaves out of the top of a police helmet, short stalk legs and arms, white
gloves, a belt and a badge. The opening's reference art (docs/design/rooms/opening.svg, `#cop`) is
the reference: a bulb tapering to a root between the legs, the helmet, the leaves over it. About
1.2 m to the tips of the leaves.

    blender -b --factory-startup --python art/blender/cop.py -- \\
        --out frontend/public/models/characters/cop.glb \\
        [--previews docs/screenshots/blender/cop]

Built from scratch every run. Points are in glTF axes, metres: +Y up, facing +Z, his left +X.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, blend, disc, limb
from lib.clips import Style, clips
from lib.export import arguments, empty_scene, export_glb
from lib.palette import material
from lib.rig import SIDES, Biped, anchors, armature, mirror

# The opening's reference art for the helmet and its trim; STYLE.md's palette, and the other
# characters' eyes, for the rest.
# The beetroot is the one tone of its own: the art's poster red reads as a tomato, and the pun
# needs a beetroot's deep magenta.
COLOURS = {
    "beetroot": "#8C2A55",
    "leaves": "#3E5E44",
    "stalks": "#2F4A36",
    "helmet": "#2E3A52",
    "helmet-trim": "#26304A",
    "badge": "#E3C58A",
    "belt": "#26304A",
    "buckle": "#E3C58A",
    "gloves": "#D9CDB4",
    "boots": "#26262C",
    "eyes": "#F4EFE6",
    "pupils": "#16161A",
    "moustache": "#2A1C1A",
}

#: Metres, to the tips of the leaves; the registry's `height` for character/cop.
HEIGHT = 1.2

# The bulb is body and head at once: the neck and head bones start on it below the helmet, so
# the face and the helmet nod together in the idle and the talk.
BIPED = Biped(
    spine=(
        (0, 0.32, 0),
        (0, 0.46, 0),
        (0, 0.6, 0),
        (0, 0.76, 0),
        (0, 0.82, 0),
        (0, HEIGHT, 0),
    ),
    arm=((0.18, 0.66, 0.0), (0.25, 0.54, 0.02), (0.29, 0.44, 0.04), (0.3, 0.37, 0.06)),
    leg=((0.075, 0.33, 0), (0.075, 0.18, 0.015), (0.075, 0.05, 0), (0.075, 0.0, 0.11)),
    back=(0, 0.62, -0.23),
)

#: The bulb's sections, bottom to top: (height, radius). Round, widest about halfway up.
BULB = [
    (0.29, 0.07),
    (0.34, 0.14),
    (0.42, 0.19),
    (0.52, 0.215),
    (0.64, 0.22),
    (0.76, 0.2),
    (0.85, 0.16),
    (0.92, 0.1),
    (0.96, 0.04),
]

#: Turns the bulb's sections half a side, so a ridge runs down the middle of his face and each
#: eye sits in the middle of a flat side, not across a ridge that would cut through it.
BULB_TWIST = math.pi / 10

#: The bulb's skin: the lower half with the body's bones, the top with the head's.
BULB_SKIN = blend(
    (0, "hips"),
    (0.46, "spine"),
    (0.6, "chest"),
    (0.76, "neck"),
    (0.82, "head"),
    soft=0.06,
)


def section(y: float, radius: float, sides: int = 10, twist: float = 0.0):
    """A level circle round the spine at height `y`."""
    return disc((0, y, 0), (0, y + 1, 0), radius, sides, twist)


def build_body(body: Body) -> None:
    bulb = beetroot(body)
    face(body, bulb)
    uniform(body, bulb)
    helmet(body)
    leaves(body)
    for side, x in SIDES.items():
        arm(body, side, x)
        leg(body, side, x)


def beetroot(body: Body):
    """The bulb, and the thin root under it that hangs between his legs."""
    bulb = body.hull(
        [p for y, r in BULB for p in section(y, r, twist=BULB_TWIST)],
        "beetroot",
        BULB_SKIN,
    )
    body.hull(limb((0, 0.3, 0), (0, 0.2, 0.02), 0.04, 0.008, 5), "beetroot", "hips")
    return bulb


def face(body: Body, bulb) -> None:
    for x in SIDES.values():
        eye = [
            (x * (0.065 + dx), 0.75 + dy)
            for dx, dy in ((-0.028, 0), (-0.016, 0.026), (0.016, 0.026), (0.028, 0))
            + ((0.016, -0.024), (-0.016, -0.024))
        ]
        body.decal(bulb, eye, 0.006, "eyes", BULB_SKIN)
        pupil = [
            (x * (0.058 + dx), 0.745 + dy)
            for dx, dy in ((-0.013, 0), (0, 0.016), (0.013, 0), (0, -0.016))
        ]
        body.decal(bulb, pupil, 0.011, "pupils", BULB_SKIN)
    # A bobby's moustache: two bristling wedges either side of the middle, drooping at the ends.
    for x in SIDES.values():
        body.decal(
            bulb,
            [
                (0, 0.69),
                (x * 0.03, 0.7),
                (x * 0.08, 0.68),
                (x * 0.1, 0.65),
                (x * 0.05, 0.665),
            ],
            0.016,
            "moustache",
            BULB_SKIN,
        )


def uniform(body: Body, bulb) -> None:
    """A belt round his middle with a gold buckle, and a warrant badge on his chest."""
    body.hull(
        section(0.47, 0.212, twist=BULB_TWIST) + section(0.53, 0.226, twist=BULB_TWIST),
        "belt",
        BULB_SKIN,
    )
    buckle = [(x, y) for x in (-0.035, 0.035) for y in (0.475, 0.525)]
    body.decal(bulb, buckle, 0.03, "buckle", BULB_SKIN)
    badge = [(0.1, 0.62), (0.078, 0.585), (0.1, 0.555), (0.122, 0.585)]
    body.decal(bulb, badge, 0.01, "badge", BULB_SKIN)


def helmet(body: Body) -> None:
    """A custodian helmet sat down over the top of the bulb, its brim lower at the front, and a
    star on its front."""
    brim = [(x, y - 0.02 * z / 0.175, z) for x, y, z in section(0.86, 0.175, 12)]
    body.hull(brim + section(0.88, 0.17, 12), "helmet-trim", "head")
    shell = body.hull(
        section(0.87, 0.15, 10)
        + section(0.94, 0.14, 10)
        + section(0.99, 0.11, 10)
        + section(1.02, 0.06, 10),
        "helmet",
        "head",
    )
    body.hull(limb((0, 1.01, 0), (0, 1.045, 0), 0.025, 0.02, 6), "helmet-trim", "head")
    star = [(0, 0.975), (0.03, 0.948), (0.02, 0.915), (-0.02, 0.915), (-0.03, 0.948)]
    body.decal(shell, star, 0.008, "badge", "head")


def leaves(body: Body) -> None:
    """Three leaves out of the top of the helmet, the middle one standing tallest, on thin
    stalks in the root's colour."""
    for lean, top in ((-0.11, 1.15), (0.0, HEIGHT), (0.11, 1.16)):
        base = (0, 1.03, 0)
        sx, sy, sz = stalk_end = (lean * 0.4, 1.07, -0.01)
        body.hull(limb(base, stalk_end, 0.012, 0.01, 5), "beetroot", "head")
        tx = lean * 1.4
        mx, my = (sx + tx) / 2, (sy + top) / 2 + 0.01
        body.hull(
            [
                stalk_end,
                (sx - 0.03, sy + 0.03, sz),
                (sx + 0.03, sy + 0.03, sz),
                (mx - 0.05, my, sz + 0.012),
                (mx + 0.05, my, sz + 0.012),
                (mx, my, sz - 0.02),
                (tx, top, sz - 0.02),
            ],
            "leaves",
            "head",
        )


def arm(body: Body, side: str, x: int) -> None:
    """A stalk of an arm out of the bulb's side, in a white glove."""
    shoulder, elbow, wrist, tip = (mirror(p, x) for p in BIPED.arm)
    body.hull(limb(shoulder, elbow, 0.026, 0.022, 5), "stalks", f"upper_arm_{side}")
    body.hull(limb(elbow, wrist, 0.022, 0.02, 5), "stalks", f"forearm_{side}")
    wx, wy, wz = wrist
    tx, ty, tz = tip
    body.hull(
        limb(wrist, (wx + 0.004 * x, wy - 0.015, wz + 0.005), 0.034, 0.034, 6)
        + [
            (tx + 0.02 * x, ty + 0.01, tz),
            (tx - 0.02 * x, ty + 0.01, tz + 0.01),
            (tx, ty - 0.005, tz + 0.01),
            (tx + 0.035 * x, ty + 0.035, tz - 0.01),
        ],
        "gloves",
        f"hand_{side}",
    )


def leg(body: Body, side: str, x: int) -> None:
    hip, knee, ankle, toe = (mirror(p, x) for p in BIPED.leg)
    body.hull(limb(hip, knee, 0.03, 0.026, 5), "stalks", f"thigh_{side}")
    body.hull(limb(knee, ankle, 0.026, 0.024, 5), "stalks", f"shin_{side}")
    ax, ay, az = ankle
    tx, _, tz = toe
    w = 0.045
    body.hull(
        [
            (ax - w, 0.0, az - 0.06),
            (ax + w, 0.0, az - 0.06),
            (ax - w, ay + 0.02, az - 0.05),
            (ax + w, ay + 0.02, az - 0.05),
            (ax - w * 0.8, ay + 0.03, az + 0.02),
            (ax + w * 0.8, ay + 0.03, az + 0.02),
            (tx - w, 0.0, tz),
            (tx + w, 0.0, tz),
            (tx - w * 0.8, 0.04, tz - 0.01),
            (tx + w * 0.8, 0.04, tz - 0.01),
        ],
        "boots",
        f"foot_{side}",
    )


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    materials = {
        part: material(part, hex_colour) for part, hex_colour in COLOURS.items()
    }
    rig = armature("cop", BIPED)
    body = Body(materials)
    build_body(body)
    body.finish("cop-body", rig.object)
    anchors(rig, BIPED)
    clips(rig, BIPED, Style(stride=0.7, knee=0.8, waddle=6))
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import previews

        previews(
            rig,
            os.path.abspath(args.previews),
            HEIGHT,
            clips=("idle", "talk", "walk"),
            entity="cop",
        )


main()
