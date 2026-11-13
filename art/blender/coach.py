"""The coach, object/coach: the coach of the Arrival, that pulls in at the coach station's bay,
drops the cat off and drives on. docs/design/rooms/coach-station.svg (`coach`) is the reference: a
blue coach seen side-on, a band of lit windows, the door at the front, its wheels.

    blender -b --factory-startup --python art/blender/coach.py -- \\
        --out frontend/public/models/objects/coach.glb \\
        [--previews docs/screenshots/blender/objects/coach]

Built from scratch every run. Points are in glTF axes, metres: +Y up, the front of the coach
towards +X (it drives in from the left), the door's side facing +Z, towards the camera.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, limb
from lib.export import arguments, empty_scene, export_glb
from lib.palette import material
from lib.scene import box

# The reference art's coach blue and STYLE.md's palette.
COLOURS = {
    "body": "#46607E",
    "skirt": "#3E5572",
    "stripe": "#E3C58A",
    "window-glow": "#E8B566",
    "pillar": "#2F2D35",
    "windscreen": "#2E3A52",
    "door": "#1A2822",
    "tyre": "#1E1E24",
    "hub": "#A89F8E",
    "arch": "#26272E",
    "headlight": "#FFE3A0",
    "tail-light": "#C8483B",
    "passenger": "#8A5A34",
}

#: Half the coach's length and width, how high its body sits off the road, and how tall it is.
HALF_LENGTH, HALF_WIDTH, CLEARANCE, HEIGHT = 2.5, 0.8, 0.35, 3.0
#: The band of windows, from its back to the door, and from its sill to its top.
WINDOWS = (-2.25, 1.65, 1.7, 2.6)
#: The door, behind the front: from and to, and its top.
DOOR = (1.75, 2.3, 2.6)
#: The wheels: where their axles are along it, and how big they are.
AXLES, WHEEL = (-1.6, 1.4), 0.45
#: How far a part laid on the coach's sides stands proud of them.
PROUD = 0.01
#: The passengers' heads in the windows: where along, how big, and whether they have ears up.
PASSENGERS = ((-1.55, 0.15, True), (-0.45, 0.13, False), (0.6, 0.16, True))


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    body = Body({part: material(part, hex_colour) for part, hex_colour in COLOURS.items()})
    shell(body)
    windows(body)
    front(body)
    wheels(body)
    coach = body.finish("coach")
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import object_previews

        object_previews(coach, os.path.abspath(args.previews), 5.5, "coach-station", "coach")


def side(x0: float, x1: float, y0: float, y1: float, out: float, part: str, body: Body) -> None:
    """A strip laid along both of the coach's sides from x0 to x1 and y0 to y1, `out` proud."""
    width = HALF_WIDTH + out
    body.hull(box((x0, y0, -width), (x1, y1, width)), part)


def shell(body: Body) -> None:
    """The body: its sides, the roof falling to the windscreen at the front and rounding over at
    the back, the darker skirt along its foot, and the gold stripe along it."""
    profile = [
        (-HALF_LENGTH, CLEARANCE),
        (HALF_LENGTH, CLEARANCE),
        (HALF_LENGTH, 2.45),
        (HALF_LENGTH - 0.2, HEIGHT - 0.05),
        (HALF_LENGTH - 0.45, HEIGHT),
        (-HALF_LENGTH + 0.25, HEIGHT),
        (-HALF_LENGTH, HEIGHT - 0.2),
    ]
    body.hull([(x, y, z) for x, y in profile for z in (-HALF_WIDTH, HALF_WIDTH)], "body")
    side(-HALF_LENGTH, HALF_LENGTH, CLEARANCE, 0.75, PROUD / 2, "skirt", body)
    side(-HALF_LENGTH, DOOR[0] - 0.05, 1.22, 1.34, PROUD, "stripe", body)


def windows(body: Body) -> None:
    """The lit band of windows, its pillars, and the passengers' heads seen through it."""
    x0, x1, y0, y1 = WINDOWS
    side(x0, x1, y0, y1, PROUD, "window-glow", body)
    panes = 5
    for i in range(panes + 1):
        x = x0 + (x1 - x0) * i / panes
        side(x - 0.04, x + 0.04, y0 - 0.02, y1 + 0.02, 2 * PROUD, "pillar", body)
    for x, r, ears in PASSENGERS:
        y = y0 + 0.28
        z = HALF_WIDTH + 1.5 * PROUD
        body.hull(limb((x, y, z - 0.004), (x, y, z), r, r, 8), "passenger")
        shoulders = [(-1.7 * r, y0), (1.7 * r, y0), (-r, y0 + 0.14), (r, y0 + 0.14)]
        body.hull([(x + dx, sy, dz) for dx, sy in shoulders for dz in (z - 0.004, z)], "passenger")
        if ears:
            for dx in (-0.6 * r, 0.6 * r):
                body.hull(
                    [(x + dx - 0.05, y + 0.6 * r, z), (x + dx + 0.05, y + 0.6 * r, z)]
                    + [(x + dx, y + r + 0.1, z), (x + dx, y + 0.7 * r, z - 0.004)],
                    "passenger",
                )


def front(body: Body) -> None:
    """The door and its glass, the windscreen and the destination blind over it, and the lights
    front and back."""
    x0, x1, top = DOOR
    side(x0, x1, CLEARANCE + 0.1, top, PROUD, "door", body)
    side(x0 + 0.06, x1 - 0.06, 1.0, top - 0.08, 2 * PROUD, "windscreen", body)
    side((x0 + x1) / 2 - 0.012, (x0 + x1) / 2 + 0.012, 1.0, top - 0.08, 3 * PROUD, "door", body)
    nose = HALF_LENGTH + PROUD
    inner = HALF_WIDTH - 0.08
    body.hull(box((HALF_LENGTH - 0.01, 1.35, -inner), (nose, 2.12, inner)), "windscreen")
    body.hull(box((HALF_LENGTH - 0.01, 2.18, -inner), (nose, 2.38, inner)), "stripe")
    for z in (-inner + 0.1, inner - 0.1):
        body.hull(box((HALF_LENGTH - 0.01, 0.6, z - 0.12), (nose, 0.78, z + 0.12)), "headlight")
        body.hull(
            box((-HALF_LENGTH - PROUD, 0.6, z - 0.1), (-HALF_LENGTH + 0.01, 0.9, z + 0.1)),
            "tail-light",
        )


def wheels(body: Body) -> None:
    """Each axle's wheels, a tyre and its hub either side, under a dark arch."""
    for x in AXLES:
        side(x - WHEEL - 0.08, x + WHEEL + 0.08, CLEARANCE, WHEEL + 0.32, PROUD / 2, "arch", body)
        tyre = HALF_WIDTH + 0.02
        body.hull(limb((x, WHEEL, -tyre), (x, WHEEL, tyre), WHEEL, WHEEL, 12), "tyre")
        hub = tyre + 0.01
        body.hull(limb((x, WHEEL, -hub), (x, WHEEL, hub), 0.2, 0.2, 8), "hub")


main()
