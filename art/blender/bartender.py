"""The bartender at The Three Crows: a tall crow in a bib apron, a bar towel tucked in its
waistband, her wings for arms. The pub's reference art (docs/design/rooms/pub.svg, `#bartender`)
is the reference: a long tapering body, a gold beak, two crest feathers, and the apron's straps
up to the neck. About 1.55 m to the tips of the crest.

    blender -b --factory-startup --python art/blender/bartender.py -- \\
        --out frontend/public/models/characters/bartender.glb \\
        [--previews docs/screenshots/blender/bartender]

Built from scratch every run. Points are in glTF axes, metres: +Y up, facing +Z, her left +X.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, blend, limb, ring, symmetric
from lib.clips import Style, clips
from lib.export import arguments, empty_scene, export_glb
from lib.palette import material
from lib.rig import SIDES, Biped, anchors, armature, mirror
from lib.rig import torso as torso_skin

# The pub's reference art for the feathers, apron, beak and eyes; STYLE.md's palette for the rest.
COLOURS = {
    "feathers": "#2F2D35",
    "flight-feathers": "#26272E",
    "beak": "#E3C58A",
    "legs": "#C99A54",
    "eyes": "#F4EFE6",
    "pupils": "#16161A",
    "apron": "#D9CDB4",
    "apron-straps": "#C9C0AE",
    "towel": "#F4EFE6",
    "towel-stripe": "#C8483B",
}

#: Metres, to the tips of the crest; the registry's `height` for character/bartender.
HEIGHT = 1.55

#: The tail's joints, from under the hem at the back, fanning down behind her legs.
TAIL = [(0, 0.6, -0.13), (0, 0.46, -0.21), (0, 0.34, -0.26)]

# A bird's legs: the knee forward under the body, the hock back, standing on the toes. The crest's
# two feathers take the place of ears, so they get ear bones and flick in the idle.
BIPED = Biped(
    spine=(
        (0, 0.58, 0),
        (0, 0.74, 0),
        (0, 0.94, 0.01),
        (0, 1.12, 0.02),
        (0, 1.2, 0.03),
        (0, 1.46, 0.03),
    ),
    arm=((0.17, 1.1, 0.0), (0.21, 0.87, -0.02), (0.22, 0.66, 0.02), (0.22, 0.5, 0.05)),
    leg=(
        (0.08, 0.58, 0),
        (0.08, 0.38, 0.06),
        (0.08, 0.18, -0.04),
        (0.08, 0.03, 0.03),
        (0.08, 0.01, 0.13),
    ),
    back=(0, 0.88, -0.16),
    ears=((0.025, 1.43, 0.0), (0.05, 1.55, -0.04)),
    tail=tuple(TAIL),
)

#: The body's rings, bottom to top: (height, half width, half depth, how far forward).
TORSO = [
    (0.43, 0.17, 0.13, 0),
    (0.62, 0.2, 0.15, 0.01),
    (0.84, 0.2, 0.15, 0.015),
    (1.02, 0.18, 0.13, 0.02),
    (1.12, 0.12, 0.1, 0.025),
]
TORSO_SKIN = torso_skin(BIPED)


def build_body(body: Body) -> None:
    head(body)
    torso(body)
    for side, x in SIDES.items():
        wing(body, side, x)
        leg(body, side, x)
    tail(body)


def head(body: Body) -> None:
    body.hull(
        ring((0, 1.1, 0.025), 0.09, 0.08) + ring((0, 1.24, 0.035), 0.075, 0.07),
        "feathers",
        blend((0, "chest"), (1.14, "neck"), soft=0.03),
    )
    skull = body.hull(
        symmetric(
            [
                (0, 1.2, 0.08),
                (0.07, 1.21, 0.05),
                (0.1, 1.27, 0.0),
                (0.06, 1.2, -0.06),
                (0, 1.22, -0.1),
                (0.11, 1.34, 0.01),
                (0.085, 1.33, 0.08),
                (0.05, 1.29, 0.1),
                (0, 1.28, 0.11),
                (0.07, 1.4, 0.07),
                (0, 1.42, 0.08),
                (0.09, 1.41, -0.03),
                (0.05, 1.46, 0.0),
                (0, 1.465, 0.01),
                (0.08, 1.33, -0.1),
                (0, 1.36, -0.12),
            ]
        ),
        "feathers",
        "head",
    )
    # Long and pointed, a little hooked, the bill's base wide on the face.
    body.hull(
        symmetric(
            [
                (0.045, 1.33, 0.07),
                (0.04, 1.27, 0.075),
                (0, 1.35, 0.1),
                (0, 1.255, 0.09),
                (0.018, 1.31, 0.2),
                (0, 1.315, 0.24),
                (0, 1.29, 0.3),
            ]
        ),
        "beak",
        "head",
    )
    for x in SIDES.values():
        eye = [
            (x * (0.05 + dx), 1.36 + dy)
            for dx, dy in (
                (-0.022, 0.0),
                (-0.012, 0.018),
                (0.01, 0.02),
                (0.024, 0.004),
                (0.014, -0.016),
                (-0.008, -0.018),
            )
        ]
        body.decal(skull, eye, 0.004, "eyes", "head")
        pupil = [
            (x * (0.044 + dx), 1.36 + dy)
            for dx, dy in ((-0.009, 0), (0, 0.011), (0.009, 0), (0, -0.011))
        ]
        body.decal(skull, pupil, 0.008, "pupils", "head")
    crest(body)


def crest(body: Body) -> None:
    """Two feathers standing up off the crown, leaning back, one each side."""
    for side, x in SIDES.items():
        base, tip = (mirror(p, x) for p in BIPED.ears)
        bx, by, bz = base
        body.hull(
            [
                (bx - 0.02, by, bz + 0.03),
                (bx + 0.02 * x, by, bz - 0.03),
                (bx - 0.02, by, bz - 0.03),
                (bx + 0.02 * x, by + 0.02, bz + 0.02),
                tip,
            ],
            "feathers",
            f"ear_{side}",
        )


def torso(body: Body) -> None:
    feathers = body.hull(
        [p for y, w, d, f in TORSO for p in ring((0, y, f), w, d)], "feathers", TORSO_SKIN
    )
    # The bib apron, narrow at the chest and wide at the hem, its straps up round the neck. The
    # body curves away at the sides, so the skirt and waistband take points across the front too,
    # or their hulls would cut behind it.
    across = (-0.14, -0.07, 0, 0.07, 0.14)
    apron = body.decal(
        feathers,
        [(-0.08, 1.0), (0.08, 1.0), (0.1, 0.84), (-0.1, 0.84)]
        + [(x, y) for x in across for y in (0.46, 0.63, 0.8)],
        0.008,
        "apron",
        TORSO_SKIN,
    )
    for x in (1, -1):
        strap = [(x * 0.075 + dx, y) for y in (0.995, 1.11) for dx in (-0.008, 0.008)]
        body.decal(feathers, strap, 0.006, "apron-straps", "chest")
    waistband = [(x, y) for x in (-0.17, *across, 0.17) for y in (0.765, 0.79)]
    body.decal(feathers, waistband, 0.014, "apron-straps", TORSO_SKIN)
    pocket = [(x, y) for x in (-0.07, 0, 0.07) for y in (0.56, 0.68)]
    body.decal(apron, pocket, 0.005, "apron-straps", TORSO_SKIN)
    towel(body)


def towel(body: Body) -> None:
    """The bar towel, tucked in the apron's waistband on her right and hanging down her hip."""
    for part, y0, y1 in (("towel", 0.55, 0.8), ("towel-stripe", 0.62, 0.66)):
        lift = 0.0 if part == "towel" else 0.006
        body.hull(
            [
                (-0.205 - lift, y0, 0.045),
                (-0.195 - lift, y1, 0.06),
                (-0.195 - lift, y0, 0.135),
                (-0.18 - lift, y1, 0.12),
                (-0.17, y0, 0.045),
                (-0.17, y1, 0.06),
                (-0.165, y0, 0.135),
                (-0.155, y1, 0.12),
            ],
            part,
            "hips",
        )


def wing(body: Body, side: str, x: int) -> None:
    """A wing folded down the side as an arm: a broad blade to the wrist, then the flight
    feathers as fingers."""
    shoulder, elbow, wrist, tip = (mirror(p, x) for p in BIPED.arm)
    sx, sy, sz = shoulder
    body.hull(
        [
            (sx - 0.035 * x, sy + 0.04, sz),
            (sx + 0.03 * x, sy + 0.02, sz + 0.07),
            (sx + 0.03 * x, sy + 0.02, sz - 0.08),
            (sx + 0.04 * x, sy - 0.04, sz),
        ]
        + limb(shoulder, elbow, 0.055, 0.05, 6),
        "feathers",
        f"upper_arm_{side}",
    )
    ex, ey, ez = elbow
    wx, wy, wz = wrist
    body.hull(
        [
            (ex - 0.02 * x, ey + 0.03, ez + 0.06),
            (ex + 0.03 * x, ey + 0.03, ez + 0.05),
            (ex - 0.02 * x, ey + 0.03, ez - 0.08),
            (ex + 0.03 * x, ey + 0.03, ez - 0.08),
            (wx - 0.015 * x, wy, wz + 0.05),
            (wx + 0.025 * x, wy, wz + 0.05),
            (wx - 0.015 * x, wy, wz - 0.05),
            (wx + 0.025 * x, wy, wz - 0.05),
        ],
        "feathers",
        f"forearm_{side}",
    )
    tx, ty, tz = tip
    for dz, reach in ((0.04, 0.0), (0.0, 0.03), (-0.04, 0.01)):
        body.hull(
            [
                (wx - 0.012 * x, wy + 0.03, wz + dz - 0.022),
                (wx + 0.02 * x, wy + 0.03, wz + dz - 0.022),
                (wx - 0.012 * x, wy + 0.03, wz + dz + 0.022),
                (wx + 0.02 * x, wy + 0.03, wz + dz + 0.022),
                (tx + 0.004 * x, ty - reach, tz + dz - 0.03),
            ],
            "flight-feathers",
            f"hand_{side}",
        )


def leg(body: Body, side: str, x: int) -> None:
    hip, knee, hock, ball, toe = (mirror(p, x) for p in BIPED.leg)
    body.hull(limb(hip, knee, 0.075, 0.05, 6), "feathers", f"thigh_{side}")
    body.hull(limb(knee, hock, 0.04, 0.025, 6), "feathers", f"shin_{side}")
    body.hull(limb(hock, ball, 0.016, 0.016, 5), "legs", f"foot_{side}")
    bx, by, bz = ball
    for dx, reach in ((-0.035, 0.08), (0.0, 0.1), (0.035, 0.08)):
        body.hull(
            limb((bx, by, bz), (bx + dx, 0.012, bz + reach), 0.014, 0.008, 4),
            "legs",
            f"toe_{side}",
        )
    body.hull(limb((bx, by, bz), (bx, 0.012, bz - 0.06), 0.012, 0.007, 4), "legs", f"foot_{side}")


def tail(body: Body) -> None:
    """A fan of tail feathers, narrow at the root and broad at the tip."""
    widths = [0.06, 0.09, 0.11]
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
            + ([(bx, by - 0.04, bz - 0.01)] if i == len(TAIL) - 2 else []),
            "flight-feathers",
            f"tail_{i + 1}",
        )


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    materials = {part: material(part, hex_colour) for part, hex_colour in COLOURS.items()}
    rig = armature("bartender", BIPED)
    body = Body(materials)
    build_body(body)
    body.finish("bartender-body", rig.object)
    anchors(rig, BIPED)
    clips(rig, BIPED, Style(stride=0.8))
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import previews

        previews(
            rig,
            os.path.abspath(args.previews),
            HEIGHT,
            room="pub",
            clips=("idle", "talk", "walk"),
            entity="bartender",
        )


main()
