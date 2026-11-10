"""Inside The Three Crows: the brick-walled pub, warm and loud. docs/design/rooms/pub.svg is the
layout: the street door on the left with the blue evening in its glass, the window over the low
stage, the Wall of Fame and its four photos, the long bar with its taps, the back bar's shelves of
bottles under the pub's name, and the two lamps hanging from the joists. story/CANON.md (Places)
describes it.

    blender -b --factory-startup --python art/blender/pub.py -- \\
        --out frontend/public/models/scenes/pub.glb \\
        [--previews docs/screenshots/blender/pub]

Built from scratch every run, in glTF axes, metres, placed in the reference art's scene pixels
through `cam_main` (lib/scene.py).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import limb
from lib.export import arguments, empty_scene, export_glb
from lib.scene import FRONT, UP, Room, box, ellipse, rect

# STYLE.md's palette, and the reference art's own tones for the pub's wood, brick and glass.
COLOURS = {
    "boards": "#4A3A30",
    "board-seams": "#3A2E26",
    "skirting": "#3A2E26",
    "brick": "#6E4038",
    "mortar": "#5A332D",
    "ceiling": "#2F2D35",
    "joists": "#2A1C1A",
    "wainscot": "#4A3A30",
    "rail": "#6E4628",
    "moulding": "#3A2E26",
    "night": "#2E3A52",
    "window-frame": "#2A1C1A",
    "sill": "#6E4628",
    "door-frame": "#2A1C1A",
    "door": "#1A2822",
    "glazing": "#142019",
    "door-panel": "#23382F",
    "brass": "#C9A86A",
    "mat": "#5E5A62",
    "bulbs": "#FFE3A0",
    "wire": "#1A1820",
    "stage": "#6E4628",
    "stage-nosing": "#8A5A34",
    "amp": "#1E1E24",
    "amp-grille": "#4A464E",
    "iron": "#16161A",
    "fame-board": "#4A3A30",
    "frame": "#2A1C1A",
    "fascia": "#1A2822",
    "sign-gold": "#E3C58A",
    "photo": "#D9CDB4",
    "rock": "#6E6A82",
    "beetle": "#2F2D35",
    "mop-top": "#6E4628",
    "tuna": "#5FA39A",
    "pike": "#3E5E44",
    "katty": "#D88A4A",
    "lips": "#C8483B",
    "bar": "#6E4628",
    "bar-top": "#8A5A34",
    "bar-panel": "#4A3A30",
    "shelf": "#8A5A34",
    "shelf-edge": "#4A3A30",
    "tap-bar": "#8A5A34",
    "tap-black": "#2F2D35",
    "tap-red": "#C8483B",
    "beer": "#E8B566",
    "froth": "#F4EFE6",
    "bottle-green": "#3E5E44",
    "bottle-amber": "#C99A54",
    "bottle-purple": "#8A7FA8",
    "bottle-red": "#C8483B",
    "bottle-teal": "#5FA39A",
    "lamp-shade": "#2F4A36",
    "cord": "#16161A",
}

#: The room's sides, in pixels at the back wall: well past the edges of the view.
LEFT, RIGHT = -300, 1580
#: How deep the bar is, from its front on the boards (the art's row 512) to its back.
BAR_DEPTH = 0.55
#: Where the two lamps hang: their depth, between the stage and the walk line.
LAMP_DEPTH = -1.2

#: The back bar's bottles, as the art draws them: (x, top, width, colour), standing on
#: the upper shelf (row 180) and the lower one (row 270).
BOTTLES = {
    180: (
        (816, 138, 14, "green"),
        (842, 146, 16, "amber"),
        (870, 132, 12, "purple"),
        (1110, 140, 14, "red"),
        (1136, 134, 14, "green"),
        (1164, 148, 18, "amber"),
        (1196, 138, 12, "teal"),
        (1224, 144, 14, "purple"),
    ),
    270: (
        (818, 230, 16, "amber"),
        (846, 224, 12, "red"),
        (872, 236, 14, "green"),
        (1120, 226, 14, "teal"),
        (1150, 234, 16, "amber"),
        (1182, 228, 12, "purple"),
        (1210, 232, 14, "red"),
    ),
}


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    room = Room("pub", COLOURS)
    pub = Pub(room)
    pub.ground()
    pub.walls()
    pub.ceiling()
    pub.window()
    pub.door()
    pub.stage()
    pub.fame()
    pub.back_bar()
    pub.bar()
    pub.lamps()
    pub.outside()
    pub.body.finish("pub")
    room.camera()
    export_glb(os.path.abspath(args.out), cameras=True)
    if args.previews:
        room.previews(os.path.abspath(args.previews))


class Pub:
    """The room's set pieces: the shell, the bar and what hangs on the walls in one mesh, the
    hotspots each on their own, and the evening outside the window."""

    def __init__(self, room: Room):
        self.room = room
        self.lens = room.lens
        #: The back wall's face, where the floor meets it in the art.
        self.wall = self.lens.depth_at(470)
        #: The ceiling, at the art's row 40 on the back wall.
        self.top = self.y(40)
        self.body = room.body()

    def y(self, row: float) -> float:
        """The height on the back wall of a pixel row."""
        return self.lens.at(640, row, self.wall).y

    def on_wall(self, body, points, out: float, depth: float, part: str) -> None:
        """The pixel outline `points`, standing `out` off the back wall and `depth` deep."""
        body.hull(self.lens.outline(points, self.wall + out, depth), part)

    def bulge(self, body, cx, cy, rx, ry, z: float, part: str, sides: int = 8) -> None:
        """A rounded pixel ellipse at depth `z`, domed towards the camera, so it reads in facets."""
        lens, metres = self.lens, self.lens.metres(z)
        rim = [lens.at(x, y, z) for x, y in ellipse(cx, cy, rx, ry, sides=sides)]
        crown = [
            lens.at(x, y, z + 0.5 * min(rx, ry) * metres)
            for x, y in ellipse(cx, cy, 0.6 * rx, 0.6 * ry, sides=sides)
        ]
        body.hull([tuple(p) for p in rim + crown], part)

    # --- The shell. ------------------------------------------------------------------------------

    def ground(self) -> None:
        """`floor`, the boards from the back wall to the front of the walk line, and the boards
        on in front of it, their seams across the room, and the mat inside the door."""
        room, lens, wall = self.room, self.lens, self.wall
        room.floor([(-14, wall), (14, wall), (14, FRONT), (-14, FRONT)], "boards")
        body = self.body
        body.plate([(-14, 0, FRONT), (14, 0, FRONT), (14, 0, 4), (-14, 0, 4)], "boards", UP)
        z, row = wall + 0.62, 0
        while z < 3:
            body.plate(
                [(-14, 0.002, z), (14, 0.002, z), (14, 0.002, z + 0.02), (-14, 0.002, z + 0.02)],
                "board-seams",
                UP,
            )
            for x in range(-12 + 2 * (row % 2), 13, 4):
                joint = x + (0.8 * row) % 1.7
                body.plate(
                    [
                        (joint, 0.002, z - 0.62),
                        (joint + 0.02, 0.002, z - 0.62),
                        (joint + 0.02, 0.002, z),
                        (joint, 0.002, z),
                    ],
                    "board-seams",
                    UP,
                )
            z, row = z + 0.64, row + 1
        corners = [lens.floor(x, y) for x, y in ((70, 470), (214, 470), (226, 492), (58, 492))]
        body.plate([(p.x, 0.004, p.z) for p in corners], "mat", UP)

    def walls(self) -> None:
        """The back wall in brick, with its mortar courses, open for the window; the wainscot
        under its rail, broken by the door; and the skirting at its foot."""
        body = self.body
        for x0, x1, top, bottom in (
            (LEFT, 330, 40, 470),
            (454, RIGHT, 40, 470),
            (330, 454, 40, 116),
            (330, 454, 272, 470),
        ):
            self.on_wall(body, rect(x0, top, x1 - x0, bottom - top), 0, 0.25, "brick")
        for row in range(64, 377, 24):
            for x0, x1 in ((LEFT, 330), (454, RIGHT)):
                self.on_wall(body, rect(x0, row - 1, x1 - x0, 2), 0.004, 0.01, "mortar")
        for x, row in ((250, 66), (520, 114), (640, 186), (226, 258), (700, 306), (300, 354)):
            self.on_wall(body, rect(x, row, 44, 20), 0.004, 0.01, "mortar")
        for x0, x1 in ((LEFT, 60), (222, RIGHT)):
            self.on_wall(body, rect(x0, 384, x1 - x0, 86), 0.03, 0.03, "wainscot")
            self.on_wall(body, rect(x0 - 4, 378, x1 - x0 + 8, 10), 0.05, 0.05, "rail")
        for x in (240, 500):
            self.frame(body, x, 400, 240, 56, 2, 0.034, "moulding")
        self.on_wall(body, rect(LEFT, 462, RIGHT - LEFT, 8), 0.05, 0.05, "skirting")

    def frame(self, body, x, y, w, h, bar, out: float, part: str) -> None:
        """A pixel rect's border, `bar` pixels wide, standing `out` off the back wall."""
        for points in (
            rect(x, y, w, bar),
            rect(x, y + h - bar, w, bar),
            rect(x, y, bar, h),
            rect(x + w - bar, y, bar, h),
        ):
            self.on_wall(body, points, out, 0.006, part)

    def ceiling(self) -> None:
        """The dark ceiling, the beam along the back wall and the joists running out from it."""
        body, wall, top = self.body, self.wall, self.top
        body.plate(
            [(-14, top, wall), (14, top, wall), (14, top, 4), (-14, top, 4)], "ceiling", (0, -1, 0)
        )
        self.on_wall(body, rect(LEFT, 36, RIGHT - LEFT, 8), 0.15, 0.15, "joists")
        for x in (150, 470, 790, 1110):
            left = self.lens.at(x, 40, wall).x
            width = 16 * self.lens.metres(wall)
            body.hull(box((left, top - 0.3, wall), (left + width, top, 4)), "joists")

    def window(self) -> None:
        """The window over the stage, set back in the wall: its frame, mullion and transom, and
        its sill."""
        body, lens, z = self.body, self.lens, self.wall - 0.12
        for x, y, w, h in (
            (330, 116, 124, 5),
            (330, 267, 124, 5),
            (330, 116, 5, 156),
            (449, 116, 5, 156),
            (389.5, 116, 5, 156),
            (330, 191.5, 124, 5),
        ):
            body.hull(lens.box(x, y, w, h, z, 0.05), "window-frame")
        self.on_wall(body, rect(316, 272, 152, 12), 0.12, 0.37, "sill")

    def outside(self) -> None:
        """The evening through the window: the blocks across the street, the towers behind them,
        each lighter and bluer with distance, and the night sky."""
        room, lens = self.room, self.lens
        city = room.body()
        for x, y, w in ((336, 200, 22), (362, 176, 30), (398, 214, 18), (420, 190, 28)):
            room.far(city, lens.box(x, y, w, 400 - y, -16, 4))
        for x, y, w in ((345, 150, 14), (404, 162, 12), (438, 140, 16)):
            room.far(city, lens.box(x, y, w, 400 - y, -42, 6))
        city.finish("city")
        sky = room.body()
        sky.hull(lens.box(280, 60, 230, 340, -150, 1), "night")
        sky.finish("sky")

    # --- The hotspots: `hit_door`, `hit_stage` and `hit_fame`. ------------------------------------

    def door(self) -> None:
        """The street door in its frame: the evening and the street's festoons in its glass,
        its lower panel and its brass handle."""
        lens, wall = self.lens, self.wall
        door = self.room.body()
        for points in (rect(60, 138, 14, 332), rect(208, 138, 14, 332), rect(60, 138, 162, 14)):
            door.hull(lens.outline(points, wall + 0.05, 0.05), "door-frame")
        door.hull(lens.box(74, 152, 134, 318, wall + 0.02, 0.02), "door")
        door.hull(lens.box(88, 166, 106, 124, wall + 0.024, 0.004), "night")
        for x, y, w, h in ((88, 240, 20, 50), (112, 222, 26, 68), (160, 250, 34, 40)):
            door.hull(lens.box(x, y, w, h, wall + 0.026, 0.002), "depth-1")
        festoon = [(88, 200), (104, 207), (130, 213), (156, 212), (182, 203), (194, 196)]
        z = wall + 0.027
        for a, b in zip(festoon, festoon[1:], strict=False):
            door.hull(limb(tuple(lens.at(*a, z)), tuple(lens.at(*b, z)), 0.003, 0.003, 4), "wire")
        for x, y in festoon[1:-1]:
            door.hull(lens.outline(ellipse(x, y + 3, 3, 3, sides=6), z + 0.002, 0.004), "bulbs")
        for x, y, w, h in (
            (88, 166, 106, 4),
            (88, 286, 106, 4),
            (88, 166, 4, 124),
            (190, 166, 4, 124),
            (139, 166, 4, 124),
        ):
            door.hull(lens.box(x, y, w, h, wall + 0.03, 0.006), "glazing")
        for x, y, w, h in (
            (92, 320, 98, 3),
            (92, 449, 98, 3),
            (92, 320, 3, 132),
            (187, 320, 3, 132),
        ):
            door.hull(lens.box(x, y, w, h, wall + 0.026, 0.006), "door-panel")
        door.hull(lens.box(182, 330, 6, 30, wall + 0.045, 0.025), "brass")
        self.room.hotspot("door", door.finish("door"))

    def stage(self) -> None:
        """The low stage under the window, from the back wall out to the art's row 522, with an
        amp and a microphone stand on it."""
        lens, wall = self.lens, self.wall
        front = lens.depth_at(522)
        stage = self.room.body()
        stage.hull(lens.box(230, 474, 480, 48, front, front - wall), "stage")
        stage.hull(lens.box(228, 474, 484, 7, front + 0.03, front - wall + 0.03), "stage-nosing")
        deck = lens.at(640, 474, front).y
        # The amp, at the stage's right.
        x0, z0 = lens.at(650, 474, front).x, front - 0.45
        stage.hull(box((x0 - 0.24, deck, z0 - 0.16), (x0 + 0.24, deck + 0.52, z0 + 0.16)), "amp")
        stage.hull(
            box((x0 - 0.2, deck + 0.06, z0 + 0.16), (x0 + 0.2, deck + 0.4, z0 + 0.17)), "amp-grille"
        )
        # The microphone stand, at the front of the stage, beside where the dog stands to sing.
        x, z = lens.at(390, 474, front).x, front - 0.35
        for dx, dz in ((0.16, 0), (-0.08, 0.14), (-0.08, -0.14)):
            stage.hull(limb((x, deck, z), (x + dx, deck, z + dz), 0.012, 0.012, 4), "iron")
        stage.hull(limb((x, deck, z), (x, deck + 1.25, z), 0.012, 0.012, 6), "iron")
        stage.hull(limb((x, deck + 1.25, z), (x, deck + 1.27, z + 0.1), 0.01, 0.01, 4), "iron")
        stage.hull(
            limb((x, deck + 1.27, z + 0.1), (x, deck + 1.32, z + 0.16), 0.025, 0.03, 6),
            "amp-grille",
        )
        self.room.hotspot("stage", stage.finish("stage"))

    def fame(self) -> None:
        """The Wall of Fame: its board and name, and its four framed photos of the pub's greats,
        modelled: the Rolling Stones (a pile of rocks), the Beetles (beetles with 60s haircuts),
        Tuna and Pike Turner, and Katty Purry."""
        room, lens, wall = self.room, self.lens, self.wall
        fame = room.body()
        self.on_wall(fame, rect(496, 160, 200, 180), 0.03, 0.03, "fame-board")
        self.frame(fame, 496, 160, 200, 180, 4, 0.034, "frame")
        self.on_wall(fame, rect(500, 146, 192, 14), 0.035, 0.035, "fascia")
        name = room.sign(
            "fame-name",
            "WALL OF FAME",
            "sign-gold",
            8.4 * lens.metres(wall),
            tuple(lens.at(596, 153, wall + 0.037)),
            spacing=1.5,
        )
        for x, y in ((508, 172), (602, 172), (508, 256), (602, 256)):
            self.on_wall(fame, rect(x - 3, y - 3, 88, 76), 0.036, 0.006, "frame")
            self.on_wall(fame, rect(x, y, 82, 70), 0.04, 0.004, "photo")
        z = wall + 0.041
        # The Rolling Stones: a pile of rocks.
        for cx, cy, rx, ry in (
            (528, 229, 10, 8),
            (547, 230, 10, 7),
            (567, 229, 10, 8),
            (537, 216, 9, 7),
            (557, 215, 9, 8),
            (547, 203, 8, 6),
        ):
            self.bulge(fame, cx, cy, rx, ry, z, "rock", sides=7)
        # The Beetles: two beetles, mop-topped.
        for cx in (626, 660):
            for side in (-1, 1):
                for row in (218, 225, 232):
                    leg = [
                        (cx, row),
                        (cx + side * 13, row - 3),
                        (cx + side * 13, row - 1),
                        (cx, row + 2),
                    ]
                    fame.hull(lens.outline(leg, z, 0.002), "beetle")
            self.bulge(fame, cx, 225, 8, 11, z, "beetle")
            self.bulge(fame, cx, 211, 6, 5, z + 0.002, "beetle")
            mop = [(cx - 10, 213), (cx + 10, 213)] + [
                p for p in ellipse(cx, 211, 10, 10, sides=12) if p[1] <= 211
            ]
            fame.hull(lens.outline(mop, z + 0.006, 0.004), "mop-top")
        # Tuna and Pike Turner: a stout tuna over a long pike.
        for body, tail, part in (
            (
                [(514, 290), (538, 278), (560, 290), (538, 302)],
                [(558, 290), (574, 280), (574, 300)],
                "tuna",
            ),
            (
                [(516, 314), (542, 308), (566, 313), (542, 319)],
                [(564, 313), (578, 306), (578, 320)],
                "pike",
            ),
        ):
            fame.hull(lens.outline(body, z + 0.004, 0.004), part)
            fame.hull(lens.outline(tail, z + 0.002, 0.002), part)
        # Katty Purry: a cat's head, eyes and red lips.
        head = [
            (624, 320),
            (624, 284),
            (630, 270),
            (640, 282),
            (650, 282),
            (660, 270),
            (666, 284),
            (666, 320),
        ]
        fame.hull(lens.outline(head, z + 0.003, 0.003), "katty")
        for x in (637, 653):
            fame.hull(lens.outline(ellipse(x, 296, 3, 3.5, sides=6), z + 0.005, 0.002), "beetle")
        fame.hull(lens.outline(ellipse(645, 309, 5, 2.5, sides=8), z + 0.005, 0.002), "lips")
        room.hotspot("fame", fame.finish("fame"), name)

    # --- The bar. ------------------------------------------------------------------------------

    def back_bar(self) -> None:
        """The pub's name over the back bar, its two shelves and the bottles on them."""
        room, lens, wall, body = self.room, self.lens, self.wall, self.body
        self.on_wall(body, rect(860, 62, 330, 62), 0.04, 0.04, "fascia")
        self.on_wall(body, rect(866, 68, 318, 50), 0.042, 0.002, "sign-gold")
        self.on_wall(body, rect(868, 70, 314, 46), 0.044, 0.002, "fascia")
        room.sign(
            "pub-name",
            "THE THREE CROWS",
            "sign-gold",
            21 * lens.metres(wall),
            tuple(lens.at(1025, 95, wall + 0.046)),
            spacing=1.4,
        )
        for row, bottles in BOTTLES.items():
            self.on_wall(body, rect(800, row, 460, 12), 0.25, 0.25, "shelf")
            self.on_wall(body, rect(800, row + 12, 460, 6), 0.24, 0.02, "shelf-edge")
            shelf = self.y(row)
            z = wall + 0.12
            metres = lens.metres(z)
            for x, top, w, colour in bottles:
                centre = lens.at(x + w / 2, row, z).x
                height = (row - top) * metres
                radius = w / 2 * metres
                body.hull(
                    limb((centre, shelf, z), (centre, shelf + height, z), radius, radius, 6),
                    f"bottle-{colour}",
                )
                neck = (centre, shelf + height + 0.1, z)
                body.hull(
                    limb((centre, shelf + height, z), neck, 0.35 * radius, 0.3 * radius, 6),
                    f"bottle-{colour}",
                )

    def bar(self) -> None:
        """The long bar, from the art's x 748 off to the right: its panelled front on the boards
        at row 512, its top and lip, the brass foot rail, the taps and a pint."""
        lens, body = self.lens, self.body
        front = lens.depth_at(512)
        body.hull(lens.standing(748, 382, RIGHT - 748, 130, BAR_DEPTH), "bar")
        under = lens.at(748, 382, front).y
        top = lens.at(748, 356, front + 0.06).y
        left = lens.at(732, 356, front + 0.06).x
        right = lens.at(RIGHT, 356, front).x
        body.hull(
            box((left, under, front - BAR_DEPTH - 0.04), (right, top, front + 0.06)), "bar-top"
        )
        body.hull(
            box((left + 0.02, under - 0.06, front - 0.05), (right, under, front + 0.03)), "bar"
        )
        for x in range(792, RIGHT - 140, 160):
            for points in (
                rect(x, 398, 140, 3),
                rect(x, 493, 140, 3),
                rect(x, 398, 3, 98),
                rect(x + 137, 398, 3, 98),
            ):
                body.hull(lens.outline(points, front + 0.012, 0.012), "bar-panel")
        rail = lens.at(760, 492, front + 0.12)
        end = lens.at(RIGHT, 492, front + 0.12)
        body.hull(limb(tuple(rail), tuple(end), 0.025, 0.025, 6), "brass")
        for x in range(800, RIGHT, 220):
            foot = lens.at(x, 492, front + 0.12)
            body.hull(limb(tuple(foot), (foot.x, foot.y, front), 0.012, 0.012, 4), "brass")
        # The taps, at the bar's left end, and a pint at its right.
        z = front - 0.18
        for px, handle in ((792, "tap-black"), (812, "tap-red")):
            x = lens.at(px, 356, front).x
            body.hull(limb((x, top, z), (x, top + 0.3, z), 0.022, 0.022, 6), "brass")
            body.hull(limb((x, top + 0.3, z), (x, top + 0.42, z + 0.02), 0.022, 0.03, 6), handle)
            body.hull(limb((x, top + 0.26, z), (x, top + 0.26, z + 0.08), 0.01, 0.008, 4), "brass")
        a, b = lens.at(782, 356, front).x, lens.at(822, 356, front).x
        body.hull(box((a, top + 0.24, z - 0.04), (b, top + 0.3, z + 0.04)), "tap-bar")
        x = lens.at(1159, 356, front).x
        z = front - 0.12
        body.hull(limb((x, top, z), (x, top + 0.14, z), 0.035, 0.045, 8), "beer")
        body.hull(limb((x, top + 0.14, z), (x, top + 0.17, z), 0.045, 0.045, 8), "froth")

    # --- The lamps. ------------------------------------------------------------------------------

    def lamps(self) -> None:
        """The two green-shaded lamps hanging from the ceiling over the stage and the room."""
        lens, body, z = self.lens, self.body, LAMP_DEPTH
        metres = lens.metres(z)
        for x in (300, 640):
            top, bottom = lens.at(x, 78, z), lens.at(x, 104, z)
            body.hull(limb((top.x, self.top, z), tuple(top), 0.008, 0.008, 4), "cord")
            body.hull(limb(tuple(top), tuple(bottom), 24 * metres, 40 * metres, 10), "lamp-shade")
            bulb = lens.at(x, 108, z)
            body.hull(limb(tuple(bottom), tuple(bulb), 14 * metres, 8 * metres, 8), "bulbs")


main()
