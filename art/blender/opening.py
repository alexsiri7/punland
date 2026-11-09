"""The opening room: the street outside The Three Crows, the big leaning Victorian corner pub
where the bus drops the cat off. docs/design/STYLE.md, board 3 (docs/design/canvas/Pub.dc.html),
is the reference, and its SVG, docs/design/rooms/opening.svg, the layout: the green shopfront
with its lit arched windows, the door, the fascia, the chalkboard and the High Street sign on the
pavement, the steps down to The Holding Pen, the lamp post, and the side street running back
past the pub's corner to the city.

    blender -b --factory-startup --python art/blender/opening.py -- \\
        --out frontend/public/models/scenes/opening.glb \\
        [--previews docs/screenshots/blender/opening]

Built from scratch every run, in glTF axes, metres. Front-on things are placed in the reference
art's scene pixels through `cam_main` (lib/scene.py), the side street's in metres along it.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import Body, disc, limb
from lib.export import arguments, empty_scene, export_glb
from lib.scene import FRONT, UP, Room, Wall, box

# STYLE.md's palette, and the reference art's own tones for the pub and its signs.
COLOURS = {
    "pavement": "#5E5A62",
    "kerb": "#4A464E",
    "road": "#2F2D35",
    "road-marking": "#8A8478",
    "facade": "#8A7558",
    "brick-marks": "#74644C",
    "cornice": "#A89F8E",
    "shopfront": "#23382F",
    "fascia": "#1A2822",
    "pilaster": "#1A2822",
    "door": "#1A2822",
    "door-surround": "#142019",
    "door-step": "#4A464E",
    "brass": "#C9A86A",
    "sign-gold": "#E3C58A",
    "window-glow": "#E8B566",
    "lamp-amber": "#C99A54",
    "window-frame": "#C9C0AE",
    "sill": "#A89F8E",
    "dark-pane": "#2E3A52",
    "patrons": "#8A5A34",
    "shelf": "#6E4628",
    "bulbs": "#FFE3A0",
    "wire": "#1A1820",
    "iron": "#16161A",
    "board": "#1E1E1E",
    "easel": "#4A3A30",
    "chalk": "#E8E4DC",
    "small-print": "#CFC9BE",
    "stairwell": "#141218",
    "lamp-post": "#1E1E24",
    "poster-red": "#C8483B",
    "flyer-paper": "#D9CDB4",
    "spray-teal": "#5FA39A",
    "brick": "#6E4038",
    "dark-window": "#3A2A2A",
    "side-wall": "#3E3A44",
    "shutter": "#5E5A62",
    "shutter-slats": "#4A464E",
    "awning": "#2A2830",
    "dusk": "#2E3A52",
    "haze": "#6E6478",
    "horizon": "#C98A6C",
}

#: The pub's height to its cornice, and the right end of its front, past the edge of the view.
PUB_TOP = 7.5
PUB_RIGHT = 5.0
#: The side street runs back past the corner, turned to the left (its vanishing point in the art).
SIDE = (-0.29, -0.957)
#: Across the side street, out from the pub's side wall: its pavement, road and far pavement.
SIDE_PAVEMENT, SIDE_ROAD, SIDE_WIDTH = 1.0, 2.9, 3.6
KERB = 0.12
LEAN = math.tan(math.radians(2.5))


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    room = Room("opening", COLOURS)
    street = Street(room)
    street.ground()
    street.pub_front()
    street.door()
    street.corner()
    street.side_street()
    street.city()
    street.board()
    street.signpost()
    street.holding_pen()
    street.lamp_post()
    street.lean()
    street.pub.finish("pub")
    street.surroundings.finish("surroundings")
    room.camera()
    export_glb(os.path.abspath(args.out), cameras=True)
    if args.previews:
        room.previews(os.path.abspath(args.previews))


class Street:
    """The room's set pieces, built into a few meshes: the pub, which leans, what stands around
    it, the street, the city, the sky, and the hotspots on their own."""

    def __init__(self, room: Room):
        self.room = room
        self.lens = room.lens
        self.wall = self.lens.depth_at(518)
        #: The pub's corner: its front's left end, the chamfer and the side wall's front end.
        self.corner_a = (self.lens.at(480, 518, self.wall).x, self.wall)
        chamfer = 0.5 / math.sqrt(2)
        self.corner_b = (self.corner_a[0] - chamfer, self.wall - chamfer)
        self.chamfer = Wall((self.corner_a[0], 0, self.corner_a[1]), (-1, -1))
        self.side = Wall((self.corner_b[0], 0, self.corner_b[1]), SIDE)
        #: The fascia's bottom and top, round the pub.
        self.fascia = (self.y(182), self.y(132))
        self.pub = room.body()
        #: The neighbours and what stands on the pavement: everything that doesn't lean.
        self.surroundings = room.body()

    # --- Helpers in the reference art's pixels. ------------------------------------------------

    def y(self, row: float) -> float:
        """The height at the pub's wall of a pixel row."""
        return self.lens.at(640, row, self.wall).y

    def px(self, points, z: float, depth: float):
        """The pixel outline `points` at depth `z`, `depth` deep behind it."""
        front = [self.lens.at(x, y, z) for x, y in points]
        return [tuple(p) for p in front] + [(p.x, p.y, z - depth) for p in front]

    def metres(self, z: float) -> float:
        """How many metres a pixel spans at depth `z`."""
        return self.lens.at(1, 0, z).x - self.lens.at(0, 0, z).x

    # --- The ground. ---------------------------------------------------------------------------

    def ground(self) -> None:
        room, side = self.room, self.side
        far = 42
        # Where the side street's kerb meets the High Street's.
        kerb = side.point(0, 0, SIDE_PAVEMENT)
        t = (FRONT - kerb[2]) / side.along.z
        kerb_front = (kerb[0] + t * side.along.x, FRONT)
        room.floor(
            [
                (PUB_RIGHT + 2, FRONT),
                (PUB_RIGHT + 2, self.wall - 0.3),
                self.corner_a,
                self.corner_b,
                xz(side.point(far, 0)),
                xz(side.point(far, 0, SIDE_PAVEMENT)),
                kerb_front,
            ],
            "pavement",
        )
        body = room.body()
        road = -KERB
        body.plate(
            [
                (-30, road, 6),
                (30, road, 6),
                (30, road, FRONT),
                (kerb_front[0], road, FRONT),
                level(side.point(far, 0, SIDE_PAVEMENT), road),
                level(side.point(far, 0, SIDE_ROAD), road),
                level(side.point(-2, 0, SIDE_ROAD), road),
                (-30, road, side.point(-2, 0, SIDE_ROAD)[2]),
            ],
            "road",
            UP,
        )
        # The kerbs, a little proud of the pavement so their stone reads as a strip.
        body.hull(box((kerb_front[0], road, FRONT - 0.09), (PUB_RIGHT + 2, 0.004, FRONT)), "kerb")
        body.hull(side.box((t, far), (road, 0.004), (SIDE_PAVEMENT - 0.09, SIDE_PAVEMENT)), "kerb")
        # The far pavement across the side street is kerb stone all the way (the art's tone).
        body.hull(side.box((-2, far), (road, 0.0), (SIDE_ROAD, SIDE_WIDTH)), "kerb")
        # The road's centre line, under the front of the view.
        for x in (460, 700, 940, 1180):
            a = self.lens.on(x, 626, (0, road, 0), UP)
            b = self.lens.on(x + 80, 630, (0, road, 0), UP)
            body.plate(
                [
                    (a.x, road + 0.002, b.z),
                    (b.x, road + 0.002, b.z),
                    (b.x, road + 0.002, a.z),
                    (a.x, road + 0.002, a.z),
                ],
                "road-marking",
                UP,
            )
        body.finish("street")

    # --- The pub's front on the High Street. -------------------------------------------------

    def pub_front(self) -> None:
        lens, pub, wall, left = self.lens, self.pub, self.wall, self.corner_a[0]
        fascia_low, fascia_high = self.fascia
        pub.hull(box((left, 0, wall - 0.4), (PUB_RIGHT, fascia_low, wall)), "shopfront")
        pub.hull(box((left, fascia_low, wall - 0.4), (PUB_RIGHT, PUB_TOP, wall)), "facade")
        pub.hull(
            box((left - 0.05, PUB_TOP, wall - 0.5), (PUB_RIGHT, PUB_TOP + 0.25, wall + 0.12)),
            "cornice",
        )
        pub.hull(box((left, 0, wall), (PUB_RIGHT, self.y(470), wall + 0.03)), "fascia")
        pub.hull(box((left, fascia_low, wall), (PUB_RIGHT, fascia_high, wall + 0.12)), "fascia")
        for row in (140, 172):
            pub.hull(lens.box(486, row, 790, 2, wall + 0.124, 0.01), "sign-gold")
        for x0, x1 in ((480, 500), (612, 638), (776, 802), (958, 988), (1148, 1180)):
            pub.hull(lens.box(x0, 182, x1 - x0, 336, wall + 0.06, 0.07), "pilaster")
        self.room.sign(
            "pub-name",
            "THE THREE CROWS",
            "sign-gold",
            22 * self.metres(wall),
            tuple(lens.at(880, 157, wall + 0.122)),
            spacing=2.2,
        )
        windows = ((502, 608, 250), (806, 954, 248), (994, 1144, 250), (1186, 1300, 252))
        for x0, x1, top in windows:
            pub.hull(
                self.px(arch(x0, top, x1 - x0, 470 - top, 48), wall + 0.006, 0.01), "window-glow"
            )
        bars = ((538, 572), (856, 906), (1044, 1094), (1236,))
        for (x0, x1, top), xs in zip(windows, bars, strict=True):
            pub.hull(lens.box(x0, 334, x1 - x0, 3, wall + 0.014, 0.004), "pilaster")
            for x in xs:
                pub.hull(
                    lens.box(x - 1.5, top + 8, 3, 470 - top - 8, wall + 0.014, 0.004), "pilaster"
                )
        self.patrons()
        self.string_lights()
        for i, x in enumerate((512, 682, 862, 1042, 1212)):
            self.sash(x, lit=i % 2 == 1)
        for x, y in ((620, 40), (640, 90), (800, 60), (990, 30), (1170, 80), (520, 118)):
            pub.hull(lens.box(x, y, 22, 7, wall + 0.004, 0.01), "brick-marks")

    def sash(self, x: float, lit: bool) -> None:
        """An upstairs sash window over the fascia, its sill under it."""
        lens, pub, wall = self.lens, self.pub, self.wall
        pub.hull(lens.box(x, -70, 96, 180, wall + 0.02, 0.03), "window-frame")
        pane = "window-glow" if lit else "dark-pane"
        pub.hull(lens.box(x + 8, -62, 80, 164, wall + 0.024, 0.01), pane)
        if lit:
            for curtain in (x + 8, x + 72):
                pub.hull(lens.box(curtain, -62, 16, 164, wall + 0.027, 0.01), "lamp-amber")
        pub.hull(lens.box(x + 8, 52, 80, 4, wall + 0.03, 0.01), "window-frame")
        pub.hull(lens.box(x - 8, 110, 112, 9, wall + 0.08, 0.1), "sill")

    def patrons(self) -> None:
        """The crowd inside, as silhouettes on the lit windows: a bar, a fox with a pint, a
        rabbit, a dog, a cactus and a microphone stand."""
        pub, z = self.pub, self.wall + 0.01

        def shape(points, part="patrons"):
            pub.hull(self.px(points, z, 0.003), part)

        def head(cx, cy, rx, ry, ears=()):
            shape(ellipse(cx, cy, rx, ry))
            for ear in ears:
                shape(ear)

        shape(rect(502, 436, 106, 8), "shelf")
        shape(rect(584, 420, 10, 16), "lamp-amber")
        shape(ellipse(530, 425, 18, 26))
        head(552, 326, 10, 7)
        shape([(538, 404), (530, 370), (548, 330), (552, 334), (538, 372), (544, 404)])
        shape(rect(836, 420, 44, 50))
        shape(ellipse(858, 420, 22, 26))
        head(
            860,
            378,
            17,
            20,
            ([(842, 380), (846, 352), (856, 368)], [(864, 368), (876, 352), (878, 380)]),
        )
        shape([(872, 382), (894, 390), (874, 394)])
        shape(rect(880, 418, 60, 6), "shelf")
        shape(rect(906, 424, 6, 46), "shelf")
        shape(rect(892, 406, 8, 12), "lamp-amber")
        shape(rect(922, 400, 30, 70))
        head(937, 372, 14, 16, (ellipse(937, 346, 5, 12),))
        shape(ellipse(922, 356, 12, 5, turn=-35))
        shape(ellipse(952, 356, 12, 5, turn=35))
        shape(rect(1010, 420, 40, 50))
        shape(ellipse(1030, 422, 20, 24))
        head(
            1030,
            380,
            14,
            16,
            (ellipse(1022, 344, 5, 20, turn=-8), ellipse(1038, 344, 5, 20, turn=10)),
        )
        shape(rect(1100, 360, 22, 110))
        shape(ellipse(1111, 362, 11, 10))
        shape(rect(1084, 380, 8, 30))
        shape(rect(1084, 404, 18, 8))
        shape(rect(1130, 368, 8, 30))
        shape(rect(1120, 392, 18, 8))
        shape(rect(1230, 300, 4, 170))
        shape(ellipse(1232, 298, 7, 9))

    def string_lights(self) -> None:
        """Festoon bulbs swagged along under the fascia."""
        lens, pub, z = self.lens, self.pub, self.wall + 0.075
        for x in range(480, 1280, 80):
            swag = [
                lens.at(x + dx, 200 + 14 * math.sin(math.pi * dx / 80), z)
                for dx in range(0, 81, 20)
            ]
            for a, b in zip(swag, swag[1:], strict=False):
                pub.hull(limb(tuple(a), tuple(b), 0.005, 0.005, 4), "wire")
            bulb(pub, tuple(lens.at(x + 40, 210, z)), 0.034)
            bulb(pub, tuple(lens.at(x + 80, 203, z)), 0.024)

    def door(self) -> None:
        """The pub door, recessed under its fanlight: the hotspot `hit_door`."""
        lens, wall = self.lens, self.wall
        door = self.room.body()
        door.hull(
            self.px([(634, 520), (636, 214), (774, 208), (776, 520)], wall + 0.035, 0.03),
            "door-surround",
        )
        door.hull(self.px(fan(644, 704, 766, 262, 46), wall + 0.04, 0.005), "window-glow")
        for points in (
            [(703, 216), (705, 216), (705, 262), (703, 262)],
            [(674, 226), (677, 225), (690, 262), (687, 262)],
            [(734, 224), (731, 225), (720, 262), (723, 262)],
        ):
            door.hull(self.px(points, wall + 0.045, 0.004), "door-surround")
        for x0, x1 in ((644, 702), (708, 766)):
            door.hull(lens.box(x0, 268, x1 - x0, 244, wall + 0.05, 0.02), "door")
            door.hull(lens.box(x0 + 8, 278, x1 - x0 - 16, 104, wall + 0.054, 0.005), "window-glow")
            door.hull(
                lens.box(x0 + 10, 400, x1 - x0 - 20, 100 if x0 == 644 else 50, wall + 0.054, 0.004),
                "door-surround",
            )
        for x in (696, 710):
            door.hull(lens.box(x, 400, 4, 24, wall + 0.065, 0.015), "brass")
        self.room.hotspot("door", door.finish("door"))
        self.surroundings.hull(
            box(
                (lens.at(626, 518, wall).x, 0, wall), (lens.at(784, 518, wall).x, 0.05, wall + 0.14)
            ),
            "door-step",
        )

    def corner(self) -> None:
        """The chamfered corner, with its own arched window, and the pub's sign hanging off it."""
        pub, chamfer = self.pub, self.chamfer
        width = 0.5
        fascia_low, fascia_high = self.fascia
        pub.hull(chamfer.box((0, width), (0, fascia_low), (-0.4, 0)), "shopfront")
        pub.hull(chamfer.box((0, width), (fascia_low, PUB_TOP), (-0.4, 0)), "facade")
        pub.hull(chamfer.box((-0.05, width + 0.05), (fascia_low, fascia_high), (0, 0.12)), "fascia")
        pub.hull(chamfer.box((0, width), (0, self.y(470)), (0, 0.03)), "fascia")
        pub.hull(
            [
                chamfer.point(s, y, out)
                for s, y in arch_m(0.1, width - 0.1, self.y(470), self.y(258), 0.12)
                for out in (0.005, 0.015)
            ],
            "lamp-amber",
        )
        pub.hull(chamfer.box((0.08, width - 0.08), (2.95, 3.55), (0.005, 0.02)), "window-glow")
        pub.hull(
            chamfer.box((-0.05, width + 0.05), (PUB_TOP, PUB_TOP + 0.25), (-0.5, 0.12)), "cornice"
        )
        self.hanging_sign()

    def hanging_sign(self) -> None:
        """The pub sign on its iron bracket out of the corner: three crows over the name, and two
        iron crows perched on the bracket."""
        pub, chamfer = self.pub, self.chamfer
        root, tip = chamfer.point(0.25, 3.35, 0), chamfer.point(0.25, 3.35, 0.95)
        pub.hull(limb(root, tip, 0.016, 0.016, 4), "iron")
        stay = (chamfer.point(0.25, 3.0, 0), chamfer.point(0.25, 3.33, 0.6))
        pub.hull(limb(*stay, 0.008, 0.008, 4), "iron")

        def along(t, y):
            return (root[0] + t * (tip[0] - root[0]), y, root[2] + t * (tip[2] - root[2]))

        for t in (0.3, 0.7):
            pub.hull(limb(along(t, 3.35), along(t, 3.25), 0.004, 0.004, 4), "iron")
        crow(pub, along(0.15, 3.38), 0.13, 1, "iron")
        crow(pub, along(0.75, 3.38), 0.13, -1, "iron")
        # The board hangs from its top edge's middle, turned a little.
        hang, tilt = along(0.5, 3.25), -3

        def on_board(points):
            return rotated(points, tilt, hang)

        pub.hull(on_board(box((-0.25, -0.5, -0.02), (0.25, 0, 0.02))), "fascia")
        pub.hull(on_board(box((-0.22, -0.47, 0.02), (0.22, -0.03, 0.023))), "sign-gold")
        pub.hull(on_board(box((-0.21, -0.46, 0.02), (0.21, -0.04, 0.026))), "fascia")
        for i, dx in enumerate((-0.12, 0.0, 0.12)):
            at = rotated_point((dx, -0.24 + 0.01 * (i % 2), 0.03), tilt, hang)
            crow(pub, at, 0.07, 1 if i < 2 else -1, "sign-gold")
        pub.hull(on_board(box((-0.18, -0.29, 0.026), (0.18, -0.275, 0.03))), "patrons")
        self.room.sign(
            "pub-sign",
            "THE THREE CROWS",
            "sign-gold",
            0.035,
            rotated_point((0, -0.4, 0.03), tilt, hang),
            turn=(0, 0, tilt),
            spacing=1.3,
        )

    def lean(self) -> None:
        """The pub's upper storeys lean a little to the right over its shopfront."""
        base = self.fascia[1]
        for vert in self.pub.bm.verts:
            # Blender's axes: its z is glTF's y.
            vert.co.x += LEAN * max(0.0, vert.co.z - base)

    # --- The side street. ----------------------------------------------------------------------

    def side_street(self) -> None:
        """The pub's side wall down the side street, the brick terrace past it, the dark wall
        across the street with its shutter, posters and graffiti, and festoons over it."""
        pub, side = self.pub, self.side
        length = 16
        fascia_low, fascia_high = self.fascia
        pub.hull(side.box((0, length), (0, fascia_low), (-0.4, 0)), "shopfront")
        pub.hull(side.box((0, length), (fascia_low, PUB_TOP), (-0.4, 0)), "facade")
        pub.hull(side.box((-0.05, length), (fascia_low, fascia_high), (0, 0.12)), "fascia")
        pub.hull(side.box((0, length), (0, 0.35), (0, 0.03)), "fascia")
        pub.hull(side.box((-0.05, length), (PUB_TOP, PUB_TOP + 0.25), (-0.5, 0.12)), "cornice")
        pub.hull(
            side.box((0.2, length), (fascia_low + 0.06, fascia_low + 0.07), (0.12, 0.125)),
            "sign-gold",
        )
        for start in range(0, length - 2, 4):
            s = start + 0.6
            pub.hull(
                [
                    side.point(a, b, out)
                    for a, b in arch_m(s, s + 1.6, 0.45, 1.95, 0.35)
                    for out in (0.005, 0.015)
                ],
                "window-glow",
            )
            pub.hull(side.box((s + 0.78, s + 0.82), (0.45, 1.9), (0.015, 0.02)), "pilaster")
        cat = 1.3
        pub.hull(
            [
                side.point(a, b, out)
                for a, b in ellipse_m(cat, 0.85, 0.16, 0.32)
                for out in (0.016, 0.02)
            ],
            "patrons",
        )
        pub.hull(
            [
                side.point(a, b, out)
                for a, b in ellipse_m(cat, 1.28, 0.1, 0.1)
                for out in (0.016, 0.02)
            ],
            "patrons",
        )
        for ear in (-1, 1):
            pub.hull(
                [
                    side.point(cat + ear * a, b, out)
                    for a, b in ((0.03, 1.33), (0.1, 1.33), (0.08, 1.48))
                    for out in (0.016, 0.02)
                ],
                "patrons",
            )
        for floor, top in ((0, 3.0), (1, 5.2)):
            for i, s in enumerate((0.5, 2.5, 4.5, 6.5, 8.5, 10.5, 12.5)):
                lit = (i + floor) % 3 == 1
                pub.hull(side.box((s, s + 0.7), (top, top + 1.3), (0, 0.03)), "window-frame")
                pub.hull(
                    side.box((s + 0.06, s + 0.64), (top + 0.06, top + 1.24), (0.03, 0.035)),
                    "window-glow" if lit else "dark-pane",
                )
                pub.hull(side.box((s - 0.06, s + 0.76), (top - 0.08, top), (0, 0.08)), "sill")
        self.terrace(length)
        self.across()
        self.festoons()

    def terrace(self, start: float) -> None:
        """The brick terrace past the pub, down the side street, its windows dark but one."""
        body, side = self.surroundings, self.side
        for i, (length, height) in enumerate(((6, 9.5), (5, 8.0))):
            body.hull(side.box((start, start + length), (0, height), (-0.4, 0.15 * i)), "brick")
            for floor in range(int(height // 2.4)):
                for s in range(1, int(length) - 1, 2):
                    lit = (i, floor, s) == (0, 1, 3)
                    body.hull(
                        side.box(
                            (start + s, start + s + 0.8),
                            (0.8 + 2.4 * floor, 2.0 + 2.4 * floor),
                            (0.15 * i, 0.15 * i + 0.02),
                        ),
                        "window-glow" if lit else "dark-window",
                    )
            start += length

    def across(self) -> None:
        """The dark building across the side street, its face in shade, seen end on."""
        body, side = self.surroundings, self.side
        wall = Wall(side.point(26, 0, SIDE_WIDTH), (-SIDE[0], -SIDE[1]))
        length = 24
        body.hull(wall.box((0, length), (0, 10), (-0.5, 0)), "side-wall")
        body.hull(wall.box((length - 0.4, length), (0, 10), (-1.8, 0)), "side-wall")
        # The shutter and its awning, the posters, the graffiti, then the windows above.
        body.hull(wall.box((21.0, 23.6), (0, 2.1), (0, 0.03)), "shutter")
        for k in range(8):
            body.hull(
                wall.box((21.0, 23.6), (0.2 + 0.24 * k, 0.215 + 0.24 * k), (0.03, 0.035)),
                "shutter-slats",
            )
        body.hull(wall.box((20.9, 23.7), (2.1, 2.35), (0, 0.4)), "awning")
        for s, y, colour in (
            (22.2, 0.8, "spray-teal"),
            (22.6, 1.2, "spray-teal"),
            (21.6, 1.1, "poster-red"),
        ):
            for k in range(4):
                a = (s + 0.18 * k, y + 0.14 * math.sin(k * 1.7))
                b = (s + 0.18 * (k + 1), y + 0.14 * math.sin((k + 1) * 1.7))
                body.hull(
                    [
                        wall.point(p, q + dy, out)
                        for p, q in (a, b)
                        for dy in (-0.025, 0.025)
                        for out in (0.036, 0.04)
                    ],
                    colour,
                )
        body.hull(wall.box((19.8, 20.3), (1.2, 1.9), (0, 0.01)), "poster-red")
        body.hull(wall.box((19.0, 19.4), (1.3, 1.85), (0, 0.01)), "flyer-paper")
        for floor in range(3):
            for i, s in enumerate((1.0, 4.0, 7.0, 10.0, 13.0, 16.0, 19.5, 22.5)):
                lit = (i + floor) % 4 == 1
                y = 3.0 + 2.5 * floor
                body.hull(
                    wall.box((s, s + 1.0), (y, y + 1.5), (0, 0.02)),
                    "window-glow" if lit else "awning",
                )
                if lit:
                    body.hull(wall.box((s, s + 0.2), (y, y + 1.5), (0.02, 0.025)), "lamp-amber")
        body.hull(wall.box((20.6, 24.0), (3.4, 3.45), (0, 0.6)), "wire")
        for k in range(8):
            s = 20.7 + 0.45 * k
            body.hull(wall.box((s, s + 0.03), (2.9, 3.45), (0.55, 0.58)), "wire")

    def festoons(self) -> None:
        """Two strings of bulbs across the side street, from the pub to the wall across."""
        body, side = self.surroundings, self.side
        for s, sag in ((3.5, 0.5), (9.0, 0.35)):
            a = side.point(s, 3.3, 0)
            b = side.point(s + 2.5, 3.6, SIDE_WIDTH)
            points = []
            for k in range(9):
                t = k / 8
                p = [a[i] + t * (b[i] - a[i]) for i in range(3)]
                p[1] -= sag * 4 * t * (1 - t)
                points.append(tuple(p))
            for p, q in zip(points, points[1:], strict=False):
                body.hull(limb(p, q, 0.006, 0.006, 4), "wire")
            for p in points[1:-1:2]:
                bulb(body, (p[0], p[1] - 0.04, p[2]), 0.04)

    # --- The city beyond, in the depth ramp. -------------------------------------------------

    def city(self) -> None:
        """Blocks closing the side street, the radio tower and the far towers, each layer
        lighter and bluer with distance, and the dusk sky behind them in flat bands."""
        room, lens = self.room, self.lens
        city = room.body()
        side = self.side
        # Lower blocks further down the side street, on both sides, and one across its end.
        for s0, s1, height in ((27, 34, 5.5), (34, 40, 4.0)):
            room.far(city, side.box((s0, s1), (-1, height), (-4, 0)))
            room.far(city, side.box((s0 - 1, s1), (-1, height + 0.5), (SIDE_WIDTH, SIDE_WIDTH + 4)))
        room.far(city, side.box((40, 44), (-1, 3.0), (-8, SIDE_WIDTH + 8)))
        tower = lens.at(196, 300, -90)
        top = lens.at(196, 20, -90)
        room.far(city, limb((tower.x, -2, tower.z), tuple(top), 0.5, 0.3, 6))
        for row, radius in ((34, 1.6), (62, 1.2), (90, 1.5), (116, 1.0)):
            y = lens.at(196, row, -90).y
            room.far(
                city,
                disc((tower.x, y, tower.z), (tower.x, y + 1, tower.z), radius, 10)
                + disc((tower.x, y - 0.5, tower.z), (tower.x, y + 1, tower.z), radius * 0.7, 10),
            )
        for x, y, w, h in (
            (116, 110, 22, 200),
            (152, 72, 26, 240),
            (240, 96, 20, 220),
            (220, 150, 12, 200),
        ):
            room.far(city, lens.box(x, y, w, h, -110, 6))
        sky = room.body()
        for part, top, bottom in (("dusk", -200, 70), ("haze", 70, 135), ("horizon", 135, 500)):
            sky.hull(lens.box(-400, top, 2100, bottom - top, -300, 1), part)
        city.finish("city")
        sky.finish("sky")

    # --- The pavement's props: the hotspots `hit_board` and `hit_street`, and the rest. -------

    def board(self) -> None:
        """The A-board on the pavement: TONIGHT / OPEN MIC / DOWNSTAIRS 9PM. Its front leans
        back from its foot, under the art's outline of it."""
        lens, room = self.lens, self.room
        foot, lean = lens.depth_at(592), 0.12
        height = lens.at(918, 452, foot - lean).y
        bottom = (lens.floor(868, 592).x, lens.floor(968, 592).x)
        top = (lens.at(884, 452, foot - lean).x, lens.at(952, 452, foot - lean).x)
        tilt = math.degrees(math.atan2(lean, height))
        board = room.body()

        def on_front(u, v, out):
            """The point `u` across and `v` up the front, `out` off it."""
            left = bottom[0] + (top[0] - bottom[0]) * v
            right = bottom[1] + (top[1] - bottom[1]) * v
            return (left + (right - left) * u, height * v, foot - lean * v + out)

        def slab(u0, u1, v0, v1, out, part):
            board.hull(
                [on_front(u, v, o) for u in (u0, u1) for v in (v0, v1) for o in (out, out - 0.02)],
                part,
            )

        slab(0, 0.12, 0, 1, 0, "easel")
        slab(0.88, 1, 0, 1, 0, "easel")
        slab(0, 1, 0.94, 1, 0, "easel")
        slab(0.08, 0.92, 0.22, 0.95, 0.008, "board")
        for x in (bottom[0] + 0.03, bottom[1] - 0.03):
            board.hull(
                limb((x, 0, foot - 2 * lean), (x, height, foot - lean), 0.02, 0.02, 4), "easel"
            )
        metres = self.metres(foot)

        def at_row(row):
            """The middle of the board's face at the art's pixel row `row`."""
            return on_front(0.5, (592 - row) / (592 - 452), 0.012)

        signs = [
            room.sign(name, text, part, size * metres, at_row(row), (-tilt, 0, 0), spacing)
            for name, text, part, size, row, spacing in (
                ("board-tonight", "TONIGHT", "chalk", 13, 478, 1.3),
                ("board-open-mic", "OPEN MIC", "sign-gold", 12, 504, 1.2),
                ("board-downstairs", "DOWNSTAIRS 9PM", "chalk", 9, 528, 1.2),
            )
        ]
        board.hull(limb(at_row(540), at_row(551), 0.004, 0.004, 4), "chalk")
        x, y, z = at_row(553)
        arrow = [(x, y, z), (x - 0.025, y + 0.03, z), (x + 0.025, y + 0.03, z)]
        board.hull([*arrow, (x, y + 0.015, z - 0.006)], "chalk")
        room.hotspot("board", board.finish("board"), *signs)

    def signpost(self) -> None:
        """The High Street's wayfinding sign by the corner, pointing down the street: the
        hotspot `hit_street`."""
        lens, room = self.lens, self.room
        post = room.body()
        post.hull(lens.standing(414, 384, 56, 160, 0.14), "fascia")
        front = lens.depth_at(544)
        post.hull(lens.box(418, 392, 48, 36, front + 0.006, 0.01), "sign-gold")
        metres = self.metres(front)
        name = room.sign(
            "street-sign",
            "HIGH ST",
            "fascia",
            12 * metres,
            tuple(lens.at(442, 405, front + 0.008)),
            spacing=1.2,
        )
        a = lens.at(428, 419, front + 0.008)
        b = lens.at(456, 419, front + 0.008)
        post.hull(
            [
                (a.x, a.y, a.z),
                (a.x + 0.03, a.y + 0.02, a.z),
                (a.x + 0.03, a.y - 0.02, a.z),
                (a.x + 0.01, a.y, a.z - 0.004),
            ],
            "fascia",
        )
        post.hull(
            limb((a.x + 0.02, a.y, a.z - 0.002), (b.x, b.y, b.z - 0.002), 0.005, 0.005, 4), "fascia"
        )
        room.hotspot("street", post.finish("signpost"), name)

    def holding_pen(self) -> None:
        """The railings round the steps down to The Holding Pen, and its sign: THE HOLDING PEN,
        LIVE MUSIC BELOW."""
        lens, room, body = self.lens, self.room, self.surroundings
        front = lens.depth_at(536)
        x0, x1 = lens.floor(986, 536).x, lens.floor(1154, 536).x
        height = 0.8
        body.plate(
            [
                (x0, 0.002, front),
                (x1, 0.002, front),
                (x1, 0.002, self.wall),
                (x0, 0.002, self.wall),
            ],
            "stairwell",
            UP,
        )
        for y in (0.08, height - 0.06, height):
            body.hull(box((x0, y - 0.02, front - 0.02), (x1, y, front)), "iron")
            for x in (x0, x1):
                body.hull(box((x - 0.01, y - 0.02, self.wall), (x + 0.01, y, front)), "iron")
        bars = 15
        for k in range(bars):
            x = x0 + (x1 - x0) * k / (bars - 1)
            body.hull(
                box((x - 0.008, 0, front - 0.018), (x + 0.008, height, front - 0.002)), "iron"
            )
            body.hull(
                [
                    (x - 0.018, height, front - 0.01),
                    (x + 0.018, height, front - 0.01),
                    (x, height + 0.06, front - 0.01),
                    (x, height, front - 0.02),
                    (x, height, front),
                ],
                "iron",
            )
        for x in (x0, x1):
            for k in range(1, 4):
                z = front + (self.wall - front) * k / 4
                body.hull(box((x - 0.008, 0, z - 0.008), (x + 0.008, height, z + 0.008)), "iron")
        # The sign on the railings, turned a little.
        hang = ((x0 + x1) / 2, lens.at(1070, 490, front + 0.01).y, front + 0.004)
        body.hull(rotated(box((-0.4, -0.16, 0), (0.4, 0.16, 0.012)), 2, hang), "board")
        body.hull(rotated(box((-0.38, -0.145, 0.012), (0.38, 0.145, 0.014)), 2, hang), "sign-gold")
        body.hull(rotated(box((-0.37, -0.135, 0.012), (0.37, 0.135, 0.016)), 2, hang), "board")
        metres = self.metres(front)
        for name, text, part, size, y, spacing in (
            ("pen-name", "THE HOLDING PEN", "sign-gold", 14, 0.035, 1.2),
            ("pen-below", "LIVE MUSIC BELOW", "small-print", 6.5, -0.085, 1.6),
        ):
            at = rotated_point((0, y, 0.02), 2, hang)
            room.sign(name, text, part, size * metres, at, turn=(0, 0, 2), spacing=spacing)

    def lamp_post(self) -> None:
        """The street lamp at the kerb, a crow on its lantern, posters taped round it."""
        body = self.surroundings
        foot = self.lens.floor(1215, 607)
        x, z = foot.x, foot.z
        body.hull(box((x - 0.08, 0, z - 0.08), (x + 0.08, 0.3, z + 0.08)), "lamp-post")
        body.hull(limb((x, 0.3, z), (x, 2.8, z), 0.045, 0.035, 6), "lamp-post")
        body.hull(
            moved(box((-0.07, 0, -0.012), (0.07, 0.22, 0.012)), (x, 1.62, z + 0.04)),
            "poster-red",
        )
        body.hull(
            moved(box((-0.05, 0, -0.012), (0.05, 0.12, 0.012)), (x, 1.42, z + 0.045)),
            "flyer-paper",
        )
        lantern = 2.8
        body.hull(
            [
                (x + dx, lantern + y, z + dz)
                for y, r in ((0, 0.08), (0.3, 0.12))
                for dx, dz in square(r)
            ],
            "lamp-post",
        )
        body.hull(
            [
                (x + dx, lantern + y, z + dz)
                for y, r in ((0.03, 0.082), (0.28, 0.112))
                for dx, dz in square(r)
            ],
            "bulbs",
        )
        body.hull(
            [(x + dx, lantern + 0.3, z + dz) for dx, dz in square(0.15)] + [(x, lantern + 0.45, z)],
            "lamp-post",
        )
        crow(body, (x, lantern + 0.44, z), 0.2, 1, "iron")


# --- Shapes. -------------------------------------------------------------------------------------


def xz(p) -> tuple[float, float]:
    return (p[0], p[2])


def level(p, y: float):
    return (p[0], y, p[2])


def square(r: float):
    return ((r, r), (-r, r), (-r, -r), (r, -r))


def rect(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def ellipse(cx, cy, rx, ry, turn=0.0, sides=10):
    t = math.radians(turn)
    out = []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        ex, ey = rx * math.cos(a), ry * math.sin(a)
        out.append(
            (cx + ex * math.cos(t) - ey * math.sin(t), cy + ex * math.sin(t) + ey * math.cos(t))
        )
    return out


def ellipse_m(cs, cy, rs, ry, sides=10):
    return [
        (cs + rs * math.cos(2 * math.pi * i / sides), cy + ry * math.sin(2 * math.pi * i / sides))
        for i in range(sides)
    ]


def arch(x, top, width, height, rise, steps=8):
    """A window in pixels: its sides up to `rise` under `top`, then a round head."""
    bottom = top + height
    head = [
        (
            x + width / 2 - width / 2 * math.cos(math.pi * i / steps),
            top + rise - rise * math.sin(math.pi * i / steps),
        )
        for i in range(steps + 1)
    ]
    return [(x, bottom), (x + width, bottom)] + head


def arch_m(s0, s1, y0, y1, rise, steps=8):
    """The same in metres along a wall: (along, up), from y0 at the sill to y1 at the crown."""
    half = (s1 - s0) / 2
    head = [
        (
            (s0 + s1) / 2 - half * math.cos(math.pi * i / steps),
            y1 - rise + rise * math.sin(math.pi * i / steps),
        )
        for i in range(steps + 1)
    ]
    return [(s0, y0), (s1, y0)] + head


def fan(x0, xm, x1, bottom, rise, steps=8):
    """The fanlight over the door: a half ellipse on its sill, in pixels."""
    return [
        (
            xm - (x1 - x0) / 2 * math.cos(math.pi * i / steps),
            bottom - rise * math.sin(math.pi * i / steps),
        )
        for i in range(steps + 1)
    ]


def rotated_point(p, degrees, origin):
    """`p` turned `degrees` about +Z, then moved to `origin`."""
    a = math.radians(degrees)
    x, y, z = p
    return (
        origin[0] + x * math.cos(a) - y * math.sin(a),
        origin[1] + x * math.sin(a) + y * math.cos(a),
        origin[2] + z,
    )


def rotated(points, degrees, origin):
    return [rotated_point(p, degrees, origin) for p in points]


def moved(points, origin):
    return [(origin[0] + x, origin[1] + y, origin[2] + z) for x, y, z in points]


def bulb(body: Body, at, radius: float) -> None:
    x, y, z = at
    body.hull(
        [
            (x + radius, y, z),
            (x - radius, y, z),
            (x, y + radius, z),
            (x, y - radius * 1.4, z),
            (x, y, z + radius),
            (x, y, z - radius),
        ],
        "bulbs",
    )


def crow(body: Body, at, size: float, facing: int, part: str) -> None:
    """A perched crow, `size` long, its beak towards `facing` (1 is +X): body, head, beak, tail."""
    x, y, z = at
    s, f = size, facing

    def p(dx, dy, dz=0.0):
        return (x + f * dx * s, y + dy * s, z + dz * s)

    body.hull(
        [
            p(-0.25, 0.05),
            p(0.2, 0.05),
            p(0.25, 0.3),
            p(-0.1, 0.38),
            p(0, 0.2, 0.16),
            p(0, 0.2, -0.16),
        ],
        part,
    )
    body.hull(
        [
            p(0.18, 0.3),
            p(0.36, 0.3),
            p(0.3, 0.48),
            p(0.2, 0.45),
            p(0.27, 0.38, 0.09),
            p(0.27, 0.38, -0.09),
        ],
        part,
    )
    body.hull(
        [p(0.34, 0.36), p(0.34, 0.42), p(0.52, 0.37), p(0.36, 0.39, 0.03), p(0.36, 0.39, -0.03)],
        part,
    )
    body.hull(
        [p(-0.2, 0.12), p(-0.2, 0.3), p(-0.55, 0.0), p(-0.5, 0.08, 0.05), p(-0.5, 0.08, -0.05)],
        part,
    )
    for dz in (-0.05, 0.05):
        body.hull(limb(p(0.02, 0.06, dz), p(0.04, 0.0, dz), 0.008, 0.008, 3), part)


main()
