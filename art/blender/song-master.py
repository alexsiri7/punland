"""The Song Master: a wise old rat who gives everyone the same songwriting lesson. Old and stooped,
in a lilac cardigan buttoned down the front, with big round ears, a long pointed snout with white
whiskers and bushy white brows over eyes narrowed in thought, and a long bare tail. He holds a
conductor's baton. The flat's reference art (docs/design/rooms/flat.svg, `#song-master`) is the
reference: grey fur, pink ears, nose and tail tip, the cardigan widest at the hem, the head carried
low and forward. About 1.2 m to the top of the ears.

    blender -b --factory-startup --python art/blender/song-master.py -- \\
        --out frontend/public/models/characters/song-master.glb \\
        [--previews docs/screenshots/blender/song-master]

Built from scratch every run. Points are in glTF axes, metres: +Y up, facing +Z, his left +X.
"""

import os
import sys
from itertools import pairwise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, blend, disc, limb, ring, symmetric
from lib.clips import Style, clips
from lib.export import arguments, empty_scene, export_glb
from lib.palette import material
from lib.rig import SIDES, Biped, anchors, armature, mirror
from lib.rig import torso as torso_skin

# The flat's reference art for him; STYLE.md's palette (ink, UI text, sign gold, wood) for the
# eyes, the whiskers, the buttons and the baton.
COLOURS = {
    "fur": "#8E879C",
    "ears": "#C98A6C",
    "inner-ear": "#A86E54",
    "nose": "#C98A6C",
    "paws": "#C98A6C",
    "tail": "#C98A6C",
    "eyes": "#2F2D35",
    "whiskers": "#E8E4DC",
    "cardigan": "#8A7FA8",
    "cardigan-band": "#6E6478",
    "buttons": "#E3C58A",
    "baton": "#E8E4DC",
    "baton-grip": "#4A3A30",
}

#: Metres, to the top of the ears; the registry's `height` for character/song-master.
HEIGHT = 1.2

#: The tail's joints, from under the back of the cardigan down to the floor and trailing out
#: behind him to his left, the tip lifting off the floor.
TAIL = [
    (0.0, 0.4, -0.1),
    (0.04, 0.24, -0.2),
    (0.1, 0.07, -0.3),
    (0.2, 0.025, -0.42),
    (0.32, 0.03, -0.48),
    (0.42, 0.09, -0.48),
]

# Short legs and a stoop: the spine leans forward from the hips and the neck carries the head out
# in front of the chest, low.
BIPED = Biped(
    spine=(
        (0, 0.4, -0.01),
        (0, 0.53, 0.0),
        (0, 0.67, 0.04),
        (0, 0.8, 0.1),
        (0, 0.87, 0.14),
        (0, 1.07, 0.13),
    ),
    arm=((0.15, 0.78, 0.08), (0.17, 0.62, 0.08), (0.18, 0.47, 0.12), (0.18, 0.4, 0.13)),
    leg=((0.065, 0.41, 0), (0.065, 0.22, 0.045), (0.065, 0.05, 0), (0.065, 0.0, 0.15)),
    back=(0, 0.66, -0.11),
    ears=((0.06, 1.04, 0.11), (0.1, HEIGHT, 0.1)),
    tail=tuple(TAIL),
)

#: The cardigan's rings, bottom to top: (height, half width, half depth, how far forward). Widest
#: at the hem and leaning forward up to the collar: the stoop.
TORSO = [
    (0.36, 0.16, 0.12, 0.0),
    (0.5, 0.165, 0.125, 0.015),
    (0.64, 0.15, 0.13, 0.04),
    (0.75, 0.13, 0.115, 0.075),
    (0.82, 0.08, 0.08, 0.1),
]
TORSO_SKIN = torso_skin(BIPED)

#: The eyes' height on his face, and how far either side of the middle.
EYE_Y, EYE_X = 0.985, 0.05

#: The button band's heights, hem to collar: it follows the cardigan piece by piece.
BAND = [0.37, 0.45, 0.53, 0.61, 0.68, 0.74, 0.8]


def build_body(body: Body) -> None:
    head(body)
    torso(body)
    for side, x in SIDES.items():
        arm(body, side, x)
        leg(body, side, x)
    tail(body)
    baton(body)


def head(body: Body) -> None:
    body.hull(
        limb((0, 0.76, 0.08), (0, 0.93, 0.14), 0.06, 0.055, 6),
        "fur",
        blend((0, "chest"), (0.8, "neck"), (0.87, "head"), soft=0.03),
    )
    skull = body.hull(
        ring((0, 0.89, 0.13), 0.06, 0.07)
        + ring((0, 0.96, 0.13), 0.088, 0.09)
        + ring((0, 1.03, 0.125), 0.078, 0.08)
        + ring((0, 1.07, 0.12), 0.04, 0.05),
        "fur",
        "head",
    )
    # The snout: long and pointed, dipping as it goes.
    body.hull(limb((0, 0.935, 0.18), (0, 0.885, 0.33), 0.05, 0.02, 6), "fur", "head")
    body.hull(
        ring((0, 0.882, 0.335), 0.019, 0.016) + [(0, 0.887, 0.36), (0, 0.902, 0.34)],
        "nose",
        "head",
    )
    for side, x in SIDES.items():
        eye(body, skull, x)
        whiskers(body, x)
        ear(body, side, x)


def eye(body: Body, skull, x: int) -> None:
    """Narrowed to a slit, under a bushy white brow that droops at the outside."""
    slit = [(x * (EYE_X + dx), EYE_Y + dy) for dx, dy in ((-0.02, 0.0), (0.02, -0.004))]
    body.decal(
        skull, [(px, py + dy) for px, py in slit for dy in (-0.005, 0.005)], 0.006, "eyes", "head"
    )
    brow = [
        (x * (EYE_X + dx), EYE_Y + dy)
        for dx, dy in ((-0.022, 0.022), (0.004, 0.032), (0.026, 0.014), (0.022, 0.004))
    ]
    body.decal(skull, brow, 0.009, "whiskers", "head")


def whiskers(body: Body, x: int) -> None:
    """Three thin whiskers fanning out from either side of the snout."""
    for dy, dz in ((0.018, 0.0), (0.0, -0.02), (-0.02, -0.035)):
        body.hull(
            limb((x * 0.022, 0.895, 0.3), (x * 0.15, 0.895 + dy, 0.27 + dz), 0.003, 0.002, 3),
            "whiskers",
            "head",
        )


def ear(body: Body, side: str, x: int) -> None:
    """A big round ear on top of his head, turned a little outwards, pink inside."""
    centre = (0.1, 1.13, 0.1)
    facing = (0.4, 0.0, 1.0)

    def disc_at(z: float, radius: float, sides: int = 8):
        at = tuple(c + z * f for c, f in zip(centre, facing, strict=True))
        ahead = tuple(a + f for a, f in zip(at, facing, strict=True))
        return disc(at, ahead, radius, sides)

    body.hull(
        [mirror(p, x) for p in disc_at(-0.008, 0.07) + disc_at(0.006, 0.07)],
        "ears",
        f"ear_{side}",
    )
    body.hull(
        [mirror(p, x) for p in disc_at(0.006, 0.048) + disc_at(0.01, 0.048)],
        "inner-ear",
        f"ear_{side}",
    )


def torso(body: Body) -> None:
    cardigan = body.hull(
        [p for y, w, d, f in TORSO for p in ring((0, y, f), w, d)], "cardigan", TORSO_SKIN
    )
    body.hull(
        ring((0, 0.355, 0.0), 0.165, 0.125) + ring((0, 0.4, 0.006), 0.166, 0.126),
        "cardigan-band",
        "hips",
    )
    # Buttoned down the front: the band in pieces so it follows the cardigan's lean, and a button
    # on every other piece.
    for bottom, top in pairwise(BAND):
        band = [(dx, y) for y in (bottom, top) for dx in (-0.022, 0.022)]
        body.decal(cardigan, band, 0.006, "cardigan-band", TORSO_SKIN)
    for y in BAND[1:-1:2]:
        button = [(dx, y + dy) for dx, dy in ((-0.011, -0.011), (0.011, -0.011), (0, 0.011))]
        body.decal(cardigan, button + [(0, y - 0.014)], 0.011, "buttons", TORSO_SKIN)
    for x in (1, -1):
        pocket = [(x * 0.07, 0.41), (x * 0.13, 0.41), (x * 0.13, 0.48), (x * 0.07, 0.48)]
        body.decal(cardigan, pocket, 0.005, "cardigan-band", TORSO_SKIN)
    # A shawl collar round the back and sides of his neck, open at the throat.
    body.hull(
        symmetric(
            [
                (0.06, 0.78, 0.15),
                (0.1, 0.78, 0.06),
                (0.06, 0.78, -0.02),
                (0, 0.78, -0.03),
                (0.05, 0.86, 0.15),
                (0.085, 0.86, 0.08),
                (0.05, 0.87, 0.02),
                (0, 0.87, 0.01),
            ]
        ),
        "cardigan-band",
        "chest",
    )


def arm(body: Body, side: str, x: int) -> None:
    """A cardigan sleeve, a ribbed cuff, and a pink paw."""
    shoulder, elbow, wrist, tip = (mirror(p, x) for p in BIPED.arm)
    body.hull(limb(shoulder, elbow, 0.048, 0.042, 6), "cardigan", f"upper_arm_{side}")
    body.hull(limb(elbow, wrist, 0.042, 0.04, 6), "cardigan", f"forearm_{side}")
    wx, wy, wz = wrist
    body.hull(
        limb((wx, wy + 0.04, wz - 0.008), (wx, wy, wz), 0.045, 0.045, 6),
        "cardigan-band",
        f"forearm_{side}",
    )
    tx, ty, tz = tip
    body.hull(
        limb((wx, wy, wz), (wx, wy - 0.02, wz + 0.004), 0.028, 0.03, 6)
        + [
            (tx, ty, tz + 0.008),
            (tx + 0.018 * x, ty + 0.012, tz),
            (tx - 0.018 * x, ty + 0.012, tz + 0.012),
            (tx, ty + 0.025, tz + 0.03),
        ],
        "paws",
        f"hand_{side}",
    )


def leg(body: Body, side: str, x: int) -> None:
    """A thin furred leg down to a long bare foot."""
    hip, knee, ankle, toe = (mirror(p, x) for p in BIPED.leg)
    body.hull(limb(hip, knee, 0.048, 0.036, 6), "fur", f"thigh_{side}")
    body.hull(limb(knee, ankle, 0.036, 0.026, 6), "fur", f"shin_{side}")
    ax, ay, az = ankle
    tx, _, tz = toe
    w = 0.032
    body.hull(
        [
            (ax - w, 0.0, az - 0.05),
            (ax + w, 0.0, az - 0.05),
            (ax - w * 0.8, ay + 0.01, az - 0.03),
            (ax + w * 0.8, ay + 0.01, az - 0.03),
            (ax - w * 1.2, 0.0, tz - 0.03),
            (ax + w * 1.2, 0.0, tz - 0.03),
            (ax - w, 0.025, tz - 0.04),
            (ax + w, 0.025, tz - 0.04),
            (tx, 0.0, tz),
            (tx, 0.012, tz),
        ],
        "paws",
        f"foot_{side}",
    )


def tail(body: Body) -> None:
    """Long and bare, thick at the root and thinning to a point."""
    radii = [0.026, 0.02, 0.016, 0.012, 0.009, 0.004]
    for i, (a, b) in enumerate(pairwise(TAIL)):
        body.hull(limb(a, b, radii[i], radii[i + 1], 5), "tail", f"tail_{i + 1}")


def baton(body: Body) -> None:
    """A conductor's baton in his right paw, pointing down and forward."""
    grip = (-0.18, 0.435, 0.13)
    turn = (-0.18, 0.41, 0.17)
    point = (-0.18, 0.33, 0.37)
    body.hull(limb(grip, turn, 0.012, 0.011, 6), "baton-grip", "hand_r")
    body.hull(limb(turn, point, 0.006, 0.0035, 4), "baton", "hand_r")


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    materials = {part: material(part, hex_colour) for part, hex_colour in COLOURS.items()}
    rig = armature("song-master", BIPED)
    body = Body(materials)
    build_body(body)
    body.finish("song-master-body", rig.object)
    anchors(rig, BIPED)
    clips(rig, BIPED, Style(stride=0.6, knee=0.7, head=(8, 0, 0)))
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import previews

        previews(
            rig,
            os.path.abspath(args.previews),
            HEIGHT,
            room="flat",
            clips=("idle", "talk", "walk"),
            entity="song-master",
        )


main()
