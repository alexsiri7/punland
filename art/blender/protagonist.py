"""The protagonist: a lanky teenage ginger cat in a hoodie, jeans
and high-tops, the broken guitar on his back. docs/design/STYLE.md, board 2
(docs/design/canvas/Character.dc.html), is the reference: about 5.5 heads and 1.5 m tall with the
ears, narrow shoulders, hands past the hem, a slight forward slouch.

    blender -b --factory-startup --python art/blender/protagonist.py -- \\
        --out frontend/public/models/characters/protagonist.glb \\
        [--previews docs/screenshots/blender/protagonist]

Built from scratch every run. Points are in glTF axes, metres: +Y up, facing +Z, his left +X.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, blend, disc, limb, ring
from lib.clips import clips
from lib.export import arguments, empty_scene, export_glb
from lib.palette import material
from lib.rig import SIDES, Biped, anchors, armature
from lib.rig import torso as torso_skin

# Base tones from board 2: STYLE.md's table for the big parts, the board's own art for the details.
COLOURS = {
    "fur": "#D88A4A",
    "muzzle": "#EBC9A4",
    "nose": "#9E5A5A",
    "inner-ear": "#B97A6E",
    "eyes": "#F4EFE6",
    "pupils": "#16161A",
    "brows": "#7A4524",
    "hoodie": "#4F6A8A",
    "hoodie-band": "#46607E",
    "drawstrings": "#CFC9BE",
    "strap": "#18181C",
    "jeans": "#26262C",
    "high-tops": "#E2DDD2",
    "soles": "#2A2A30",
    "guitar": "#8A5A34",
    "guitar-neck": "#4A3A30",
    "headstock": "#3A2E26",
    "tape": "#9A968C",
    "patch": "#5FA39A",
}

#: Metres, with the ears; the registry's `height` for character/protagonist.
HEIGHT = 1.5

#: The tail's joints, from under the hem down his left side, hooking up at the tip.
TAIL = [
    (0.02, 0.64, -0.09),
    (0.07, 0.5, -0.17),
    (0.11, 0.37, -0.18),
    (0.13, 0.27, -0.12),
    (0.12, 0.31, -0.04),
]

# Legs and arms hang straight down, the spine and neck lean forward a little (the slouch).
BIPED = Biped(
    spine=(
        (0, 0.6, 0),
        (0, 0.74, 0),
        (0, 0.92, 0.01),
        (0, 1.08, 0.03),
        (0, 1.13, 0.04),
        (0, 1.38, 0.04),
    ),
    arm=((0.15, 1.06, 0.03), (0.18, 0.83, 0.02), (0.19, 0.61, 0.04), (0.19, 0.51, 0.05)),
    leg=((0.075, 0.62, 0), (0.075, 0.36, 0), (0.075, 0.09, 0), (0.075, 0.03, 0.13)),
    back=(0.02, 0.85, -0.17),
    ears=((0.075, 1.33, 0.03), (0.1, 1.5, 0.02)),
    tail=tuple(TAIL),
    hand=(0.19, 0.54, 0.06),
)

#: The torso's rings, bottom to top: (height, half width, half depth, how far forward).
TORSO = [
    (0.6, 0.155, 0.092, 0),
    (0.86, 0.145, 0.09, 0.005),
    (1.0, 0.15, 0.1, 0.02),
    (1.1, 0.11, 0.08, 0.035),
]
TORSO_SKIN = torso_skin(BIPED)


def build_body(body: Body) -> None:
    head(body)
    torso(body)
    for side, x in SIDES.items():
        arm(body, side, x)
        leg(body, side, x)
    tail(body)
    guitar(body)


def head(body: Body) -> None:
    def at(points):
        return [(px, 1.12 + py, 0.04 + pz) for px, py, pz in points]

    def mirror(points):
        return [(sx * px, py, pz) for px, py, pz in points for sx in ((1, -1) if px else (1,))]

    skull = body.hull(
        at(
            mirror(
                [
                    (0, 0.0, 0.07),
                    (0.06, 0.01, 0.05),
                    (0.14, 0.07, 0.0),
                    (0.125, 0.035, -0.02),
                    (0.08, 0.03, -0.07),
                    (0.095, 0.1, 0.075),
                    (0.075, 0.17, 0.08),
                    (0, 0.165, 0.095),
                    (0.115, 0.17, 0.02),
                    (0.08, 0.245, 0.02),
                    (0.07, 0.24, -0.06),
                    (0, 0.25, 0.0),
                    (0.1, 0.13, -0.1),
                    (0, 0.15, -0.115),
                    (0, 0.05, -0.09),
                ]
            )
        ),
        "fur",
        "head",
    )
    body.hull(
        at(
            mirror(
                [
                    (0.065, 0.075, 0.07),
                    (0.05, 0.02, 0.055),
                    (0, 0.005, 0.08),
                    (0.035, 0.105, 0.1),
                    (0.03, 0.05, 0.13),
                    (0, 0.075, 0.165),
                    (0, 0.035, 0.12),
                ]
            )
        ),
        "muzzle",
        "head",
    )
    body.hull(
        at(mirror([(0.018, 0.092, 0.152), (0, 0.068, 0.166), (0, 0.094, 0.17)]))
        + at([(0, 0.08, 0.145)]),
        "nose",
        "head",
    )
    for side, x in SIDES.items():
        eye = [
            (x * (0.048 + dx), 1.12 + 0.135 + dy)
            for dx, dy in (
                (-0.024, -0.002),
                (-0.008, 0.018),
                (0.016, 0.014),
                (0.024, -0.004),
                (0.005, -0.016),
                (-0.014, -0.014),
            )
        ]
        body.decal(skull, eye, 0.004, "eyes", "head")
        pupil = [
            (x * (0.052 + dx), 1.12 + 0.133 + dy)
            for dx, dy in ((-0.009, 0), (0, 0.013), (0.009, 0), (0, -0.013))
        ]
        body.decal(skull, pupil, 0.008, "pupils", "head")
        brow = [
            (x * (0.028 + dx), 1.12 + 0.162 + dy)
            for dx, dy in ((0, 0), (0.05, 0.008), (0.05, 0.016), (0, 0.009))
        ]
        body.decal(skull, brow, 0.004, "brows", "head")
        ear(body, side, x)


def ear(body: Body, side: str, x: int) -> None:
    front = [(0.03, 1.345, 0.065), (0.13, 1.3, 0.055), (0.105, 1.505, 0.025)]
    back = [(0.06, 1.335, -0.0), (0.12, 1.29, 0.0)]
    body.hull([(x * px, py, pz) for px, py, pz in front + back], "fur", f"ear_{side}")
    centre = [sum(p[i] for p in front) / 3 for i in range(3)]
    inner = [tuple(c + 0.62 * (p[i] - c) for i, c in enumerate(centre)) for p in front]
    # The front face leans back towards the tip; lift the inner ear off it along its normal.
    body.hull(
        [
            (x * px, py + dy, pz + dz)
            for px, py, pz in inner
            for dy, dz in ((0.0015, 0.004), (-0.0015, -0.004))
        ],
        "inner-ear",
        f"ear_{side}",
    )


def torso(body: Body) -> None:
    hoodie = body.hull(
        [p for y, w, d, f in TORSO for p in ring((0, y, f), w, d)], "hoodie", TORSO_SKIN
    )
    body.hull(
        ring((0, 0.6, 0), 0.162, 0.099) + ring((0, 0.64, 0.001), 0.16, 0.097), "hoodie-band", "hips"
    )
    body.decal(
        hoodie,
        [(-0.1, 0.665), (0.1, 0.665), (0.075, 0.8), (-0.075, 0.8)],
        0.006,
        "hoodie-band",
        TORSO_SKIN,
    )
    hood(body)
    for x in (1, -1):
        string = [(x * 0.035 + dx, y) for y in (1.07, 0.95) for dx in (-0.004, 0.004)]
        body.decal(hoodie, string, 0.005, "drawstrings", "chest")
    # The guitar's strap, from his left shoulder across the chest to his right hip, in short
    # pieces so it follows the hoodie.
    steps = 6
    for i in range(steps):
        a, b = i / steps, (i + 1) / steps
        start = (0.09 - 0.23 * a, 1.06 - 0.4 * a)
        end = (0.09 - 0.23 * b, 1.06 - 0.4 * b)
        outline = [
            (px + dx, py + dy)
            for px, py in (start, end)
            for dx, dy in ((-0.014, -0.012), (0.014, 0.012))
        ]
        body.decal(hoodie, outline, 0.005, "strap", TORSO_SKIN)


def hood(body: Body) -> None:
    """The hood, up as #69 asks (board 2 draws it down): over the back and top of the head,
    framing the face, the ears through it."""
    face = [(0, 1.39, 0.08), (0.1, 1.365, 0.085), (0.155, 1.25, 0.085), (0.13, 1.12, 0.075)]
    crown = [(0, 1.395, -0.04), (0.11, 1.37, -0.03), (0.165, 1.24, -0.02)]
    back = [(0, 1.32, -0.11), (0.12, 1.28, -0.095), (0, 1.17, -0.13), (0.13, 1.12, -0.08)]
    neck = [(0.11, 1.06, 0.05), (0.1, 1.05, -0.06), (0, 1.05, -0.09)]
    body.hull(
        [(sx * px, py, pz) for px, py, pz in face + crown + back + neck for sx in (1, -1)],
        "hoodie",
        blend((0, "chest"), (1.13, "head"), soft=0.03),
    )


def arm(body: Body, side: str, x: int) -> None:
    shoulder, elbow, wrist, tip = (
        (0.15 * x, 1.06, 0.03),
        (0.18 * x, 0.83, 0.02),
        (0.19 * x, 0.61, 0.04),
        (0.19 * x, 0.51, 0.05),
    )
    body.hull(
        disc((0.13 * x, 1.06, 0.03), (0.2 * x, 1.06, 0.03), 0.055, 6), "hoodie", f"upper_arm_{side}"
    )
    body.hull(limb(shoulder, elbow, 0.048, 0.04), "hoodie", f"upper_arm_{side}")
    body.hull(limb((0.179 * x, 0.85, 0.02), wrist, 0.04, 0.045), "hoodie", f"forearm_{side}")
    body.hull(
        ring((0.19 * x, 0.6, 0.04), 0.044, 0.044) + ring((0.19 * x, 0.635, 0.04), 0.046, 0.046),
        "hoodie-band",
        f"forearm_{side}",
    )
    px, py, pz = tip
    body.hull(
        [
            (px - 0.028, 0.6, pz - 0.022),
            (px + 0.028, 0.6, pz - 0.022),
            (px - 0.028, 0.6, pz + 0.022),
            (px + 0.028, 0.6, pz + 0.022),
            (px - 0.032, 0.55, pz - 0.018),
            (px + 0.032, 0.55, pz - 0.018),
            (px - 0.03, 0.55, pz + 0.024),
            (px + 0.03, 0.55, pz + 0.024),
            (px, py, pz + 0.005),
            (px - 0.02 * x, py + 0.01, pz - 0.01),
        ],
        "fur",
        f"hand_{side}",
    )


def leg(body: Body, side: str, x: int) -> None:
    lx = 0.075 * x
    body.hull(
        limb((lx, 0.68, 0), (lx, 0.36, 0.005), 0.058, 0.048, 6, 0.5), "jeans", f"thigh_{side}"
    )
    body.hull(limb((lx, 0.38, 0.005), (lx, 0.1, 0), 0.047, 0.043, 6, 0.5), "jeans", f"shin_{side}")
    body.hull(
        ring((lx, 0.1, 0.0), 0.046, 0.05) + ring((lx, 0.145, -0.005), 0.044, 0.046),
        "high-tops",
        f"shin_{side}",
    )
    body.hull(
        ring((lx, 0.025, 0.035), 0.048, 0.095)
        + [
            (lx + 0.03, 0.08, 0.1),
            (lx - 0.03, 0.08, 0.1),
            (lx + 0.04, 0.1, 0.0),
            (lx - 0.04, 0.1, 0.0),
        ],
        "high-tops",
        f"foot_{side}",
    )
    body.hull(
        ring((lx, 0.0, 0.035), 0.05, 0.1) + ring((lx, 0.026, 0.035), 0.05, 0.1),
        "soles",
        f"foot_{side}",
    )


def tail(body: Body) -> None:
    radii = [0.028, 0.025, 0.022, 0.019, 0.014]
    for i in range(len(TAIL) - 1):
        body.hull(limb(TAIL[i], TAIL[i + 1], radii[i], radii[i + 1], 5), "fur", f"tail_{i + 1}")


def guitar(body: Body) -> None:
    back = -0.115
    lower = [
        p for z in (back, back - 0.075) for p in disc((0.0, 0.76, z), (0.0, 0.76, z - 1), 0.125, 8)
    ]
    upper = [
        p
        for z in (back, back - 0.07)
        for p in disc((0.035, 0.93, z), (0.035, 0.93, z - 1), 0.095, 8)
    ]
    lobe = body.hull(lower, "guitar", "chest")
    body.hull(upper, "guitar", "chest")
    body.decal(
        lobe,
        [(-0.07, 0.73), (-0.02, 0.73), (-0.02, 0.78), (-0.07, 0.78)],
        0.004,
        "patch",
        "chest",
        back=True,
    )
    body.hull(
        limb((0.04, 0.98, back - 0.035), (0.13, 1.24, back - 0.035), 0.022, 0.02, 4, 0.785),
        "guitar-neck",
        "chest",
    )
    body.hull(
        limb((0.112, 1.18, back - 0.035), (0.122, 1.21, back - 0.035), 0.03, 0.03, 4, 0.785),
        "tape",
        "chest",
    )
    body.hull(
        limb((0.14, 1.25, back - 0.03), (0.2, 1.18, back - 0.03), 0.028, 0.022, 4, 0.785),
        "headstock",
        "chest",
    )


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    materials = {part: material(part, hex_colour) for part, hex_colour in COLOURS.items()}
    rig = armature("protagonist", BIPED)
    body = Body(materials)
    build_body(body)
    body.finish("protagonist-body", rig.object)
    anchors(rig, BIPED)
    clips(rig, BIPED)
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import previews

        previews(rig, os.path.abspath(args.previews), HEIGHT)


main()
