"""The Mayor's office, off the High Street, where the Mayor makes the cat a guitar string from her
mane. docs/design/rooms/mayors-office.svg is the layout: the green door out on the left, panelled
walls, a gilt portrait of the Mayor, a long wooden desk, and a red flag on its pole. story/CANON.md
(Places) places it but doesn't describe its look: a civic, slightly pompous office.

    blender -b --factory-startup --python art/blender/mayors-office.py -- \\
        --out frontend/public/models/scenes/mayors-office.glb \\
        [--previews docs/screenshots/blender/mayors-office]

Built from scratch every run, in glTF axes, metres, placed in the reference art's scene pixels
through `cam_main` (lib/scene.py).
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import dome, limb
from lib.export import arguments, empty_scene, export_glb
from lib.scene import FRONT, UP, Room, border, box, ellipse, rect

# STYLE.md's palette, and the reference art's own tones for the office's walls, wood and door. The
# portrait's sitter wears the Mayor's own tones (art/blender/mayor.py).
COLOURS = {
    "boards": "#4A3A30",
    "board-seams": "#3A2E26",
    "wall": "#96805F",
    "pilaster": "#7E6B50",
    "wainscot": "#4A3A30",
    "wainscot-panel": "#3A2E26",
    "rail": "#6E4628",
    "skirting": "#3A2E26",
    "cornice": "#2A1C1A",
    "gilt": "#E3C58A",
    "door-frame": "#2A1C1A",
    "green-door": "#2F4A36",
    "door-panel": "#23382F",
    "brass": "#C9A86A",
    "canvas": "#2E3A52",
    "coat": "#6E4038",
    "muzzle": "#5A332D",
    "mane": "#E3C58A",
    "mane-lock": "#C99A54",
    "sash": "#C8483B",
    "eyes": "#2F2D35",
    "paper": "#D9CDB4",
    "ink": "#2A1C1A",
    "seal": "#C8483B",
    "desk": "#8A5A34",
    "desk-top": "#6E4628",
    "leather": "#2F4A36",
    "plinth": "#2A1C1A",
    "plaque": "#2A1C1A",
    "chair": "#6E4628",
    "velvet": "#C8483B",
    "flag": "#C8483B",
    "flagpole": "#2F2D35",
    "rug": "#5A332D",
}

#: The room's sides, in pixels at the back wall: well past the edges of the view.
LEFT, RIGHT = -300, 1580
#: The top of the back wall, above the view. There is no ceiling: the renderer's key light
#: shines down from above it, and a ceiling would throw the whole room into its shadow.
TOP = -120
#: The rail along the top of the wainscot, the art's row 354.
RAIL = 354
#: The portrait's gilt frame, a pixel rect on the back wall, and the pilasters along the wall,
#: their columns: a pair flanking the portrait and one either side further along.
PORTRAIT, PILASTERS = (560, 90, 160, 200), (290, 504, 750, 1214)
#: The desk's pixel columns in the art, the row its front stands on the boards at, how deep and
#: how high it is: a desk's height, under the art's top, so the chair's back shows over it.
DESK, DESK_ROW, DESK_DEPTH, DESK_HEIGHT = (420, 860), 518, 0.72, 0.8
#: The flag's pole, its column in the art and how far it stands off the back wall, and the flag's
#: pixel rect, hanging from it.
POLE, POLE_OUT, FLAG = 1094, 0.3, (1000, 120, 90, 140)
#: The framed charter on the wall between the door and the portrait, a pixel rect.
CHARTER = (337, 168, 120, 112)


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    room = Room("mayors-office", COLOURS)
    office = MayorsOffice(room)
    office.ground()
    office.walls()
    office.door()
    office.portrait()
    office.charter()
    office.desk()
    office.chair()
    office.flag()
    office.body.finish("mayors-office")
    room.camera()
    export_glb(os.path.abspath(args.out), cameras=True)
    if args.previews:
        room.previews(os.path.abspath(args.previews))


class MayorsOffice:
    """The room's set pieces: the shell, the desk, the chair and the flag in one mesh, and the
    door, its hotspot, on its own."""

    def __init__(self, room: Room):
        self.room = room
        self.lens = room.lens
        #: The back wall's face, where the floor meets it in the art.
        self.wall = self.lens.depth_at(480)
        self.body = room.body()

    def panel(self, points, out: float, depth: float, part: str) -> None:
        self.room.panel(self.body, self.wall, points, out, depth, part)

    # --- The shell. ------------------------------------------------------------------------------

    def ground(self) -> None:
        """`floor`, the boards from the back wall to the front of the walk line, and the boards
        on in front of it, with their seams, and the rug before the desk."""
        room, wall, body = self.room, self.wall, self.body
        room.floor([(-14, wall), (14, wall), (14, FRONT), (-14, FRONT)], "boards")
        body.plate([(-14, 0, FRONT), (14, 0, FRONT), (14, 0, 4), (-14, 0, 4)], "boards", UP)
        room.seams(body, wall, "board-seams")
        centre = self.desk_centre()
        back, front = self.lens.depth_at(DESK_ROW) + 0.1, self.lens.depth_at(560)
        for inset, y, part in ((0, 0.004, "gilt"), (0.1, 0.006, "rug")):
            left, right = centre - 2.1 + inset, centre + 2.1 - inset
            corners = [(left, y, back + inset), (right, y, back + inset)]
            corners += [(right, y, front - inset), (left, y, front - inset)]
            body.plate(corners, part, UP)

    def walls(self) -> None:
        """The panelled back wall and its cornice with a gilt band under it; the pilasters along
        it; the wainscot under its rail, broken by the door, with its raised panels; and the
        skirting at its foot."""
        self.panel(rect(LEFT, TOP, RIGHT - LEFT, 480 - TOP), 0, 0.25, "wall")
        self.panel(rect(LEFT, -4, RIGHT - LEFT, 16), 0.1, 0.1, "cornice")
        self.panel(rect(LEFT, 12, RIGHT - LEFT, 5), 0.06, 0.06, "gilt")
        for x in PILASTERS:
            self.panel(rect(x - 13, 17, 26, RAIL - 17), 0.07, 0.07, "pilaster")
            self.panel(rect(x - 19, 17, 38, 12), 0.09, 0.09, "gilt")
            self.panel(rect(x - 17, RAIL - 12, 34, 12), 0.08, 0.08, "pilaster")
        for x0, x1 in ((LEFT, 60), (220, RIGHT)):
            self.panel(rect(x0, RAIL + 6, x1 - x0, 480 - RAIL - 6), 0.03, 0.03, "wainscot")
            self.panel(rect(x0 - 4, RAIL, x1 - x0 + 8, 8), 0.05, 0.05, "rail")
        for x in range(240, RIGHT - 100, 120):
            for points in border(x, 376, 100, 84, 5):
                self.panel(points, 0.036, 0.006, "wainscot-panel")
        self.panel(rect(LEFT, 472, RIGHT - LEFT, 8), 0.05, 0.05, "skirting")

    # --- `hit_door`. -----------------------------------------------------------------------------

    def door(self) -> None:
        """The green door out to the High Street, in its frame: its four raised panels, its long
        brass handle, and a brass plate on it."""
        lens, wall = self.lens, self.wall
        door = self.room.body()
        self.room.green_door(door, wall)
        for x in (86, 144):
            for y, h in ((180, 120), (334, 128)):
                for points in border(x, y, 50, h, 5):
                    door.hull(lens.outline(points, wall + 0.036, 0.006), "door-panel")
        door.hull(lens.box(186, 320, 6, 30, wall + 0.06, 0.03), "brass")
        door.hull(lens.box(112, 312, 56, 14, wall + 0.034, 0.004), "brass")
        self.room.hotspot("door", door.finish("door"))

    # --- On the walls. ---------------------------------------------------------------------------

    def portrait(self) -> None:
        """The Mayor's portrait in its gilt frame: on a dusk-blue ground, her chestnut head in
        profile, her long gold mane falling behind it, her shoulders, and the red sash across
        them."""
        lens, wall, body = self.lens, self.wall, self.body
        x, y, w, h = PORTRAIT
        for points in border(x, y, w, h, 16):
            self.panel(points, 0.05, 0.05, "gilt")
        self.panel(rect(x + 16, y + 16, w - 32, h - 32), 0.02, 0.02, "canvas")
        for points, out, part in (
            ([(612, 274), (628, 140), (660, 128), (684, 170), (690, 274)], 0.024, "mane"),
            ([(618, 274), (628, 200), (640, 274)], 0.026, "mane-lock"),
            ([(592, 274), (606, 238), (690, 238), (700, 274)], 0.028, "coat"),
            ([(634, 248), (640, 170), (650, 160), (670, 164), (666, 248)], 0.03, "coat"),
            ([(660, 164), (676, 168), (684, 206), (670, 212)], 0.032, "coat"),
            ([(676, 196), (686, 204), (684, 214), (670, 212)], 0.034, "muzzle"),
            ([(642, 170), (646, 146), (654, 164)], 0.03, "coat"),
            ([(608, 274), (614, 256), (690, 238), (696, 254)], 0.034, "sash"),
            ([(636, 152), (662, 146), (650, 186), (632, 200)], 0.034, "mane"),
        ):
            self.panel(points, out, 0.004, part)
        eye = lens.at(662, 184, wall + 0.036)
        body.hull(dome(tuple(eye), 0.018, 0.012, 0.003, 6), "eyes")
        # A small plate on the frame's foot, as on a gallery's portraits.
        self.panel(rect(612, 280, 56, 8), 0.104, 0.004, "brass")

    def charter(self) -> None:
        """Punland's charter, framed on the wall between the door and the portrait: its heading,
        its lines of ink, and its red wax seal on a ribbon."""
        lens, wall, body = self.lens, self.wall, self.body
        x, y, w, h = CHARTER
        for points in border(x - 8, y - 8, w + 16, h + 16, 8):
            self.panel(points, 0.035, 0.035, "gilt")
        self.panel(rect(x, y, w, h), 0.02, 0.02, "paper")
        self.panel(rect(x + 30, y + 12, w - 60, 6), 0.022, 0.002, "ink")
        for row in range(5):
            self.panel(rect(x + 14, y + 30 + 11 * row, w - 28, 2), 0.022, 0.002, "ink")
        cx, cy = x + w - 26, y + h - 20
        for turn in (-20, 20):
            ribbon = lens.at(cx, cy, wall + 0.023)
            end = lens.at(cx + math.sin(math.radians(turn)) * 14, cy + 20, wall + 0.023)
            body.hull(limb(tuple(ribbon), tuple(end), 0.008, 0.01, 4), "sash")
        self.panel(ellipse(cx, cy, 11, 11, sides=12), 0.03, 0.008, "seal")

    # --- The desk. -------------------------------------------------------------------------------

    def desk_front(self) -> float:
        return self.lens.depth_at(DESK_ROW)

    def desk_centre(self) -> float:
        front = self.desk_front()
        return (self.lens.at(DESK[0], 0, front).x + self.lens.at(DESK[1], 0, front).x) / 2

    def desk(self) -> None:
        """The Mayor's long pedestal desk: its top, with a green leather inlay, on two pedestals of
        drawers on their plinths, the panel between them with her name plate, and on top a stack
        of papers, an inkwell and its quill, and the town's seal stamp."""
        lens, body = self.lens, self.body
        front = self.desk_front()
        left, right = lens.at(DESK[0], 0, front).x, lens.at(DESK[1], 0, front).x
        back, top = front - DESK_DEPTH, DESK_HEIGHT
        body.hull(
            box((left - 0.05, top - 0.05, back - 0.03), (right + 0.05, top, front + 0.05)),
            "desk-top",
        )
        inlay = box((left + 0.2, top, back + 0.1), (right - 0.2, top + 0.004, front - 0.08))
        body.hull(inlay, "leather")
        for x0, x1 in ((left, left + 0.72), (right - 0.72, right)):
            body.hull(box((x0, 0.08, back), (x1, top - 0.05, front)), "desk")
            body.hull(box((x0 - 0.03, 0, back - 0.03), (x1 + 0.03, 0.08, front + 0.03)), "plinth")
            self.drawers(x0, x1, front)
        middle = (left + right) / 2
        body.hull(
            box((left + 0.72, 0.3, back + 0.1), (right - 0.72, top - 0.05, front - 0.12)), "desk"
        )
        self.name_plate(middle, 0.56, front - 0.12)
        self.papers(left + 0.5, top + 0.004, front - 0.35)
        self.inkwell(right - 0.55, top + 0.004, front - 0.3)
        self.stamp(middle + 0.5, top + 0.004, front - 0.32)

    def drawers(self, left: float, right: float, front: float) -> None:
        """A pedestal's three drawer fronts, each with a brass pull."""
        body, middle = self.body, (left + right) / 2
        for low, high in ((0.12, 0.33), (0.37, 0.53), (0.57, 0.71)):
            drawer = box((left + 0.05, low, front), (right - 0.05, high, front + 0.015))
            body.hull(drawer, "desk-top")
            pull = (middle, (low + high) / 2, front + 0.015)
            body.hull(
                box(
                    (pull[0] - 0.06, pull[1] - 0.012, pull[2]),
                    (pull[0] + 0.06, pull[1] + 0.012, pull[2] + 0.02),
                ),
                "brass",
            )

    def name_plate(self, x: float, y: float, z: float) -> None:
        """A dark plate on the desk's front panel, framed in brass, with MAYOR in gold."""
        body = self.body
        body.hull(box((x - 0.36, y - 0.1, z), (x + 0.36, y + 0.1, z + 0.012)), "brass")
        body.hull(box((x - 0.33, y - 0.075, z), (x + 0.33, y + 0.075, z + 0.018)), "plaque")
        self.room.sign("name-plate", "MAYOR", "gilt", 0.09, (x, y, z + 0.02), spacing=1.3)

    def papers(self, x: float, y: float, z: float) -> None:
        """A stack of papers to sign, a little askew, sheet on sheet."""
        for i, turn in enumerate((0, 6, -4, 9)):
            t = math.radians(turn)
            corners = [
                (
                    x + u * math.cos(t) + s * math.sin(t),
                    y + 0.012 * i + dy,
                    z - u * math.sin(t) + s * math.cos(t),
                )
                for u in (-0.15, 0.15)
                for s in (-0.11, 0.11)
                for dy in (0, 0.01)
            ]
            self.body.hull(corners, "paper")

    def inkwell(self, x: float, y: float, z: float) -> None:
        """A squat glass inkwell and the quill standing in it, leaning back."""
        body = self.body
        body.hull(limb((x, y, z), (x, y + 0.07, z), 0.05, 0.035, 8), "ink")
        body.hull(limb((x, y + 0.07, z), (x, y + 0.08, z), 0.02, 0.02, 8), "brass")
        tip, end = (x, y + 0.04, z), (x - 0.08, y + 0.36, z - 0.06)
        body.hull(limb(tip, end, 0.004, 0.004, 4), "paper")
        body.hull(limb((x - 0.03, y + 0.16, z - 0.022), end, 0.022, 0.008, 4), "paper")

    def stamp(self, x: float, y: float, z: float) -> None:
        """The town's seal stamp: a brass foot and a turned wooden handle with a knob."""
        body = self.body
        body.hull(limb((x, y, z), (x, y + 0.03, z), 0.045, 0.045, 10), "brass")
        body.hull(limb((x, y + 0.03, z), (x, y + 0.14, z), 0.018, 0.025, 8), "chair")
        body.hull(dome((x, y + 0.16, z - 0.02), 0.035, 0.035, 0.04, 8), "chair")

    # --- The chair. ------------------------------------------------------------------------------

    def chair(self) -> None:
        """The Mayor's high-backed chair behind the desk, its back above it: the frame, the red
        velvet inside it, and a gilt crest on top; its seat and legs."""
        body, x = self.body, self.desk_centre()
        back = self.wall + 0.1
        seat = 0.48
        body.hull(box((x - 0.34, 0, back), (x + 0.34, 1.3, back + 0.08)), "chair")
        body.hull(box((x - 0.27, seat + 0.1, back + 0.08), (x + 0.27, 1.22, back + 0.11)), "velvet")
        crest = [
            (x + dx, y, back + dz)
            for dx, y in ((-0.38, 1.3), (0.38, 1.3), (-0.2, 1.38), (0.2, 1.38), (0, 1.44))
            for dz in (0.0, 0.09)
        ]
        body.hull(crest, "gilt")
        body.hull(
            box((x - 0.32, seat - 0.06, back + 0.08), (x + 0.32, seat + 0.04, back + 0.58)),
            "velvet",
        )
        for dx in (-0.3, 0.3):
            body.hull(
                limb((x + dx, 0, back + 0.54), (x + dx, seat - 0.06, back + 0.54), 0.025, 0.025, 6),
                "chair",
            )

    # --- The flag. -------------------------------------------------------------------------------

    def flag(self) -> None:
        """Punland's flag hanging from its pole beside the desk: the pole on its brass foot with a
        gilt spearhead, the red flag in folds with a gold fringe, and the town's gold disc on it."""
        lens, body = self.lens, self.body
        z = self.wall + POLE_OUT
        pole = lens.at(POLE, 0, z)
        top = lens.at(POLE, 100, z).y
        body.hull(limb((pole.x, 0, z), (pole.x, 0.06, z), 0.16, 0.12, 10), "brass")
        body.hull(limb((pole.x, 0.06, z), (pole.x, top, z), 0.025, 0.022, 8), "flagpole")
        body.hull(dome((pole.x, top + 0.03, z - 0.03), 0.04, 0.04, 0.06, 8), "gilt")
        body.hull(limb((pole.x, top + 0.04, z), (pole.x, top + 0.24, z), 0.035, 0.003, 4), "gilt")
        x, y, w, h = FLAG
        high, low = lens.at(x, y, z).y, lens.at(x, y + h, z).y
        near = pole.x - 0.02
        far = lens.at(x, y, z).x
        folds = 4
        columns = [near + (far - near) * i / folds for i in range(folds + 1)]
        waves = [0.035 * (1 if i % 2 else -1) * (i > 0) for i in range(folds + 1)]
        cloth: list = []
        for i in range(folds):
            a, b = columns[i], columns[i + 1]
            za, zb = z + waves[i], z + waves[i + 1]
            corners = [
                (u, v, zz + t)
                for u, zz in ((a, za), (b, zb))
                for v in (low, high)
                for t in (0, -0.01)
            ]
            cloth += body.hull(corners, "flag")
            fringe = [
                (u, v, zz + t)
                for u, zz in ((a, za), (b, zb))
                for v in (low - 0.06, low)
                for t in (0.002, -0.012)
            ]
            body.hull(fringe, "gilt")
        cx, cy = (near + far) / 2, (high + low) / 2
        disc = [
            (cx + 0.17 * math.cos(t), cy + 0.17 * math.sin(t))
            for t in (2 * math.pi * i / 12 for i in range(12))
        ]
        body.decal(cloth, disc, 0.006, "gilt", None)


main()
