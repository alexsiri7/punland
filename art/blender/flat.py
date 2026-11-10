"""The Song Master's flat, his room above the High Street where the lesson happens.
docs/design/rooms/flat.svg is the layout: the green door down to the street on the left, violet
walls, the window onto the night street, a wooden chair and an old upright piano. story/CANON.md
(Places) describes it.

    blender -b --factory-startup --python art/blender/flat.py -- \\
        --out frontend/public/models/scenes/flat.glb \\
        [--previews docs/screenshots/blender/flat]

Built from scratch every run, in glTF axes, metres, placed in the reference art's scene pixels
through `cam_main` (lib/scene.py).
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Point, dome, limb
from lib.export import arguments, empty_scene, export_glb
from lib.scene import FRONT, UP, Room, border, box, rect

# STYLE.md's palette, and the reference art's own tones for the flat's walls, wood and door.
COLOURS = {
    "boards": "#4A3A30",
    "board-seams": "#3A2E26",
    "wall": "#6E6478",
    "wainscot": "#4A3A30",
    "rail": "#6E4628",
    "skirting": "#3A2E26",
    "cornice": "#2A1C1A",
    "window-frame": "#2A1C1A",
    "sill": "#6E4628",
    "dusk": "#2E3A52",
    "window-glow": "#E8B566",
    "door-frame": "#2A1C1A",
    "green-door": "#2F4A36",
    "door-panel": "#23382F",
    "brass": "#C9A86A",
    "piano": "#6E4628",
    "piano-trim": "#5A3A22",
    "keys": "#D9CDB4",
    "black-keys": "#2F2D35",
    "paper": "#D9CDB4",
    "ink": "#2A1C1A",
    "chair": "#8A5A34",
    "metronome": "#8A5A34",
    "lamp-shade": "#C99A54",
    "bulb": "#FFE3A0",
    "cord": "#16161A",
}

#: The room's sides, in pixels at the back wall: well past the edges of the view.
LEFT, RIGHT = -300, 1580
#: The top of the back wall, above the view. There is no ceiling: the renderer's key light
#: shines down from above it, and a ceiling would throw the whole room into its shadow.
TOP = -120
#: The window onto the street, a pixel rect on the back wall, and its mullion's column.
WINDOW, MULLION = (480, 110, 180, 200), 570
#: The piano's pixel rect in the art, and the row its front stands on the boards at, so it stands
#: off the wall at an upright's depth.
PIANO, PIANO_ROW = (900, 300, 260, 180), 500
#: The height of the piano's keys off the boards.
KEYS = 0.74
#: The chair's pixel rect in the art, its front legs on the boards at its bottom row, and how far
#: it is turned (degrees about the vertical) to face the piano and the Song Master.
CHAIR, CHAIR_TURN = (640, 420, 90, 110), 25
#: Where the lamp hangs: its column, and its depth, over the lesson.
LAMP, LAMP_DEPTH = 760, -1.6


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    room = Room("flat", COLOURS)
    flat = Flat(room)
    flat.ground()
    flat.walls()
    flat.window()
    flat.outside()
    flat.door()
    flat.score()
    flat.piano()
    flat.chair()
    flat.lamp()
    flat.body.finish("flat")
    room.camera()
    export_glb(os.path.abspath(args.out), cameras=True)
    if args.previews:
        room.previews(os.path.abspath(args.previews))


class Flat:
    """The room's set pieces: the shell, the piano and the chair in one mesh, the door, its
    hotspot, on its own, and the night street outside the window."""

    def __init__(self, room: Room):
        self.room = room
        self.lens = room.lens
        #: The back wall's face, where the floor meets it in the art.
        self.wall = self.lens.depth_at(480)
        self.body = room.body()

    # --- The shell. ------------------------------------------------------------------------------

    def ground(self) -> None:
        """`floor`, the boards from the back wall to the front of the walk line, and the boards
        on in front of it, with their seams."""
        room, wall, body = self.room, self.wall, self.body
        room.floor([(-14, wall), (14, wall), (14, FRONT), (-14, FRONT)], "boards")
        body.plate([(-14, 0, FRONT), (14, 0, FRONT), (14, 0, 4), (-14, 0, 4)], "boards", UP)
        room.seams(body, wall, "board-seams")

    def walls(self) -> None:
        """The violet back wall, open for the window, and its cornice; the wainscot under its
        rail, broken by the door; and the skirting at its foot."""
        body = self.body
        x, y, w, h = WINDOW
        for x0, x1, top, bottom in (
            (LEFT, x, TOP, 480),
            (x + w, RIGHT, TOP, 480),
            (x, x + w, TOP, y),
            (x, x + w, y + h, 480),
        ):
            self.room.panel(body, self.wall, rect(x0, top, x1 - x0, bottom - top), 0, 0.25, "wall")
        self.room.panel(body, self.wall, rect(LEFT, -4, RIGHT - LEFT, 12), 0.08, 0.08, "cornice")
        for x0, x1 in ((LEFT, 60), (220, RIGHT)):
            self.room.panel(body, self.wall, rect(x0, 400, x1 - x0, 80), 0.03, 0.03, "wainscot")
            self.room.panel(body, self.wall, rect(x0 - 4, 394, x1 - x0 + 8, 8), 0.05, 0.05, "rail")
        self.room.panel(body, self.wall, rect(LEFT, 472, RIGHT - LEFT, 8), 0.05, 0.05, "skirting")

    def window(self) -> None:
        """The window, set back in the wall: its frame and mullion, and its sill."""
        body, lens, z = self.body, self.lens, self.wall - 0.12
        x, y, w, h = WINDOW
        for points in border(x, y, w, h, 6) + [rect(MULLION - 3, y, 6, h)]:
            body.hull(lens.outline(points, z, 0.05), "window-frame")
        self.room.panel(body, self.wall, rect(x - 12, y + h, w + 24, 10), 0.1, 0.35, "sill")

    def outside(self) -> None:
        """The night street through the window: the houses across it with lights in their
        windows, the roofs behind them, each lighter and bluer with distance, and the sky."""
        room, lens = self.room, self.lens
        city = room.body()
        for x, y, w in ((470, 220, 50), (540, 190, 50), (600, 240, 60)):
            room.far(city, lens.box(x, y, w, 400 - y, -16, 4))
        for x, y in ((500, 240), (556, 210), (616, 260), (640, 260)):
            city.hull(lens.box(x, y, 6, 7, -15.99, 0.01), "window-glow")
        for x, y, w in ((490, 170, 30), (585, 150, 24), (628, 180, 30)):
            room.far(city, lens.box(x, y, w, 400 - y, -42, 6))
        city.finish("city")
        sky = room.body()
        sky.hull(lens.box(400, 40, 340, 360, -150, 1), "dusk")
        sky.finish("sky")

    # --- `hit_door`. -----------------------------------------------------------------------------

    def door(self) -> None:
        """The green door down to the High Street, in its frame: its two panels and its brass
        knob."""
        lens, wall = self.lens, self.wall
        door = self.room.body()
        for points in (rect(60, 150, 12, 330), rect(208, 150, 12, 330), rect(60, 150, 160, 12)):
            door.hull(lens.outline(points, wall + 0.06, 0.06), "door-frame")
        door.hull(lens.box(72, 162, 136, 318, wall + 0.03, 0.03), "green-door")
        for panel in ((88, 182, 82, 130), (88, 340, 82, 120)):
            for points in border(*panel, 5):
                door.hull(lens.outline(points, wall + 0.036, 0.006), "door-panel")
        knob = lens.at(189, 330, wall + 0.03)
        door.hull(limb(tuple(knob), (knob.x, knob.y, knob.z + 0.06), 0.015, 0.03, 8), "brass")
        self.room.hotspot("door", door.finish("door"))

    # --- On the walls. ---------------------------------------------------------------------------

    def score(self) -> None:
        """A framed page of music on the wall between the door and the window: its staves, and
        the notes on them."""
        lens, wall, body = self.lens, self.wall, self.body
        self.room.panel(body, self.wall, rect(300, 180, 120, 92), 0.02, 0.02, "paper")
        for points in border(294, 174, 132, 104, 6):
            self.room.panel(body, self.wall, points, 0.03, 0.03, "window-frame")
        for staff, notes in ((196, (318, 344, 366, 392)), (234, (326, 350, 380, 402))):
            for line in range(5):
                self.room.panel(
                    body, self.wall, rect(310, staff + 4 * line, 100, 1), 0.022, 0.002, "ink"
                )
            for i, column in enumerate(notes):
                head = lens.at(column, staff + 12 - 4 * (i % 3), wall + 0.022)
                body.hull(dome(tuple(head), 0.022, 0.016, 0.004, 6), "ink")
                stem = (head.x + 0.02, head.y, head.z)
                body.hull(limb(stem, (stem[0], stem[1] + 0.1, stem[2]), 0.004, 0.004, 4), "ink")

    # --- The piano. ------------------------------------------------------------------------------

    def piano(self) -> None:
        """The old upright against the back wall, standing off it where its front meets the
        boards: its case and lid, its keyboard on the keybed between its two cheeks, its legs,
        its pedals, an open book of music on its desk and a metronome on its lid."""
        lens, body = self.lens, self.body
        x, y, w, _h = PIANO
        front = lens.depth_at(PIANO_ROW)
        left, right = lens.at(x, y, front).x, lens.at(x + w, y, front).x
        top = lens.at(x, y, front).y
        back, face = self.wall, self.wall + 0.42
        body.hull(box((left, 0, back), (right, top, face)), "piano")
        lid = box((left - 0.03, top, back), (right + 0.03, top + 0.04, face + 0.04))
        body.hull(lid, "piano-trim")
        for low, high in ((0.12, KEYS - 0.16), (KEYS + 0.2, top - 0.08)):
            self.panels(left + 0.14, right - 0.14, low, high, face)
        # The keybed, the keys on it, the fallboard behind them and the cheeks either side.
        inner = left + 0.08, right - 0.08
        body.hull(box((inner[0], KEYS - 0.08, face), (inner[1], KEYS, front)), "piano")
        body.hull(box((inner[0], KEYS, face), (inner[1], KEYS + 0.02, front - 0.01)), "keys")
        body.hull(box((inner[0], KEYS, face), (inner[1], KEYS + 0.1, face + 0.02)), "piano-trim")
        self.black_keys(*inner, face + 0.02, front - 0.01)
        for side in (left, right - 0.08):
            cheek = box((side, KEYS - 0.1, face), (side + 0.08, KEYS + 0.08, front))
            body.hull(cheek, "piano-trim")
            leg = (side + 0.04, KEYS - 0.1, front - 0.05)
            body.hull(limb((leg[0], 0, leg[2]), leg, 0.035, 0.03, 6), "piano-trim")
        middle = (left + right) / 2
        for across in (-0.08, 0.08):
            pedal = (middle + across, 0.06, face)
            body.hull(limb(pedal, (pedal[0], 0.05, face + 0.1), 0.014, 0.012, 6), "brass")
        self.music(lens.at(990, y, front).x, KEYS + 0.12, face)
        self.metronome(lens.at(1110, y, front).x, top + 0.04, (back + face) / 2)

    def panels(self, left: float, right: float, low: float, high: float, face: float) -> None:
        """Two moulded panels side by side on the case's front between `low` and `high`."""
        middle, bar = (left + right) / 2, 0.03
        for x0, x1 in ((left, middle - 0.04), (middle + 0.04, right)):
            for a, b, c, d in (
                (x0, low, x1, low + bar),
                (x0, high - bar, x1, high),
                (x0, low, x0 + bar, high),
                (x1 - bar, low, x1, high),
            ):
                self.body.hull(box((a, b, face), (c, d, face + 0.012)), "piano-trim")

    def black_keys(self, left: float, right: float, back: float, front: float) -> None:
        """The black keys over the white, in their twos and threes, an octave of seven white keys
        each 0.035 across, drawn larger than life as the art draws them."""
        white = 0.035
        count = int((right - left) / white)
        start = left + (right - left - count * white) / 2
        reach = back + 0.6 * (front - back)
        for i in range(count - 1):
            if i % 7 in (2, 6):
                continue
            x = start + (i + 1) * white
            self.body.hull(
                box((x - 0.011, KEYS + 0.02, back), (x + 0.011, KEYS + 0.045, reach)), "black-keys"
            )

    def music(self, x: float, y: float, face: float) -> None:
        """An open book of music on the piano's desk at (`x`, `y`), leaning back on the case: its
        two pages and the staves on them."""
        body = self.body
        low, high = (y, face + 0.1), (y + 0.3, face + 0.02)
        for side in (-1, 1):
            near, far = x + side * 0.01, x + side * 0.24
            corners = [(u, *v) for u in (near, far) for v in (low, high)]
            body.hull(corners + [(u, v, w - 0.01) for u, v, w in corners], "paper")
            across = min(near, far) + 0.03, max(near, far) - 0.03
            for line in range(5):
                t = 0.25 + 0.12 * line
                ly, lz = low[0] + t * (high[0] - low[0]), low[1] + t * (high[1] - low[1]) + 0.004
                staff = box((across[0], ly, lz), (across[1], ly + 0.008, lz + 0.002))
                body.hull(staff, "ink")

    def metronome(self, x: float, y: float, z: float) -> None:
        """A wooden metronome on the piano's lid at (`x`, `z`), its brass pendulum swung over."""
        body = self.body
        base = [(x + dx, y, z + dz) for dx in (-0.07, 0.07) for dz in (-0.06, 0.06)]
        tip = [(x + dx, y + 0.24, z + dz) for dx in (-0.015, 0.015) for dz in (-0.015, 0.015)]
        body.hull(base + tip, "metronome")
        pivot = (x, y + 0.04, z + 0.065)
        bob = (x + 0.06, y + 0.22, z + 0.065)
        body.hull(limb(pivot, bob, 0.005, 0.005, 4), "brass")
        body.hull(dome((x + 0.045, y + 0.17, z + 0.066), 0.016, 0.02, 0.006, 6), "brass")

    # --- The chair. ------------------------------------------------------------------------------

    def chair(self) -> None:
        """The wooden chair the cat sits on for the lesson, turned to face the piano: its seat on
        four legs and its back of two posts, a top rail and a splat."""
        lens = self.lens
        x, y, w, h = CHAIR
        front = lens.depth_at(y + h)
        foot = lens.floor(x + w / 2, y + h)
        turn = math.radians(CHAIR_TURN)
        centre = (foot.x, front - 0.22)

        def block(low: Point, high: Point) -> list[Point]:
            """The box between two corners in the chair's own metres: across it, up, and out of
            its front."""
            return [
                (
                    centre[0] + u * math.cos(turn) + s * math.sin(turn),
                    v,
                    centre[1] - u * math.sin(turn) + s * math.cos(turn),
                )
                for u in (low[0], high[0])
                for v in (low[1], high[1])
                for s in (low[2], high[2])
            ]

        body, seat = self.body, 0.46
        body.hull(block((-0.24, seat - 0.04, -0.22), (0.24, seat, 0.22)), "chair")
        for u in (-0.2, 0.2):
            for s in (-0.18, 0.18):
                body.hull(block((u - 0.02, 0, s - 0.02), (u + 0.02, seat, s + 0.02)), "chair")
            body.hull(block((u - 0.022, seat, -0.2), (u + 0.022, seat + 0.5, -0.16)), "chair")
        body.hull(block((-0.22, seat + 0.38, -0.2), (0.22, seat + 0.48, -0.17)), "chair")
        body.hull(block((-0.06, seat, -0.195), (0.06, seat + 0.38, -0.175)), "chair")

    # --- The lamp. -------------------------------------------------------------------------------

    def lamp(self) -> None:
        """An enamel shade hanging on its cord from above the view over the lesson."""
        lens, body, z = self.lens, self.body, LAMP_DEPTH
        metres = lens.metres(z)
        top, bottom = lens.at(LAMP, 60, z), lens.at(LAMP, 82, z)
        ceiling = lens.at(LAMP, TOP, z)
        body.hull(limb(tuple(ceiling), tuple(top), 0.008, 0.008, 4), "cord")
        body.hull(limb(tuple(top), tuple(bottom), 8 * metres, 36 * metres, 10), "lamp-shade")
        bulb = lens.at(LAMP, 88, z)
        body.hull(limb(tuple(bottom), tuple(bulb), 12 * metres, 6 * metres, 8), "bulb")


main()
