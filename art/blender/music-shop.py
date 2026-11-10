"""Inside the music shop on the High Street. docs/design/rooms/music-shop.svg is the layout: the
green door back out to the street on the left, guitars hanging on the dark blue walls, the
counter, and the rack of strings on the wall behind it, its last string gone. story/CANON.md
(Places) describes it.

    blender -b --factory-startup --python art/blender/music-shop.py -- \\
        --out frontend/public/models/scenes/music-shop.glb \\
        [--previews docs/screenshots/blender/music-shop]

Built from scratch every run, in glTF axes, metres, placed in the reference art's scene pixels
through `cam_main` (lib/scene.py).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, dome, limb
from lib.export import arguments, empty_scene, export_glb
from lib.scene import FRONT, UP, Room, border, box, rect

# STYLE.md's palette, and the reference art's own tones for the shop's walls, wood and door.
COLOURS = {
    "boards": "#4A3A30",
    "board-seams": "#3A2E26",
    "wall": "#2E3A52",
    "wainscot": "#4A3A30",
    "rail": "#6E4628",
    "skirting": "#3A2E26",
    "cornice": "#2A1C1A",
    "door-frame": "#2A1C1A",
    "green-door": "#2F4A36",
    "door-panel": "#23382F",
    "dusk": "#2E3A52",
    "glazing": "#2A1C1A",
    "brass": "#C9A86A",
    "guitar": "#8A5A34",
    "spruce": "#C99A54",
    "red-guitar": "#C8483B",
    "teal-guitar": "#5FA39A",
    "fretboard": "#4A3A30",
    "headstock": "#2A1C1A",
    "sound-hole": "#16161A",
    "pickup": "#16161A",
    "hook": "#16161A",
    "batten": "#6E4628",
    "counter": "#8A5A34",
    "counter-top": "#6E4628",
    "counter-panel": "#6E4628",
    "plinth": "#2A1C1A",
    "till": "#5E5A62",
    "till-keys": "#E8E4DC",
    "till-display": "#5FA39A",
    "rack": "#D9CDB4",
    "rack-frame": "#2A1C1A",
    "ink": "#2A1C1A",
    "peg": "#4A464E",
    "price-tag": "#C8483B",
    "amp": "#1E1E24",
    "amp-grille": "#4A464E",
    "amp-trim": "#C9C0AE",
    "knob": "#E3C58A",
    "poster": "#8A7FA8",
    "sign-gold": "#E3C58A",
    "lamp-shade": "#C99A54",
    "bulb": "#FFE3A0",
    "cord": "#16161A",
}

#: The room's sides, in pixels at the back wall: well past the edges of the view.
LEFT, RIGHT = -300, 1580
#: The top of the back wall, above the view. There is no ceiling: the renderer's key light
#: shines down from above it, and a ceiling would throw the whole room into its shadow.
TOP = -120
#: The row of the cornice along the back wall, at the top of the view.
CORNICE = 14
#: The row the guitars hang from, on hooks in the batten along the wall.
HOOKS = 140
#: The guitars on the walls, after the art's five: (the pixel column they hang at, their shape,
#: their body's part).
GUITARS = (
    (335, "acoustic", "guitar"),
    (455, "flying-v", "red-guitar"),
    (575, "acoustic", "spruce"),
    (1055, "single-cut", "teal-guitar"),
    (1175, "acoustic", "guitar"),
)
#: How much larger than life the guitars hang, as the art draws them, so they read from the door.
GUITAR_SCALE = 1.35
#: The counter's front on the boards (the art's row 520), how deep it is, and its top's row.
COUNTER_ROW, COUNTER_DEPTH, COUNTER_TOP = 520, 0.6, 370
#: Where the two lamps hang: their depth, between the counter and the walk line.
LAMP_DEPTH = -1.6


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    room = Room("music-shop", COLOURS)
    shop = MusicShop(room)
    shop.ground()
    shop.walls()
    shop.door()
    shop.guitars()
    shop.poster()
    shop.strings()
    shop.counter()
    shop.amps()
    shop.lamps()
    shop.body.finish("music-shop")
    room.camera()
    export_glb(os.path.abspath(args.out), cameras=True)
    if args.previews:
        room.previews(os.path.abspath(args.previews))


class MusicShop:
    """The room's set pieces: the shell, the counter and what hangs on the walls in one mesh, and
    the hotspots each on their own."""

    def __init__(self, room: Room):
        self.room = room
        self.lens = room.lens
        #: The back wall's face, where the floor meets it in the art.
        self.wall = self.lens.depth_at(480)
        self.body = room.body()

    def panel(self, body: Body, points, out: float, depth: float, part: str) -> None:
        """The pixel outline `points`, standing `out` off the back wall and `depth` deep."""
        body.hull(self.lens.outline(points, self.wall + out, depth), part)

    # --- The shell. ------------------------------------------------------------------------------

    def ground(self) -> None:
        """`floor`, the boards from the back wall to the front of the walk line, and the boards
        on in front of it, with their seams."""
        room, wall, body = self.room, self.wall, self.body
        room.floor([(-14, wall), (14, wall), (14, FRONT), (-14, FRONT)], "boards")
        body.plate([(-14, 0, FRONT), (14, 0, FRONT), (14, 0, 4), (-14, 0, 4)], "boards", UP)
        room.seams(body, wall, "board-seams")

    def walls(self) -> None:
        """The dark blue back wall and its cornice, the wainscot under its rail, broken by the
        door, the skirting at its foot, and the battens the guitars hang from."""
        body = self.body
        self.panel(body, rect(LEFT, TOP, RIGHT - LEFT, 480 - TOP), 0, 0.25, "wall")
        self.panel(body, rect(LEFT, CORNICE, RIGHT - LEFT, 10), 0.08, 0.08, "cornice")
        for x0, x1 in ((LEFT, 60), (220, RIGHT)):
            self.panel(body, rect(x0, 400, x1 - x0, 80), 0.03, 0.03, "wainscot")
            self.panel(body, rect(x0 - 4, 394, x1 - x0 + 8, 8), 0.05, 0.05, "rail")
        self.panel(body, rect(LEFT, 472, RIGHT - LEFT, 8), 0.05, 0.05, "skirting")
        for x0, x1 in ((280, 630), (1000, 1240)):
            self.panel(body, rect(x0, HOOKS - 6, x1 - x0, 14), 0.03, 0.03, "batten")

    # --- `hit_door`. -----------------------------------------------------------------------------

    def door(self) -> None:
        """The green door back out to the High Street, in its frame: the street at dusk in its
        glass, the buildings across it in the depth ramp, its panel, its brass handle, and the
        shop bell over it."""
        lens, wall = self.lens, self.wall
        door = self.room.body()
        for points in (rect(60, 150, 12, 330), rect(208, 150, 12, 330), rect(60, 150, 160, 12)):
            door.hull(lens.outline(points, wall + 0.06, 0.06), "door-frame")
        door.hull(lens.box(72, 162, 136, 318, wall + 0.03, 0.03), "green-door")
        door.hull(lens.box(88, 178, 104, 120, wall + 0.034, 0.004), "dusk")
        for x, y, w, h, step in (
            (88, 230, 22, 68, 1),
            (112, 210, 30, 88, 1),
            (146, 244, 20, 54, 2),
            (168, 222, 24, 76, 1),
        ):
            door.hull(lens.box(x, y, w, h, wall + 0.035, 0.001), f"depth-{step}")
        for x, y, w, h in (
            (88, 178, 104, 5),
            (88, 293, 104, 5),
            (88, 178, 5, 120),
            (187, 178, 5, 120),
            (137.5, 178, 5, 120),
        ):
            door.hull(lens.box(x, y, w, h, wall + 0.04, 0.006), "glazing")
        for points in border(92, 324, 96, 136, 4):
            door.hull(lens.outline(points, wall + 0.036, 0.006), "door-panel")
        door.hull(lens.box(184, 318, 6, 32, wall + 0.06, 0.03), "brass")
        # The bell on its bracket over the door, to ring when it opens.
        bracket = lens.at(140, 142, wall + 0.06)
        bell = (bracket.x, bracket.y - 0.08, bracket.z + 0.08)
        door.hull(limb(tuple(bracket), (bracket.x, bracket.y, bell[2]), 0.006, 0.006, 4), "hook")
        door.hull(limb((bracket.x, bracket.y, bell[2]), bell, 0.006, 0.006, 4), "hook")
        door.hull(limb(bell, (bell[0], bell[1] - 0.06, bell[2]), 0.015, 0.04, 8), "brass")
        self.room.hotspot("door", door.finish("door"))

    # --- The guitars on the walls. ---------------------------------------------------------------

    def guitars(self) -> None:
        for column, shape, part in GUITARS:
            hook = self.lens.at(column, HOOKS, self.wall + 0.03)
            Guitar(self.body, hook, part).build(shape)

    def poster(self) -> None:
        """A gig poster on the wall between the guitars and the rack: LIVE over a guitar."""
        room, lens, wall, body = self.room, self.lens, self.wall, self.body
        self.panel(body, rect(648, 150, 76, 112), 0.004, 0.004, "poster")
        room.sign(
            "poster-live",
            "LIVE",
            "sign-gold",
            24 * lens.metres(wall),
            tuple(lens.at(686, 172, wall + 0.006)),
            spacing=1.3,
        )
        self.panel(body, rect(660, 236, 52, 6), 0.006, 0.002, "sign-gold")
        z = wall + 0.006
        neck, foot = lens.at(686, 192, z), lens.at(686, 232, z)
        body.hull(limb(tuple(neck), tuple(foot), 0.012, 0.012, 4), "ink")
        body.hull(dome((foot.x, foot.y + 0.06, z), 0.08, 0.09, 0.002, 8), "ink")

    # --- `hit_strings`. --------------------------------------------------------------------------

    def strings(self) -> None:
        """The rack of guitar strings on the wall behind the counter: its board under STRINGS,
        three rows of pegs, every one of them empty, and the price tag left on the last."""
        room, lens, wall = self.room, self.lens, self.wall
        rack = room.body()
        rack.hull(lens.box(760, 170, 160, 100, wall + 0.03, 0.03), "rack")
        for points in border(756, 166, 168, 108, 4):
            rack.hull(lens.outline(points, wall + 0.04, 0.04), "rack-frame")
        name = room.sign(
            "strings-name",
            "STRINGS",
            "ink",
            16 * lens.metres(wall),
            tuple(lens.at(840, 194, wall + 0.032)),
            spacing=1.5,
        )
        for row in (218, 236, 254):
            for column in range(784, 900, 22):
                peg = lens.at(column, row, wall + 0.03)
                rack.hull(
                    limb(tuple(peg), (peg.x, peg.y + 0.008, peg.z + 0.05), 0.011, 0.009, 4), "peg"
                )
        tag = lens.at(784, 254, wall + 0.032)
        rack.hull(
            box((tag.x - 0.035, tag.y - 0.09, tag.z), (tag.x + 0.035, tag.y - 0.01, tag.z + 0.004)),
            "price-tag",
        )
        room.hotspot("strings", rack.finish("strings"), name)

    # --- The counter. ----------------------------------------------------------------------------

    def counter(self) -> None:
        """The counter, on the boards at the art's row 520: its front with three panels, its
        plinth and its overhanging top, the till at its right end and a bell for service."""
        lens, body = self.lens, self.body
        front = lens.depth_at(COUNTER_ROW)
        body.hull(lens.standing(680, 382, 320, COUNTER_ROW - 382, COUNTER_DEPTH), "counter")
        left, top = lens.at(672, COUNTER_TOP, front + 0.05)[:2]
        right = lens.at(1008, COUNTER_TOP, front + 0.05).x
        under = lens.at(680, 382, front).y
        body.hull(
            box((left, under, front - COUNTER_DEPTH - 0.04), (right, top, front + 0.05)),
            "counter-top",
        )
        foot = lens.at(686, COUNTER_ROW, front).x, lens.at(994, COUNTER_ROW, front).x
        body.hull(box((foot[0], 0, front - 0.1), (foot[1], 0.08, front + 0.012)), "plinth")
        for x in (694, 798, 902):
            for points in border(x, 396, 92, 104, 3):
                body.hull(lens.outline(points, front + 0.012, 0.012), "counter-panel")
        # The till, at the counter's right end.
        x, z = lens.at(950, COUNTER_TOP, front).x, front - 0.28
        body.hull(box((x - 0.17, top, z - 0.17), (x + 0.17, top + 0.12, z + 0.17)), "till")
        body.hull(
            [
                (x - 0.15, top + 0.12, z + 0.15),
                (x + 0.15, top + 0.12, z + 0.15),
                (x - 0.15, top + 0.12, z - 0.12),
                (x + 0.15, top + 0.12, z - 0.12),
                (x - 0.15, top + 0.24, z - 0.12),
                (x + 0.15, top + 0.24, z - 0.12),
                (x - 0.15, top + 0.24, z - 0.16),
                (x + 0.15, top + 0.24, z - 0.16),
            ],
            "till",
        )
        for row in range(3):
            for col in range(4):
                kx, kz = x - 0.09 + 0.06 * col, z + 0.11 - 0.07 * row
                ky = top + 0.12 + 0.43 * (z + 0.15 - kz)
                body.hull(
                    box((kx - 0.02, ky, kz - 0.02), (kx + 0.02, ky + 0.02, kz + 0.02)), "till-keys"
                )
        body.hull(
            box((x - 0.1, top + 0.24, z - 0.15), (x + 0.1, top + 0.33, z - 0.13)), "till-display"
        )
        # A bell for service, at the counter's left end.
        x = lens.at(724, COUNTER_TOP, front).x
        body.hull(dome((x, top, front - 0.2), 0.05, 0.05, 0.0, 8), "counter-top")
        body.hull(
            limb((x, top, front - 0.2), (x, top + 0.05, front - 0.2), 0.045, 0.01, 8), "brass"
        )

    # --- The amps. -------------------------------------------------------------------------------

    def amps(self) -> None:
        """A stack against the wall on the right, a head on its cabinet, and a combo on the left,
        by the guitars."""
        stack = self.lens.at(1130, 480, self.wall).x
        self.amp(stack, 0.78, 0.0, 0.74, 0.38, speakers=4)
        self.amp(stack, 0.74, 0.74, 0.24, 0.32, speakers=0)
        combo = self.lens.at(400, 480, self.wall).x
        self.amp(combo, 0.56, 0.0, 0.48, 0.3, speakers=1)

    def amp(self, x: float, width: float, y: float, height: float, deep: float, speakers: int):
        """An amp `width` across centred on `x` against the wall, standing at `y`, `height` tall
        and `deep` deep: a cabinet's grille with its `speakers` showing through it, or with none
        a head's control panel, its knobs, and the handle on top."""
        body, z = self.body, self.wall
        left, right, front = x - width / 2, x + width / 2, z + deep
        body.hull(box((left, y, z), (right, y + height, front)), "amp")
        rim = 0.035
        if speakers:
            body.hull(
                box((left + rim, y + rim, front), (right - rim, y + height - rim, front + 0.006)),
                "amp-grille",
            )
            across = 2 if speakers == 4 else 1
            for i in range(speakers):
                cx = left + width * (i % across + 0.5) / across
                cy = y + height * (i // across + 0.5) / (speakers // across)
                radius = 0.4 * min(width / across, height / (speakers // across))
                body.hull(dome((cx, cy, front + 0.006), radius, radius, 0.004, 10), "amp")
        else:
            panel = y + 0.4 * height
            body.hull(
                box((left + rim, panel, front), (right - rim, y + height - rim, front + 0.006)),
                "amp-trim",
            )
            for i in range(6):
                kx = left + width * (i + 1) / 7
                knob = (kx, (panel + y + height - rim) / 2, front + 0.006)
                body.hull(limb(knob, (kx, knob[1], front + 0.03), 0.014, 0.012, 6), "knob")
        body.hull(box((left + rim, y, front), (right - rim, y + 0.015, front + 0.008)), "amp-trim")
        handle = y + height
        for side in (-1, 1):
            foot = x + side * 0.1
            body.hull(
                box(
                    (foot - 0.012, handle, z + deep / 2 - 0.012),
                    (foot + 0.012, handle + 0.04, z + deep / 2 + 0.012),
                ),
                "amp-trim",
            )
        body.hull(
            box(
                (x - 0.11, handle + 0.035, z + deep / 2 - 0.015),
                (x + 0.11, handle + 0.05, z + deep / 2 + 0.015),
            ),
            "amp-trim",
        )

    # --- The lamps. ------------------------------------------------------------------------------

    def lamps(self) -> None:
        """Two enamel shades hanging on their cords from above the view over the shop floor."""
        lens, body, z = self.lens, self.body, LAMP_DEPTH
        metres = lens.metres(z)
        for x in (420, 860):
            top, bottom = lens.at(x, 60, z), lens.at(x, 82, z)
            ceiling = lens.at(x, TOP, z)
            body.hull(limb(tuple(ceiling), tuple(top), 0.008, 0.008, 4), "cord")
            body.hull(limb(tuple(top), tuple(bottom), 8 * metres, 36 * metres, 10), "lamp-shade")
            bulb = lens.at(x, 88, z)
            body.hull(limb(tuple(bottom), tuple(bulb), 12 * metres, 6 * metres, 8), "bulb")


class Guitar:
    """A guitar hanging head up from its hook on the wall at `hook`, in metres from it: across,
    down the guitar and out from the wall."""

    def __init__(self, body: Body, hook, part: str):
        self.body, self.part = body, part
        self.x, self.y, self.z = hook

    def at(self, across: float, down: float, out: float = 0.0) -> tuple[float, float, float]:
        k = GUITAR_SCALE
        return (self.x + k * across, self.y - k * down, self.z + k * out)

    def build(self, shape: str) -> None:
        neck = 0.42
        self.head()
        self.neck(neck)
        if shape == "acoustic":
            self.acoustic(neck)
        elif shape == "flying-v":
            self.flying_v(neck)
        else:
            self.single_cut(neck)

    def head(self) -> None:
        """The hook it hangs from, the headstock and its six tuning pegs, three up each side."""
        body = self.body
        body.hull(limb(self.at(0, 0.0, -0.03), self.at(0, 0.0, 0.03), 0.006, 0.006, 4), "hook")
        body.hull(
            [
                self.at(dx, dy, dz)
                for dx, dy in ((-0.045, 0.0), (0.045, 0.0), (-0.03, 0.17), (0.03, 0.17))
                for dz in (0.01, 0.03)
            ],
            "headstock",
        )
        for i in range(3):
            down = 0.04 + 0.055 * i
            for side in (-1, 1):
                inner = 0.045 - 0.015 * down / 0.17
                body.hull(
                    limb(
                        self.at(side * inner, down, 0.02),
                        self.at(side * (inner + 0.03), down, 0.02),
                        0.008,
                        0.008,
                        4,
                    ),
                    "brass",
                )

    def neck(self, length: float) -> None:
        self.body.hull(
            [
                self.at(dx, dy, dz)
                for dx, dy in ((-0.024, 0.17), (0.024, 0.17), (-0.03, length), (0.03, length))
                for dz in (0.015, 0.045)
            ],
            "fretboard",
        )

    def acoustic(self, neck: float) -> None:
        """A flat-top: its two bouts, its sound hole and its bridge."""
        body, part = self.body, self.part
        upper, lower = neck + 0.13, neck + 0.32
        body.hull(dome(self.at(0, upper), 0.15, 0.13, 0.06, 14), part)
        body.hull(dome(self.at(0, lower), 0.21, 0.19, 0.06, 14), part)
        body.hull(dome(self.at(0, lower - 0.07, 0.061), 0.05, 0.05, 0.002, 10), "sound-hole")
        body.hull(
            box(self.at(-0.07, lower + 0.08, 0.06), self.at(0.07, lower + 0.1, 0.07)), "headstock"
        )

    def flying_v(self, neck: float) -> None:
        """Two wings swept down from the neck, its two pickups between them."""
        body, part = self.body, self.part
        for side in (-1, 1):
            body.hull(
                [
                    self.at(side * dx, dy, dz)
                    for dx, dy in (
                        (0.0, neck - 0.04),
                        (0.07, neck - 0.04),
                        (0.26, neck + 0.42),
                        (0.15, neck + 0.45),
                        (0.0, neck + 0.18),
                    )
                    for dz in (0.0, 0.045)
                ],
                part,
            )
        for down in (0.04, 0.12):
            body.hull(
                box(self.at(-0.04, neck + down + 0.03, 0.045), self.at(0.04, neck + down, 0.055)),
                "pickup",
            )

    def single_cut(self, neck: float) -> None:
        """A solid body with one cutaway, its upper bout on the bass side only: its two pickups
        and its knobs."""
        body, part = self.body, self.part
        lower = neck + 0.26
        body.hull(dome(self.at(0, lower), 0.19, 0.17, 0.04, 14), part)
        body.hull(dome(self.at(-0.04, neck + 0.1), 0.14, 0.1, 0.04, 12), part)
        for down in (0.1, 0.24):
            body.hull(
                box(self.at(-0.045, neck + down - 0.02, 0.04), self.at(0.045, neck + down, 0.05)),
                "pickup",
            )
        for across, down in ((0.1, 0.3), (0.06, 0.36), (0.13, 0.36)):
            body.hull(dome(self.at(across, neck + down, 0.035), 0.016, 0.016, 0.02, 6), "knob")


main()
