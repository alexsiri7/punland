"""The High Street, further down from The Three Crows. docs/design/rooms/high-street.svg is the
layout: the green-fronted music shop with its lit window full of guitars, the brick house next
door with the Song Master's green door and his brass intercom marked S.M., the signposts back to
the pub and on to the Mayor's, and the city through the side streets either side, lighter and
bluer with distance. story/CANON.md (Places) describes it.

    blender -b --factory-startup --python art/blender/high-street.py -- \\
        --out frontend/public/models/scenes/high-street.glb \\
        [--previews docs/screenshots/blender/high-street]

Built from scratch every run, in glTF axes, metres, placed in the reference art's scene pixels
through `cam_main` (lib/scene.py).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import limb
from lib.export import arguments, empty_scene, export_glb
from lib.scene import FRONT, UP, Room, border, box, ellipse, rect

# STYLE.md's palette, and the reference art's own tones for the shop and the house.
COLOURS = {
    "pavement": "#5E5A62",
    "paving-joints": "#55515A",
    "kerb": "#4A464E",
    "road": "#2F2D35",
    "stucco": "#96805F",
    "cornice": "#A89F8E",
    "shopfront": "#2F4A36",
    "frame": "#2A1C1A",
    "fascia": "#1A2822",
    "sign-gold": "#E3C58A",
    "window-glow": "#E8B566",
    "guitar": "#8A5A34",
    "fretboard": "#4A3A30",
    "sill": "#A89F8E",
    "door": "#1A2822",
    "door-glass": "#E8B566",
    "brass": "#C9A86A",
    "card": "#D9CDB4",
    "poster-red": "#C8483B",
    "step": "#4A464E",
    "brick": "#6E4038",
    "mortar": "#5A332D",
    "window-frame": "#C9C0AE",
    "curtain": "#C99A54",
    "silhouette": "#8A5A34",
    "green-door": "#2F4A36",
    "door-panel": "#23382F",
    "lintel": "#A89F8E",
    "intercom": "#E3C58A",
    "intercom-shade": "#C99A54",
    "button": "#2A1C1A",
    "drainpipe": "#2F2D35",
    "dusk": "#2E3A52",
    "haze": "#6E6478",
    "horizon": "#C98A6C",
}

#: The kerb's drop from the pavement to the road, in front of the walk line and in the side
#: streets.
KERB = 0.12
#: How deep the two buildings are, back from their fronts.
BUILDING_DEPTH = 1.0
#: The side streets, either side of the row: the pixel columns the buildings stand between.
ROW_LEFT, ROW_RIGHT = 150, 1040
#: Across a side street from the row's end: its pavement, then its road.
SIDE_PAVEMENT, SIDE_ROAD = 1.0, 3.0
#: Where the side streets end, at the blocks across their far ends.
SIDE_END = -60
#: The far side of each side street, from the High Street back: the corner building, its yard's
#: wall, then the terrace, each block as where it ends and how tall it is, in metres.
TERRACE = (
    (-8.0, 6.0),
    (-18.0, 1.2),
    (-24.0, 3.4),
    (-31.0, 2.8),
    (-39.0, 3.8),
    (-48.0, 3.2),
    (SIDE_END, 4.0),
)
#: The city's towers through the side streets, after the reference art: (x, width) in pixels
#: at depth z, and how tall each is, in metres.
TOWERS = (
    (0, 54, -40, 6.2),
    (96, 44, -40, 5.4),
    (1060, 64, -40, 5.8),
    (1170, 52, -40, 7.0),
    (-40, 130, -90, 11.5),
    (100, 70, -90, 9.5),
    (1040, 120, -90, 12.5),
    (1190, 120, -90, 10.0),
)


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    room = Room("high-street", COLOURS)
    street = HighStreet(room)
    street.ground()
    street.music_shop()
    street.shop_door()
    street.house()
    street.flat_door()
    street.intercom()
    street.side_streets()
    room.signpost("pub-signpost", "back", 112, "PUB", "sign-gold", -1)
    room.signpost("mayor-signpost", "mayor", 1112, "MAYOR", "poster-red", 1)
    street.buildings.finish("buildings")
    room.camera()
    export_glb(os.path.abspath(args.out), cameras=True)
    if args.previews:
        room.previews(os.path.abspath(args.previews))


class HighStreet:
    """The room's set pieces: the street, the two buildings and what is on their fronts in one
    mesh, the hotspots each on their own, and the city and the sky."""

    def __init__(self, room: Room):
        self.room = room
        self.lens = room.lens
        #: The buildings' fronts, where the pavement meets them in the art.
        self.wall = self.lens.depth_at(518)
        self.buildings = room.body()

    def front(self, points, out: float, depth: float, part: str) -> None:
        """The pixel outline `points`, standing `out` off the buildings' fronts, `depth` deep."""
        self.buildings.hull(self.lens.outline(points, self.wall + out, depth), part)

    # --- The street. ---------------------------------------------------------------------------

    def ground(self) -> None:
        """`floor`, the pavement from the buildings to the front of the walk line, its joints,
        and the kerb and the road in front of it."""
        room, lens, wall = self.room, self.lens, self.wall
        room.floor([(-14, wall), (14, wall), (14, FRONT), (-14, FRONT)], "pavement")
        body = room.body()
        road = -KERB
        body.plate(
            [(-30, road, FRONT), (30, road, FRONT), (30, road, 6), (-30, road, 6)], "road", UP
        )
        body.hull(box((-30, road, FRONT - 0.09), (30, 0.004, FRONT)), "kerb")
        joint = 0.002
        z = lens.depth_at(562)
        body.plate(
            [
                (-14, joint, z - 0.01),
                (14, joint, z - 0.01),
                (14, joint, z + 0.01),
                (-14, joint, z + 0.01),
            ],
            "paving-joints",
            UP,
        )
        for x0, x1 in (
            (100, 96),
            (260, 258),
            (420, 420),
            (580, 582),
            (740, 744),
            (900, 906),
            (1060, 1068),
            (1220, 1230),
        ):
            a, b = lens.floor(x0, 518), lens.floor(x1, 604)
            body.plate(
                [
                    (a.x - 0.01, joint, a.z),
                    (a.x + 0.01, joint, a.z),
                    (b.x + 0.01, joint, b.z),
                    (b.x - 0.01, joint, b.z),
                ],
                "paving-joints",
                UP,
            )
        body.finish("street")

    # --- The music shop. -----------------------------------------------------------------------

    def music_shop(self) -> None:
        """The music shop's stucco front, its cornice, and its green shopfront: the fascia with
        its name, the frame round it, and the lit window with three guitars in it."""
        room, lens, wall, body = self.room, self.lens, self.wall, self.buildings
        body.hull(lens.box(ROW_LEFT, -200, 620 - ROW_LEFT, 718, wall, BUILDING_DEPTH), "stucco")
        self.front(
            rect(ROW_LEFT - 6, 160, 620 - ROW_LEFT + 6, 12), 0.08, 0.08 + BUILDING_DEPTH, "cornice"
        )
        self.front(rect(170, 180, 430, 338), 0.05, 0.05, "shopfront")
        for points in border(170, 180, 430, 338, 4):
            self.front(points, 0.06, 0.01, "frame")
        self.front(rect(180, 190, 410, 44), 0.1, 0.05, "fascia")
        room.sign(
            "shop-name",
            "MUSIC SHOP",
            "sign-gold",
            20 * lens.metres(wall),
            tuple(lens.at(385, 213, wall + 0.102)),
            spacing=1.5,
        )
        self.front(rect(196, 262, 200, 200), 0.052, 0.01, "window-glow")
        for x, y, w, h in (
            (192, 258, 208, 5),
            (192, 459, 208, 5),
            (192, 258, 5, 206),
            (395, 258, 5, 206),
        ):
            self.front(rect(x, y, w, h), 0.07, 0.02, "frame")
        self.front(rect(188, 462, 216, 8), 0.1, 0.06, "sill")
        for cx, top in ((231, 300), (281, 290), (331, 305)):
            self.guitar(cx, top, 420)
        # A card in the window's corner: strings for sale.
        self.front(rect(346, 432, 44, 22), 0.064, 0.004, "card")
        room.sign(
            "shop-strings",
            "STRINGS",
            "poster-red",
            9 * lens.metres(wall),
            tuple(lens.at(368, 443, wall + 0.066)),
            spacing=1.1,
        )

    def guitar(self, cx: float, top: float, bottom: float) -> None:
        """A guitar hanging in the shop window, head up, between pixel rows `top` and `bottom`."""
        z = self.wall + 0.06
        length = bottom - top
        neck = top + 0.12 * length
        waist = top + 0.62 * length
        self.front(rect(cx - 5, top, 10, 0.12 * length), 0.06, 0.004, "fretboard")
        self.front(rect(cx - 3, neck, 6, waist - neck), 0.06, 0.004, "fretboard")
        lower, upper = 0.24 * length, 0.17 * length
        for cy, r in ((bottom - lower / 1.2, lower / 1.2), (waist - upper / 2.4, upper / 1.6)):
            self.buildings.hull(
                self.lens.outline(ellipse(cx, cy, r * 0.75, r, sides=10), z - 0.002, 0.006),
                "guitar",
            )
        self.buildings.hull(
            self.lens.outline(
                ellipse(cx, bottom - lower / 1.2 - 0.25 * lower, 3, 3, sides=6), z + 0.001, 0.002
            ),
            "fretboard",
        )

    def shop_door(self) -> None:
        """`hit_shop`: the music shop's door, its lit glass, its handle and its step."""
        lens, wall = self.lens, self.wall
        door = self.room.body()
        door.hull(lens.box(436, 258, 128, 260, wall + 0.08, 0.03), "frame")
        door.hull(lens.box(440, 262, 120, 256, wall + 0.1, 0.02), "door")
        door.hull(lens.box(456, 280, 88, 110, wall + 0.104, 0.004), "door-glass")
        for x, y, w, h in (
            (456, 280, 88, 4),
            (456, 386, 88, 4),
            (456, 280, 4, 110),
            (540, 280, 4, 110),
            (498, 280, 4, 110),
        ):
            door.hull(lens.box(x, y, w, h, wall + 0.108, 0.006), "door")
        door.hull(lens.box(456, 404, 88, 96, wall + 0.104, 0.004), "fascia")
        door.hull(lens.box(530, 400, 6, 34, wall + 0.12, 0.02), "brass")
        # The sign hung inside the glass: OPEN.
        door.hull(lens.box(474, 330, 52, 22, wall + 0.106, 0.002), "card")
        sign = self.room.sign(
            "shop-open",
            "OPEN",
            "poster-red",
            12 * lens.metres(wall),
            tuple(lens.at(500, 341, wall + 0.108)),
            spacing=1.3,
        )
        for a, b in ((478, 498), (522, 502)):
            door.hull(
                limb(
                    tuple(lens.at(a, 330, wall + 0.106)),
                    tuple(lens.at(b, 300, wall + 0.106)),
                    0.002,
                    0.002,
                    4,
                ),
                "frame",
            )
        step = lens.at(430, 518, wall)
        end = lens.at(570, 518, wall)
        door.hull(box((step.x, 0, wall), (end.x, 0.05, wall + 0.16)), "step")
        self.room.hotspot("shop", door.finish("shop-door"), sign)

    # --- The house next door: the Song Master's flat. -----------------------------------------

    def house(self) -> None:
        """The brick house: its mortar courses, its cornice, a drainpipe, and its two lit
        upstairs windows, the Song Master's stooped shadow at one."""
        lens, wall, body = self.lens, self.wall, self.buildings
        body.hull(lens.box(620, -200, ROW_RIGHT - 620, 718, wall, BUILDING_DEPTH), "brick")
        for row in range(64, 449, 64):
            self.front(rect(620, row - 1, ROW_RIGHT - 620, 2), 0.004, 0.01, "mortar")
        for x, row in ((640, 96), (900, 224), (700, 256), (980, 352), (640, 416), (930, 480)):
            self.front(rect(x, row, 34, 14), 0.004, 0.01, "mortar")
        self.front(rect(616, -20, ROW_RIGHT - 612, 14), 0.1, 0.1 + BUILDING_DEPTH, "cornice")
        self.front(rect(1006, -20, 10, 538), 0.08, 0.06, "drainpipe")
        for x in (660, 860):
            self.front(rect(x - 6, 34, 102, 132), 0.02, 0.03, "window-frame")
            self.front(rect(x, 40, 90, 120), 0.024, 0.01, "window-glow")
            self.front(rect(x, 96, 90, 5), 0.03, 0.01, "window-frame")
            self.front(rect(x + 43, 40, 4, 120), 0.03, 0.01, "window-frame")
            for curtain in (x, x + 74):
                self.front(rect(curtain, 40, 16, 120), 0.027, 0.01, "curtain")
            self.front(rect(x - 12, 164, 114, 9), 0.08, 0.1, "sill")
        # The Song Master at his window: a stooped old rat, his baton up.
        z = 0.026
        self.front(ellipse(902, 138, 20, 22), z, 0.003, "silhouette")
        self.front(ellipse(893, 112, 13, 11, turn=-20), z, 0.003, "silhouette")
        self.front([(880, 112), (870, 120), (884, 118)], z, 0.003, "silhouette")
        for ear in (ellipse(888, 99, 6, 7), ellipse(902, 101, 6, 7)):
            self.front(ear, z, 0.003, "silhouette")
        self.front([(914, 140), (936, 108), (939, 110), (918, 144)], z, 0.003, "silhouette")
        self.front([(936, 108), (946, 82), (948, 83), (939, 110)], z, 0.003, "silhouette")

    def flat_door(self) -> None:
        """`hit_flat-door`: the Song Master's green door, its panels, letterbox and knob, under
        its stone lintel, on its step."""
        lens, wall = self.lens, self.wall
        door = self.room.body()
        door.hull(lens.box(692, 278, 128, 12, wall + 0.06, 0.06), "lintel")
        door.hull(lens.box(696, 290, 120, 228, wall + 0.04, 0.04), "frame")
        door.hull(lens.box(700, 294, 112, 224, wall + 0.06, 0.03), "green-door")
        for y, h in ((308, 86), (408, 96)):
            for x in (712, 760):
                door.hull(lens.box(x, y, 40, h, wall + 0.065, 0.005), "door-panel")
                door.hull(lens.box(x + 5, y + 5, 30, h - 10, wall + 0.068, 0.003), "green-door")
        door.hull(lens.box(736, 398, 40, 7, wall + 0.068, 0.006), "brass")
        door.hull(lens.outline(ellipse(800, 412, 4, 4, sides=8), wall + 0.08, 0.02), "brass")
        step = lens.at(688, 518, wall)
        end = lens.at(824, 518, wall)
        door.hull(box((step.x, 0, wall), (end.x, 0.05, wall + 0.14)), "step")
        self.room.hotspot("flat-door", door.finish("flat-door"))

    def intercom(self) -> None:
        """`hit_intercom`: the brass buzzer by the door, its grille, its button and S.M. on it."""
        lens, wall = self.lens, self.wall
        buzzer = self.room.body()
        buzzer.hull(lens.box(838, 380, 30, 46, wall + 0.04, 0.04), "intercom")
        buzzer.hull(lens.box(864, 380, 4, 46, wall + 0.042, 0.04), "intercom-shade")
        for row in (384, 388):
            buzzer.hull(lens.box(844, row, 18, 2, wall + 0.042, 0.002), "button")
        buzzer.hull(lens.outline(ellipse(853, 398, 4.5, 4.5, sides=8), wall + 0.05, 0.01), "button")
        initials = self.room.sign(
            "intercom-initials",
            "S.M.",
            "button",
            7 * lens.metres(wall),
            tuple(lens.at(853, 415, wall + 0.042)),
            spacing=1.1,
        )
        self.room.hotspot("intercom", buzzer.finish("intercom"), initials)

    # --- The side streets and the city beyond, in the depth ramp. ------------------------------

    def side_streets(self) -> None:
        """The side streets either side of the row, running back from the High Street: the
        pavement along the row's end, the road, and the terrace across it; the city's towers
        through them; and the dusk sky in flat bands. Every block is a far set piece, lighter
        and bluer with distance."""
        room, lens, wall = self.room, self.lens, self.wall
        ground = room.body()
        city = room.body()
        road = -KERB
        for column, side in ((ROW_LEFT, -1), (ROW_RIGHT, 1)):
            corner = lens.at(column, 518, wall).x
            kerb = corner + side * SIDE_PAVEMENT
            across = kerb + side * SIDE_ROAD
            ground.plate(
                [(corner, 0, wall), (kerb, 0, wall), (kerb, 0, SIDE_END), (corner, 0, SIDE_END)],
                "pavement",
                UP,
            )
            ground.hull(box((kerb - side * 0.09, road, SIDE_END), (kerb, 0.004, wall)), "kerb")
            ground.plate(
                [
                    (kerb, road, wall),
                    (across, road, wall),
                    (across, road, SIDE_END),
                    (kerb, road, SIDE_END),
                ],
                "road",
                UP,
            )
            ground.hull(box((across, road, SIDE_END), (across + side * 0.6, 0, wall)), "kerb")
            face = across + side * 0.6
            front = wall
            for back, height in TERRACE:
                room.far(city, box((face, road, back), (face + side * 8, height, front)))
                front = back
            room.far(
                city, box((corner - side * 0.5, road, SIDE_END - 8), (face + side * 8, 6, SIDE_END))
            )
        ground.finish("side-streets")
        for x, w, z, height in TOWERS:
            left, right = lens.at(x, 0, z).x, lens.at(x + w, 0, z).x
            room.far(city, box((left, road, z - 8), (right, height, z)))
        city.finish("city")
        sky = room.body()
        for part, top, bottom in (("dusk", -200, 60), ("haze", 60, 150), ("horizon", 150, 500)):
            sky.hull(lens.box(-400, top, 2100, bottom - top, -300, 1), part)
        sky.finish("sky")


main()
