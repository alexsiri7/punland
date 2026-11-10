"""The rival: a dog, a singer, always one step ahead of the cat. Smug and stylish where the cat is
scruffy: a black leather jacket with its collar up over a cream shirt, a slicked quiff, drop ears,
narrow trousers and pointed shoes. The music shop's reference art (docs/design/rooms/music-shop.svg,
`#rival`) is the reference: a big head with a square muzzle, the ears hanging past the jaw, the
eyes half shut, the jacket open in a V. About 1.6 m to the top of the quiff.

    blender -b --factory-startup --python art/blender/rival.py -- \\
        --out frontend/public/models/characters/rival.glb \\
        [--previews docs/screenshots/blender/rival]

Built from scratch every run. Points are in glTF axes, metres: +Y up, facing +Z, his left +X.
"""

import os
import sys
from itertools import pairwise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, blend, limb, ring, symmetric
from lib.clips import REST_ARMS, Style, clips
from lib.export import arguments, empty_scene, export_glb
from lib.palette import material
from lib.rig import SIDES, Biped, anchors, armature, mirror
from lib.rig import torso as torso_skin

# The music shop's reference art for all of him; STYLE.md's palette for the eyes.
COLOURS = {
    "fur": "#C98A6C",
    "muzzle": "#A86E54",
    "nose": "#2F2D35",
    "mouth": "#2F2D35",
    "ears": "#6E4038",
    "quiff": "#5A332D",
    "eyes": "#F4EFE6",
    "pupils": "#16161A",
    "lids": "#2F2D35",
    "jacket": "#2F2D35",
    "collar": "#1E1E24",
    "shirt": "#D9CDB4",
    "trousers": "#26262C",
    "shoes": "#1E1E24",
}

#: Metres, to the top of the quiff; the registry's `height` for character/rival.
HEIGHT = 1.6

# Long legs and a big head, standing straight: he has nothing to slouch about. The ears hang down
# from the top of the head, so their bones point down.
BIPED = Biped(
    spine=(
        (0, 0.74, 0),
        (0, 0.88, 0),
        (0, 1.05, 0.005),
        (0, 1.22, 0.01),
        (0, 1.3, 0.01),
        (0, HEIGHT, 0.01),
    ),
    arm=((0.2, 1.22, 0.0), (0.23, 0.98, -0.01), (0.25, 0.78, 0.02), (0.25, 0.7, 0.03)),
    leg=((0.08, 0.76, 0), (0.08, 0.42, 0.01), (0.08, 0.08, 0), (0.08, 0.0, 0.17)),
    back=(0, 1.0, -0.17),
    ears=((0.12, 1.54, -0.01), (0.185, 1.31, -0.01)),
)

#: The jacket's rings, bottom to top: (height, half width, half depth, how far forward).
TORSO = [
    (0.68, 0.19, 0.12, 0),
    (0.86, 0.175, 0.115, 0.005),
    (1.06, 0.2, 0.125, 0.015),
    (1.2, 0.21, 0.12, 0.01),
    (1.26, 0.14, 0.09, 0.01),
]
TORSO_SKIN = torso_skin(BIPED)

#: The eyes' height on his face, and how far either side of the middle.
EYE_Y, EYE_X = 1.465, 0.058

#: The jacket's opening: the top of the V at the collar, its point at the second button, and the
#: heights its decals follow the jacket at.
V_TOP, V_BOTTOM, V_WIDTH = 1.255, 0.95, 0.065
V_ROWS = [V_TOP - (V_TOP - V_BOTTOM) * i / 6 for i in range(7)]


def v_half(y: float) -> float:
    """The V's half width at height `y`."""
    return V_WIDTH * (y - V_BOTTOM) / (V_TOP - V_BOTTOM)


def build_body(body: Body) -> None:
    head(body)
    torso(body)
    for side, x in SIDES.items():
        arm(body, side, x)
        leg(body, side, x)


def head(body: Body) -> None:
    body.hull(
        limb((0, 1.18, 0.0), (0, 1.32, 0.01), 0.065, 0.06, 6),
        "fur",
        blend((0, "chest"), (1.22, "neck"), (1.3, "head"), soft=0.03),
    )
    skull = body.hull(
        symmetric(
            [
                (0, 1.28, 0.05),
                (0.08, 1.29, 0.03),
                (0.1, 1.3, -0.05),
                (0, 1.29, -0.08),
                (0.09, 1.34, 0.08),
                (0, 1.34, 0.09),
                (0.135, 1.37, 0.0),
                (0.13, 1.42, -0.07),
                (0.1, 1.49, 0.09),
                (0, 1.51, 0.1),
                (0.125, 1.5, 0.03),
                (0.115, 1.55, -0.03),
                (0.06, 1.575, 0.02),
                (0, 1.58, 0.01),
                (0.09, 1.54, -0.1),
                (0, 1.55, -0.12),
                (0, 1.42, -0.13),
            ]
        ),
        "fur",
        "head",
    )
    muzzle = body.hull(
        symmetric(
            [
                (0.075, 1.4, 0.06),
                (0.07, 1.29, 0.05),
                (0, 1.42, 0.08),
                (0, 1.28, 0.06),
                (0.06, 1.395, 0.19),
                (0.055, 1.3, 0.18),
                (0, 1.405, 0.2),
                (0, 1.29, 0.19),
            ]
        ),
        "muzzle",
        "head",
    )
    body.hull(
        symmetric([(0.03, 1.405, 0.195), (0.026, 1.375, 0.2), (0, 1.415, 0.2), (0, 1.365, 0.205)])
        + [(0, 1.395, 0.225)],
        "nose",
        "head",
    )
    # A smirk: the mouth turning up at his left.
    smirk = [(-0.035, 1.318), (0.025, 1.314), (0.048, 1.335), (0.042, 1.338), (0.022, 1.322)]
    body.decal(muzzle, smirk, 0.004, "mouth", "head")
    for side, x in SIDES.items():
        eye(body, skull, x)
        ear(body, side, x)
    quiff(body)


def eye(body: Body, skull, x: int) -> None:
    """Half shut: the white below a flat lid, and the pupil looking off to his right."""
    white = [
        (x * EYE_X + dx, EYE_Y + dy)
        for dx, dy in ((-0.026, 0.002), (-0.016, -0.014), (0.016, -0.014), (0.026, 0.002))
    ]
    body.decal(skull, white, 0.004, "eyes", "head")
    px = x * EYE_X - 0.008
    pupil = [(px + dx, EYE_Y + dy) for dx, dy in ((-0.008, 0), (0.008, 0), (0, -0.012))]
    body.decal(skull, pupil, 0.007, "pupils", "head")
    lid = [
        (x * EYE_X + dx, EYE_Y + dy)
        for dx, dy in ((-0.032, -0.001), (0.032, -0.001), (0.03, 0.012), (-0.03, 0.008))
    ]
    body.decal(skull, lid, 0.009, "lids", "head")


def ear(body: Body, side: str, x: int) -> None:
    """A flap hanging down the side of his head from the crown, past the jaw."""
    flap = [
        (0.1, 1.56, 0.03),
        (0.1, 1.56, -0.05),
        (0.135, 1.555, 0.03),
        (0.135, 1.555, -0.05),
        (0.155, 1.43, 0.055),
        (0.19, 1.43, 0.055),
        (0.155, 1.43, -0.065),
        (0.19, 1.43, -0.065),
        (0.17, 1.3, 0.0),
        (0.195, 1.3, -0.02),
    ]
    body.hull([mirror(p, x) for p in flap], "ears", f"ear_{side}")


def quiff(body: Body) -> None:
    """Slicked up off the brow and swept forward over it: the crown of the model."""
    body.hull(
        symmetric(
            [
                (0.08, 1.54, 0.07),
                (0.05, 1.575, 0.12),
                (0, 1.585, 0.15),
                (0, 1.555, 0.13),
                (0.06, 1.6, 0.03),
                (0, HEIGHT, 0.05),
                (0.09, 1.57, -0.05),
                (0, 1.58, -0.08),
            ]
        ),
        "quiff",
        "head",
    )


def torso(body: Body) -> None:
    jacket = body.hull(
        [p for y, w, d, f in TORSO for p in ring((0, y, f), w, d)], "jacket", TORSO_SKIN
    )
    # Open down the front to the second button: the shirt in a V, the lapels either side of it.
    # The jacket bulges, so both follow it at every few centimetres down, or their hulls would cut
    # under it.
    body.decal(
        jacket,
        [(x * v_half(y) * t, y) for y in V_ROWS for x in (1, -1) for t in (0, 1)],
        0.006,
        "shirt",
        TORSO_SKIN,
    )
    for x in (1, -1):
        for top, bottom in pairwise(V_ROWS):
            lapel = [(x * v_half(y) * w, y) for y in (top, bottom) for w in (1, 1.6)]
            body.decal(jacket, lapel, 0.01, "collar", TORSO_SKIN)
    waistband = ring((0, 0.68, 0), 0.195, 0.125) + ring((0, 0.73, 0.001), 0.19, 0.122)
    body.hull(waistband, "collar", "hips")
    # The collar turned up round the back and sides of his neck, open at the front.
    body.hull(
        symmetric(
            [
                (0.12, 1.22, 0.06),
                (0.14, 1.22, -0.06),
                (0.08, 1.22, -0.105),
                (0, 1.22, -0.115),
                (0.14, 1.34, 0.02),
                (0.145, 1.34, -0.075),
                (0.08, 1.35, -0.125),
                (0, 1.35, -0.135),
            ]
        ),
        "collar",
        "chest",
    )
    body.hull(ring((0, 0.6, 0), 0.165, 0.1) + ring((0, 0.74, 0), 0.17, 0.105), "trousers", "hips")


def arm(body: Body, side: str, x: int) -> None:
    """A leather sleeve, a turned-back cuff, and a paw."""
    shoulder, elbow, wrist, tip = (mirror(p, x) for p in BIPED.arm)
    body.hull(limb(shoulder, elbow, 0.058, 0.05, 6), "jacket", f"upper_arm_{side}")
    body.hull(limb(elbow, wrist, 0.05, 0.046, 6), "jacket", f"forearm_{side}")
    wx, wy, wz = wrist
    body.hull(limb((wx, wy + 0.04, wz), (wx, wy, wz), 0.052, 0.052, 6), "collar", f"forearm_{side}")
    tx, ty, tz = tip
    body.hull(
        limb((wx, wy, wz), (wx, wy - 0.02, wz), 0.034, 0.038, 6)
        + [
            (tx, ty, tz + 0.01),
            (tx + 0.02 * x, ty + 0.015, tz),
            (tx - 0.02 * x, ty + 0.015, tz + 0.015),
            (tx, ty + 0.03, tz + 0.04),
        ],
        "fur",
        f"hand_{side}",
    )


def leg(body: Body, side: str, x: int) -> None:
    """Narrow trousers down to pointed shoes."""
    hip, knee, ankle, toe = (mirror(p, x) for p in BIPED.leg)
    body.hull(limb(hip, knee, 0.072, 0.056, 6), "trousers", f"thigh_{side}")
    body.hull(limb(knee, ankle, 0.056, 0.05, 6), "trousers", f"shin_{side}")
    ax, ay, az = ankle
    tx, _, tz = toe
    w = 0.045
    body.hull(
        [
            (ax - w, 0.0, az - 0.06),
            (ax + w, 0.0, az - 0.06),
            (ax - w, ay + 0.02, az - 0.05),
            (ax + w, ay + 0.02, az - 0.05),
            (ax - w, 0.0, az + 0.06),
            (ax + w, 0.0, az + 0.06),
            (ax - w * 0.8, ay, az + 0.06),
            (ax + w * 0.8, ay, az + 0.06),
            (tx, 0.0, tz),
            (tx, 0.03, tz - 0.02),
        ],
        "shoes",
        f"foot_{side}",
    )


def smug(rig) -> None:
    """The `smug` expression: he leans back, puts a paw on his hip and looks down his nose."""
    pose = {
        **REST_ARMS,
        "spine": {"turn": (-3, 0, 0)},
        "chest": {"turn": (-4, 6, 0)},
        "head": {"turn": (-12, 16, 6)},
        "upper_arm_r": {"turn": (10, 0, -35)},
        "forearm_r": {"turn": (0, 0, 75)},
        "ear_l": {"turn": (0, 0, 6)},
    }
    rig.clip("smug", {0: REST_ARMS, 8: pose, 20: pose, 28: REST_ARMS})


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    materials = {part: material(part, hex_colour) for part, hex_colour in COLOURS.items()}
    rig = armature("rival", BIPED)
    body = Body(materials)
    build_body(body)
    body.finish("rival-body", rig.object)
    anchors(rig, BIPED)
    clips(rig, BIPED, Style(stride=1.1, knee=0.9, head=(-6, 12, 0)))
    smug(rig)
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import previews

        previews(
            rig,
            os.path.abspath(args.previews),
            HEIGHT,
            room="music-shop",
            clips=("idle", "talk", "walk", "smug"),
            entity="rival",
        )


main()
