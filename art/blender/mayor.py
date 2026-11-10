"""The Mayor of Punland: a mare, tall and dignified, with a long gold mane (she makes the cat a
guitar string out of it, so it has to read), and a red sash of office from her right shoulder to
her left hip with a gold medal on it. The Mayor's office reference art
(docs/design/rooms/mayors-office.svg, `#mayor`) is the reference: a chestnut coat, a long head with
its ears up, the mane falling over her right shoulder, dark hooves. About 1.8 m to the tips of the
ears: the tallest of the cast.

    blender -b --factory-startup --python art/blender/mayor.py -- \\
        --out frontend/public/models/characters/mayor.glb \\
        [--previews docs/screenshots/blender/mayor]

Built from scratch every run. Points are in glTF axes, metres: +Y up, facing +Z, her left +X.
"""

import os
import sys
from itertools import pairwise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, blend, limb, ring
from lib.clips import Style, clips
from lib.export import arguments, empty_scene, export_glb
from lib.palette import material
from lib.rig import SIDES, Biped, anchors, armature, mirror
from lib.rig import torso as torso_skin

# The Mayor's office reference art for her; STYLE.md's ink for the eyes and nostrils.
COLOURS = {
    "coat": "#6E4038",
    "muzzle": "#5A332D",
    "hooves": "#2F2D35",
    "eyes": "#2F2D35",
    "mane": "#E3C58A",
    "mane-lock": "#C99A54",
    "sash": "#C8483B",
    "medal": "#E3C58A",
}

#: Metres, to the tips of the ears; the registry's `height` for character/mayor.
HEIGHT = 1.8

#: The tail's joints, from the back of the hips down behind her legs.
TAIL = [(0, 0.86, -0.14), (0, 0.76, -0.25), (0, 0.6, -0.32), (0, 0.46, -0.34)]

# Long legs and a long neck carrying the head up and a little forward.
BIPED = Biped(
    spine=(
        (0, 0.82, 0),
        (0, 0.98, 0),
        (0, 1.14, 0.0),
        (0, 1.34, 0.0),
        (0, 1.52, 0.03),
        (0, 1.72, 0.02),
    ),
    arm=((0.2, 1.3, 0), (0.22, 1.05, -0.01), (0.23, 0.82, 0.02), (0.23, 0.72, 0.03)),
    leg=((0.09, 0.82, 0), (0.09, 0.45, 0.03), (0.09, 0.08, 0), (0.09, 0.0, 0.11)),
    back=(0, 1.15, -0.15),
    ears=((0.05, 1.66, 0.0), (0.065, HEIGHT, -0.01)),
    tail=tuple(TAIL),
)

#: Her body's rings, bottom to top: (height, half width, half depth, how far forward). A deep
#: chest, square at the shoulders.
TORSO = [
    (0.78, 0.15, 0.12, 0.0),
    (0.92, 0.155, 0.125, 0.0),
    (1.06, 0.16, 0.14, 0.01),
    (1.2, 0.18, 0.145, 0.015),
    (1.3, 0.18, 0.125, 0.0),
    (1.37, 0.09, 0.09, 0.0),
]
TORSO_SKIN = torso_skin(BIPED)

#: The sash's centre line, her right shoulder down to her left hip, as (x, y) on her front and
#: back alike, and its half width.
SASH = [(-0.12, 1.27), (-0.06, 1.18), (0.02, 1.08), (0.08, 0.98), (0.11, 0.9)]
SASH_HALF = 0.035

#: The mane's fall over her right shoulder, root to tip: (point, radius).
LOCK = [
    ((-0.05, 1.62, -0.03), 0.04),
    ((-0.1, 1.45, 0.0), 0.05),
    ((-0.15, 1.3, 0.07), 0.05),
    ((-0.16, 1.14, 0.13), 0.04),
    ((-0.15, 0.98, 0.15), 0.025),
]


def build_body(body: Body) -> None:
    head(body)
    mane(body)
    torso(body)
    for side, x in SIDES.items():
        arm(body, side, x)
        leg(body, side, x)
    tail(body)


def head(body: Body) -> None:
    body.hull(
        limb((0, 1.3, 0.0), (0, 1.58, 0.05), 0.075, 0.065, 6),
        "coat",
        blend((0, "chest"), (1.34, "neck"), (1.52, "head"), soft=0.04),
    )
    skull = body.hull(
        ring((0, 1.55, 0.03), 0.065, 0.08)
        + ring((0, 1.64, 0.03), 0.075, 0.085)
        + ring((0, 1.71, 0.02), 0.05, 0.06),
        "coat",
        "head",
    )
    # The long face, dipping forward and down to a soft dark muzzle.
    body.hull(limb((0, 1.63, 0.08), (0, 1.5, 0.22), 0.06, 0.05, 6), "coat", "head")
    muzzle = body.hull(
        ring((0, 1.46, 0.24), 0.052, 0.05) + ring((0, 1.53, 0.25), 0.05, 0.05),
        "muzzle",
        "head",
    )
    for side, x in SIDES.items():
        nostril = [(x * 0.02, 1.5), (x * 0.032, 1.5), (x * 0.026, 1.52)]
        body.decal(muzzle, nostril, 0.004, "eyes", "head")
        eye(body, skull, x)
        ear(body, side, x)


def eye(body: Body, skull, x: int) -> None:
    """Calm and half-lidded, set wide on the long head."""
    outline = [(x * dx, 1.63 + dy) for dx, dy in ((0.04, 0.0), (0.065, 0.006), (0.064, -0.01))]
    body.decal(skull, outline, 0.006, "eyes", "head")


def ear(body: Body, side: str, x: int) -> None:
    """Upright and pointed."""
    base, tip = (mirror(p, x) for p in BIPED.ears)
    bx, by, bz = base
    body.hull(
        [(bx + dx, by, bz + dz) for dx, dz in ((-0.025, 0.0), (0.025, 0.0), (0.0, 0.025))]
        + [(bx, by, bz - 0.02), tip],
        "coat",
        f"ear_{side}",
    )


def mane(body: Body) -> None:
    """Gold, long and full: a forelock between her ears, a crest down the back of her neck, and a
    long fall over her right shoulder down to the bottom of her chest."""
    body.hull(
        ring((0, 1.72, 0.04), 0.03, 0.02)
        + [(0, 1.63, 0.1), (0.02, 1.65, 0.09), (-0.02, 1.65, 0.09)],
        "mane",
        "head",
    )
    crest = [
        ((0, 1.74, 0.0), 0.04),
        ((0, 1.6, -0.06), 0.055),
        ((0, 1.45, -0.09), 0.06),
        ((0, 1.32, -0.12), 0.05),
    ]
    skin = blend((0, "chest"), (1.34, "neck"), (1.52, "head"), soft=0.04)
    for (a, ra), (b, rb) in pairwise(crest):
        body.hull(limb(a, b, ra, rb, 6), "mane", skin)
    for i, ((a, ra), (b, rb)) in enumerate(pairwise(LOCK)):
        body.hull(limb(a, b, ra, rb, 6), "mane" if i % 2 == 0 else "mane-lock", skin)


def torso(body: Body) -> None:
    trunk = body.hull(
        [p for y, w, d, f in TORSO for p in ring((0, y, f), w, d)], "coat", TORSO_SKIN
    )
    # The sash, in pieces so it follows her body, front and back.
    for back in (False, True):
        for (ax, ay), (bx, by) in pairwise(SASH):
            band = [(x, y + dy) for x, y in ((ax, ay), (bx, by)) for dy in (-SASH_HALF, SASH_HALF)]
            body.decal(trunk, band, 0.008, "sash", TORSO_SKIN, back=back)
    # The medal of office on her chest, and the sash's knot at her hip.
    medal = [(0.0 + dx, 1.08 + dy) for dx, dy in ((-0.045, 0), (0, -0.05), (0.045, 0), (0, 0.045))]
    body.decal(trunk, medal, 0.016, "medal", TORSO_SKIN)
    knot = [(0.11 + dx, 0.88 + dy) for dx, dy in ((-0.03, 0), (0, -0.03), (0.03, 0), (0, 0.03))]
    body.decal(trunk, knot, 0.014, "sash", TORSO_SKIN)


def arm(body: Body, side: str, x: int) -> None:
    """A long arm down to a dark hoof of a hand."""
    shoulder, elbow, wrist, tip = (mirror(p, x) for p in BIPED.arm)
    body.hull(limb(shoulder, elbow, 0.055, 0.045, 6), "coat", f"upper_arm_{side}")
    body.hull(limb(elbow, wrist, 0.045, 0.04, 6), "coat", f"forearm_{side}")
    body.hull(limb(wrist, tip, 0.045, 0.04, 6), "hooves", f"hand_{side}")


def leg(body: Body, side: str, x: int) -> None:
    """A long leg down to a hoof."""
    hip, knee, ankle, toe = (mirror(p, x) for p in BIPED.leg)
    body.hull(limb(hip, knee, 0.075, 0.05, 6), "coat", f"thigh_{side}")
    body.hull(limb(knee, ankle, 0.05, 0.04, 6), "coat", f"shin_{side}")
    ax, ay, az = ankle
    _, _, tz = toe
    body.hull(
        ring((ax, 0.0, (az + tz) / 2 - 0.01), 0.055, 0.07)
        + ring((ax, ay, az + 0.005), 0.045, 0.05),
        "hooves",
        f"foot_{side}",
    )


def tail(body: Body) -> None:
    """Long and gold like the mane, full at the root."""
    radii = [0.035, 0.055, 0.05, 0.02]
    for i, (a, b) in enumerate(pairwise(TAIL)):
        body.hull(limb(a, b, radii[i], radii[i + 1], 6), "mane", f"tail_{i + 1}")


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    materials = {part: material(part, hex_colour) for part, hex_colour in COLOURS.items()}
    rig = armature("mayor", BIPED)
    body = Body(materials)
    build_body(body)
    body.finish("mayor-body", rig.object)
    anchors(rig, BIPED)
    clips(rig, BIPED, Style(stride=0.85, knee=0.8, head=(-5, 0, 0)))
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import previews

        previews(
            rig,
            os.path.abspath(args.previews),
            HEIGHT,
            room="mayors-office",
            clips=("idle", "talk", "walk"),
            entity="mayor",
        )


main()
