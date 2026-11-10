"""One of the Three Crows, the one model all three share (Sheryl Caw among them): a crow perched
on a bar stool behind the bar, hunched, its chin up over an angular beak, judging. The pub's
reference art (docs/design/rooms/pub.svg, `#sheryl-caw`) is the reference: a thin stool with a red
cushion, a body widening to the folded wings, a pointed head, gold eyes and beak, one crest
feather. About 1.15 m from the stool's foot to the tip of the crest.

    blender -b --factory-startup --python art/blender/crow.py -- \\
        --out frontend/public/models/characters/crow.glb \\
        [--previews docs/screenshots/blender/crow]

Built from scratch every run. Points are in glTF axes, metres: +Y up, facing +Z, its left +X.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, blend, disc, limb, ring
from lib.clips import Style, clips
from lib.export import arguments, empty_scene, export_glb
from lib.palette import material
from lib.rig import SIDES, Biped, anchors, armature, mirror
from lib.rig import torso as torso_skin

# The pub's reference art for the feathers, the beak and eyes, and the stool; STYLE.md's palette
# (slot, lamp amber, ink) for the rest.
COLOURS = {
    "feathers": "#2F2D35",
    "flight-feathers": "#26272E",
    "beak": "#E3C58A",
    "eyes": "#E3C58A",
    "pupils": "#16161A",
    "legs": "#C99A54",
    "stool": "#2F2D35",
    "stool-cushion": "#C8483B",
}

#: Metres, from the stool's foot to the tip of the crest; the registry's `height` for
#: character/crow.
HEIGHT = 1.15

#: The cushion's top, where the crow sits.
SEAT = 0.6

#: The tail's joints, from under the body at the back, hanging down behind the cushion.
TAIL = [(0, 0.66, -0.1), (0, 0.6, -0.18), (0, 0.5, -0.23)]

# Perched: the hips sit on the cushion, and the legs are only the short shanks down to the toes
# gripping its front edge. The spine leans forward into a hunch, the head carried out in front.
BIPED = Biped(
    spine=(
        (0, 0.62, -0.01),
        (0, 0.69, 0.0),
        (0, 0.77, 0.02),
        (0, 0.85, 0.05),
        (0, 0.9, 0.065),
        (0, 1.06, 0.06),
    ),
    arm=((0.1, 0.84, 0.02), (0.14, 0.75, -0.02), (0.15, 0.66, -0.01), (0.15, 0.6, -0.04)),
    leg=((0.05, 0.64, 0.04), (0.05, 0.63, 0.08), (0.05, 0.605, 0.1), (0.05, SEAT, 0.15)),
    back=(0, 0.76, -0.14),
    tail=tuple(TAIL),
)

#: The body's rings, bottom to top: (height, half width, half depth, how far forward). Widest
#: under the folded wings, narrowing and leaning forward up to the neck: the hunch.
TORSO = [
    (SEAT, 0.1, 0.095, -0.01),
    (0.66, 0.125, 0.12, 0.0),
    (0.74, 0.12, 0.115, 0.02),
    (0.82, 0.095, 0.095, 0.045),
    (0.88, 0.07, 0.075, 0.065),
]
TORSO_SKIN = torso_skin(BIPED)

#: The head's skin: the neck's bottom to the head bone, so it turns on the neck.
HEAD_SKIN = blend((0, "neck"), (0.93, "head"), soft=0.03)


def build_body(body: Body) -> None:
    stool(body)
    torso(body)
    head(body)
    for side, x in SIDES.items():
        wing(body, side, x)
        leg(body, side, x)
    tail(body)


def stool(body: Body) -> None:
    """A bar stool: a round foot, a thin pole, and a red cushion on top. It stays put under the
    crow, so it hangs on the root."""
    body.hull(limb((0, 0, 0), (0, 0.025, 0), 0.13, 0.11, 10), "stool", "root")
    body.hull(limb((0, 0.025, 0), (0, SEAT - 0.04, 0), 0.018, 0.018, 6), "stool", "root")
    body.hull(limb((0, SEAT - 0.045, 0), (0, SEAT, 0), 0.14, 0.135, 10), "stool-cushion", "root")


def torso(body: Body) -> None:
    body.hull([p for y, w, d, f in TORSO for p in ring((0, y, f), w, d)], "feathers", TORSO_SKIN)


def head(body: Body) -> None:
    """A pointed head pushed out in front of the hunch, its crown peaked like the reference
    art's, the beak long and straight with a hooked tip, the eyes half shut under flat lids."""

    def mirror_x(points):
        return [(sx * px, py, pz) for px, py, pz in points for sx in ((1, -1) if px else (1,))]

    skull = body.hull(
        ring((0, 0.87, 0.06), 0.065, 0.07)
        + mirror_x(
            [
                (0.07, 0.93, 0.13),
                (0, 0.92, 0.16),
                (0.08, 0.98, 0.07),
                (0.075, 0.96, 0.0),
                (0, 0.95, -0.03),
                (0.08, 1.02, 0.1),
                (0, 1.02, 0.14),
                (0.06, 1.04, 0.03),
                (0, 1.0, -0.02),
                (0.035, 1.07, 0.06),
                (0, 1.08, 0.07),
            ]
        ),
        "feathers",
        HEAD_SKIN,
    )
    body.hull(
        mirror_x(
            [
                (0.04, 0.99, 0.13),
                (0.04, 0.94, 0.13),
                (0, 1.01, 0.15),
                (0, 0.925, 0.155),
                (0.014, 0.97, 0.26),
                (0, 0.975, 0.29),
                (0, 0.95, 0.31),
            ]
        ),
        "beak",
        "head",
    )
    for x in SIDES.values():
        # Half shut: a narrow gold eye with its top cut flat by the lid.
        eye = [
            (x * (0.056 + dx), 1.0 + dy)
            for dx, dy in ((-0.016, 0.008), (0.016, 0.008), (0.013, -0.01), (-0.01, -0.013))
        ]
        body.decal(skull, eye, 0.004, "eyes", "head")
        pupil = [
            (x * (0.052 + dx), 1.0 + dy)
            for dx, dy in ((-0.008, 0.008), (0.008, 0.008), (0.007, -0.008), (-0.007, -0.009))
        ]
        body.decal(skull, pupil, 0.007, "pupils", "head")
    crest(body)


def crest(body: Body) -> None:
    """One feather standing up off the crown, leaning back."""
    body.hull(
        disc((0, 1.05, 0.06), (0, 1.1, 0.04), 0.022, 4) + [(0.005, HEIGHT, 0.0)],
        "feathers",
        "head",
    )


def wing(body: Body, side: str, x: int) -> None:
    """A wing folded down the side as an arm, flaring out at its foot as in the reference art,
    then the flight feathers as fingers."""
    shoulder, elbow, wrist, tip = (mirror(p, x) for p in BIPED.arm)
    sx, sy, sz = shoulder
    ex, ey, ez = elbow
    body.hull(
        [
            (sx - 0.03 * x, sy + 0.035, sz + 0.03),
            (sx + 0.02 * x, sy + 0.01, sz + 0.06),
            (sx + 0.02 * x, sy + 0.01, sz - 0.08),
            (ex - 0.02 * x, ey, ez + 0.08),
            (ex + 0.03 * x, ey, ez + 0.06),
            (ex - 0.02 * x, ey, ez - 0.1),
            (ex + 0.03 * x, ey, ez - 0.1),
        ],
        "feathers",
        f"upper_arm_{side}",
    )
    wx, wy, wz = wrist
    body.hull(
        [
            (ex - 0.02 * x, ey + 0.02, ez + 0.07),
            (ex + 0.03 * x, ey + 0.02, ez + 0.05),
            (ex - 0.02 * x, ey + 0.02, ez - 0.09),
            (ex + 0.03 * x, ey + 0.02, ez - 0.09),
            (wx - 0.015 * x, wy, wz + 0.06),
            (wx + 0.03 * x, wy, wz + 0.05),
            (wx - 0.015 * x, wy, wz - 0.09),
            (wx + 0.03 * x, wy, wz - 0.09),
        ],
        "feathers",
        f"forearm_{side}",
    )
    tx, ty, tz = tip
    for dz, reach in ((0.03, 0.0), (-0.02, 0.02), (-0.07, 0.01)):
        body.hull(
            [
                (wx - 0.01 * x, wy + 0.03, wz + dz - 0.025),
                (wx + 0.025 * x, wy + 0.03, wz + dz - 0.025),
                (wx - 0.01 * x, wy + 0.03, wz + dz + 0.025),
                (wx + 0.025 * x, wy + 0.03, wz + dz + 0.025),
                (tx + 0.01 * x, ty - reach, tz + dz - 0.02),
            ],
            "flight-feathers",
            f"hand_{side}",
        )


def leg(body: Body, side: str, x: int) -> None:
    """A short shank out of the belly feathers, three toes gripping the cushion's front edge and
    one behind."""
    hip, knee, ankle, _toe = (mirror(p, x) for p in BIPED.leg)
    body.hull(limb(hip, knee, 0.03, 0.022, 5), "feathers", f"thigh_{side}")
    body.hull(limb(knee, ankle, 0.012, 0.012, 5), "legs", f"shin_{side}")
    ax, ay, az = ankle
    for dx, reach in ((-0.025, 0.045), (0.0, 0.055), (0.025, 0.045)):
        body.hull(
            limb((ax, ay, az), (ax + dx, SEAT - 0.012, az + reach), 0.01, 0.006, 4),
            "legs",
            f"foot_{side}",
        )
    body.hull(
        limb((ax, ay, az), (ax, SEAT + 0.004, az - 0.04), 0.008, 0.005, 4), "legs", f"foot_{side}"
    )


def tail(body: Body) -> None:
    """A fan of tail feathers hanging down behind the cushion, narrow at the root."""
    widths = [0.05, 0.075, 0.09]
    for i in range(len(TAIL) - 1):
        (ax, ay, az), (bx, by, bz) = TAIL[i], TAIL[i + 1]
        wa, wb = widths[i], widths[i + 1]
        body.hull(
            [
                (ax - wa, ay, az + 0.015),
                (ax + wa, ay, az + 0.015),
                (ax - wa, ay, az - 0.015),
                (ax + wa, ay, az - 0.015),
                (bx - wb, by, bz + 0.012),
                (bx + wb, by, bz + 0.012),
                (bx - wb, by, bz - 0.012),
                (bx + wb, by, bz - 0.012),
            ]
            + ([(bx, by - 0.035, bz - 0.01)] if i == len(TAIL) - 2 else []),
            "flight-feathers",
            f"tail_{i + 1}",
        )


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    materials = {part: material(part, hex_colour) for part, hex_colour in COLOURS.items()}
    rig = armature("crow", BIPED)
    body = Body(materials)
    build_body(body)
    body.finish("crow-body", rig.object)
    anchors(rig, BIPED)
    clips(rig, BIPED, Style(stride=0.4, knee=0.5, head=(-8, 10, 0)))
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import previews

        previews(
            rig,
            os.path.abspath(args.previews),
            HEIGHT,
            room="pub",
            clips=("idle", "talk", "walk"),
            entity="sheryl-caw",
        )


main()
