"""The coach station, where the coach drops the cat off in Punland: Act 1 starts here, with the
Arrival. docs/design/rooms/coach-station.svg is the layout: the coach bays under the dark canopy
held up by its pillars, the departures board, the lit exit with the stand of free maps by it, and
the signpost up the road to The Three Crows. story/CANON.md (Places, and the Arrival) describes it.

    blender -b --factory-startup --python art/blender/coach-station.py -- \\
        --out frontend/public/models/scenes/coach-station.glb \\
        [--previews docs/screenshots/blender/coach-station]

Built from scratch every run, in glTF axes, metres, placed in the reference art's scene pixels
through `cam_main` (lib/scene.py).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import limb
from lib.export import arguments, empty_scene, export_glb
from lib.scene import FRONT, UP, Room, border, box, ellipse, rect

# STYLE.md's palette, and the reference art's own tones for the station.
COLOURS = {
    "pavement": "#5E5A62",
    "paving-joints": "#55515A",
    "bay-line": "#C99A54",
    "kerb": "#4A464E",
    "road": "#2F2D35",
    "hall": "#4A4A5E",
    "tiles": "#3A3C46",
    "pillar": "#4A464E",
    "canopy": "#2F2D35",
    "strut": "#26272E",
    "sign-gold": "#E3C58A",
    "fascia": "#1A2822",
    "frame": "#2A1C1A",
    "board": "#1E1E24",
    "exit-glow": "#E8B566",
    "door-glass": "#D9A457",
    "stand": "#3A3C46",
    "map": "#D9CDB4",
    "map-road": "#5FA39A",
    "map-pin": "#C8483B",
    "poster-red": "#C8483B",
    "poster-violet": "#8A7FA8",
    "paper": "#E8E4DC",
    "bench": "#6E4628",
    "iron": "#16161A",
}

#: The kerb's drop from the pavement to the road in front of the walk line.
KERB = 0.12
#: How far the canopy reaches out over the bays from the hall's wall, and how thick the hall is.
CANOPY_REACH, HALL_DEPTH = 1.6, 0.4
#: The pillars under the canopy, their pixel columns along the wall, and the bays' signs.
PILLARS = (60, 250, 440)
BAY_SIGNS = ((130, "BAY 1"), (320, "BAY 2"))
#: The exit, a pixel rect in the wall, and how far back its lit hall runs.
EXIT, EXIT_BACK = (1060, 180, 200, 320), 0.8
#: The bay the coach pulls in at, painted on the floor round where it stands: from and to these
#: pixel columns at the front row, back from there to the back row.
BAY = (40, 560, 596, 508)
#: The departures board's three rows: where to, and when.
DEPARTURES = (
    "LITERAL VILLAGE · TOMORROW",
    "THE BIG TIME · DELAYED",
    "OVERNIGHT FAME · CANCELLED",
)


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    room = Room("coach-station", COLOURS)
    station = CoachStation(room)
    station.ground()
    station.hall()
    station.canopy()
    station.exit()
    station.board()
    station.map_stand()
    room.signpost("road-signpost", "road", 1150, "PUB", "sign-gold", 1)
    station.building.finish("station")
    room.camera()
    export_glb(os.path.abspath(args.out), cameras=True)
    if args.previews:
        room.previews(os.path.abspath(args.previews))


class CoachStation:
    """The room's set pieces: the forecourt, the hall and its canopy in one mesh with what is on
    its wall, and the hotspots each on their own."""

    def __init__(self, room: Room):
        self.room = room
        self.lens = room.lens
        #: The hall's wall, where the forecourt meets it in the art.
        self.wall = self.lens.depth_at(500)
        self.building = room.body()

    def front(self, points, out: float, depth: float, part: str) -> None:
        """The pixel outline `points`, standing `out` off the hall's wall, `depth` deep."""
        self.building.hull(self.lens.outline(points, self.wall + out, depth), part)

    # --- The forecourt. ------------------------------------------------------------------------

    def ground(self) -> None:
        """`floor`, the forecourt from the hall to the front of the walk line, its joints, the
        coach's bay painted on it, and the kerb and the road in front of it."""
        room, lens, wall = self.room, self.lens, self.wall
        room.floor([(-14, wall), (14, wall), (14, FRONT), (-14, FRONT)], "pavement")
        body = room.body()
        road = -KERB
        body.plate(
            [(-30, road, FRONT), (30, road, FRONT), (30, road, 6), (-30, road, 6)], "road", UP
        )
        body.hull(box((-30, road, FRONT - 0.09), (30, 0.004, FRONT)), "kerb")
        paint = 0.002
        for row in (530, 566):
            z = lens.depth_at(row)
            joint = [(-14, z - 0.01), (14, z - 0.01), (14, z + 0.01), (-14, z + 0.01)]
            body.plate([(x, paint, z) for x, z in joint], "paving-joints", UP)
        for column in range(60, 1280, 150):
            a, b = lens.floor(column, 500), lens.floor(column - 0.08 * (column - 640), 612)
            joint = [(a.x - 0.01, a.z), (a.x + 0.01, a.z), (b.x + 0.01, b.z), (b.x - 0.01, b.z)]
            body.plate([(x, paint, z) for x, z in joint], "paving-joints", UP)
        left, right, near, far = BAY
        x0, x1 = lens.floor(left, near).x, lens.floor(right, near).x
        z0, z1 = lens.depth_at(far), lens.depth_at(near)
        line = 0.07
        for points in (
            [(x0, z0), (x1, z0), (x1, z0 + line), (x0, z0 + line)],
            [(x0, z1 - line), (x1, z1 - line), (x1, z1), (x0, z1)],
            [(x0, z0), (x0 + line, z0), (x0 + line, z1), (x0, z1)],
            [(x1 - line, z0), (x1, z0), (x1, z1), (x1 - line, z1)],
        ):
            body.plate([(x, 2 * paint, z) for x, z in points], "bay-line", UP)
        # The bay's number, painted across it where the coach's door opens.
        room.sign(
            "bay-number",
            "BAY 2",
            "bay-line",
            0.3,
            (x1 - 0.7, 3 * paint, (z0 + z1) / 2),
            turn=(-90, 0, 0),
            spacing=1.3,
        )
        body.finish("forecourt")

    # --- The hall: its wall, the canopy over the bays, and what is on the wall. -----------------

    def hall(self) -> None:
        """The hall's wall either side of the exit and over it, its tiled dado, the bench under
        the board, and the posters between the pillars."""
        lens, wall, body = self.lens, self.wall, self.building
        x, y, w, _h = EXIT
        for left, right, top, bottom in ((-400, x, -200, 500), (x + w, 1700, -200, 500)):
            body.hull(lens.box(left, top, right - left, bottom - top, wall, HALL_DEPTH), "hall")
        body.hull(lens.box(x, -200, w, y + 200, wall, HALL_DEPTH), "hall")
        self.front(rect(-400, 430, x + 400, 70), 0.02, 0.02, "tiles")
        self.front(rect(x + w, 430, 440, 70), 0.02, 0.02, "tiles")
        self.front(rect(-400, 426, x + 400, 4), 0.03, 0.03, "pillar")
        self.front(rect(x + w, 426, 440, 4), 0.03, 0.03, "pillar")
        # The posters: a gig at The Three Crows, and two the coaches cover when they pull in.
        self.poster(108, 250, 100, 130, "poster-red", "LIVE MUSIC", "THE THREE CROWS")
        self.poster(300, 270, 84, 110, "poster-violet", "PUNLAND", "DREAM BIG")
        self.poster(800, 230, 64, 88, "poster-red", "GIGS", "EVERY NIGHT")
        # The bench under the board, for the next coach to Literal Village.
        bench_front = lens.depth_at(510)
        for column in (570, 720):
            body.hull(lens.standing(column, 470, 8, 40, 0.3), "iron")
        body.hull(lens.box(556, 466, 188, 10, bench_front - 0.02, 0.34), "bench")
        body.hull(lens.box(556, 424, 188, 8, bench_front - 0.34, 0.04), "bench")
        body.hull(lens.box(556, 440, 188, 8, bench_front - 0.34, 0.04), "bench")

    def poster(
        self, x: float, y: float, w: float, h: float, part: str, title: str, under: str
    ) -> None:
        """A poster pasted on the wall: `title` big on its colour, `under` small beneath it."""
        room, lens, wall = self.room, self.lens, self.wall
        self.front(rect(x, y, w, h), 0.025, 0.004, "paper")
        self.front(rect(x + 4, y + 4, w - 8, h * 0.62), 0.028, 0.004, part)
        metres = lens.metres(wall)
        room.sign(
            f"poster-{title.lower().replace(' ', '-')}",
            title,
            "paper",
            0.13 * h * metres,
            tuple(lens.at(x + w / 2, y + 4 + h * 0.31, wall + 0.033)),
            spacing=1.1,
        )
        room.sign(
            f"poster-{under.lower().replace(' ', '-')}",
            under,
            "frame",
            0.08 * h * metres,
            tuple(lens.at(x + w / 2, y + h * 0.82, wall + 0.03)),
            spacing=1.1,
        )

    def canopy(self) -> None:
        """The dark canopy over the bays, reaching out from the wall, its name along its front,
        the pillars and the struts that hold it, and the bays' signs hung under it."""
        room, lens, wall, body = self.room, self.lens, self.wall, self.building
        low, high = lens.at(0, 90, wall).y, lens.at(0, 40, wall).y
        left, right = lens.at(-40, 0, wall).x, lens.at(1320, 0, wall).x
        front = wall + CANOPY_REACH
        body.hull(box((left, low, wall), (right, high, front)), "canopy")
        body.hull(
            box((left, low - 0.06, front - 0.05), (right, high + 0.02, front + 0.03)), "frame"
        )
        fascia = (low + high) / 2
        room.sign(
            "canopy-name",
            "PUNLAND COACH STATION",
            "sign-gold",
            0.24,
            (lens.at(640, 0, front).x, fascia, front + 0.032),
            spacing=1.5,
        )
        for column in PILLARS:
            body.hull(lens.box(column, 40, 16, 460, wall + 0.2, 0.2), "pillar")
            x = lens.at(column + 8, 0, wall + 0.1).x
            body.hull(
                limb(
                    (x, low - 0.9, wall + 0.2),
                    (x, low, front - 0.15),
                    0.035,
                    0.035,
                    4,
                ),
                "strut",
            )
        hang = wall + 0.9
        for x, text in BAY_SIGNS:
            body.hull(lens.box(x, 110, 60, 30, hang, 0.02), "sign-gold")
            for edge in (x + 8, x + 52):
                foot = lens.at(edge, 110, hang - 0.01)
                body.hull(
                    limb((foot.x, foot.y, foot.z), (foot.x, low, foot.z), 0.006, 0.006, 4), "iron"
                )
            room.sign(
                f"bay-sign-{text[-1]}",
                text,
                "canopy",
                18 * lens.metres(hang),
                tuple(lens.at(x + 30, 125, hang + 0.002)),
                spacing=1.2,
            )

    def exit(self) -> None:
        """The lit exit: its frame, the hall beyond it, a glass door slid aside, and WAY OUT
        over it."""
        room, lens, wall, body = self.room, self.lens, self.wall, self.building
        x, y, w, h = EXIT
        for points in border(x - 6, y - 6, w + 12, h + 6, 8):
            self.front(points, 0.05, 0.05 + HALL_DEPTH, "frame")
        back = wall - HALL_DEPTH - EXIT_BACK
        inner = lens.at(x, y, wall - HALL_DEPTH), lens.at(x + w, y + h, wall - HALL_DEPTH)
        body.plate(
            [
                (inner[0].x, 0, wall),
                (inner[1].x, 0, wall),
                (inner[1].x, 0, back),
                (inner[0].x, 0, back),
            ],
            "pavement",
            UP,
        )
        body.hull(
            box((inner[0].x - 1, 0, back - 0.1), (inner[1].x + 1, inner[0].y + 1, back)),
            "exit-glow",
        )
        body.hull(
            box((inner[0].x, inner[0].y, back), (inner[1].x, inner[0].y + 1, wall - HALL_DEPTH)),
            "exit-glow",
        )
        body.hull(lens.box(x + w - 60, y, 58, h, wall - 0.12, 0.03), "door-glass")
        body.hull(lens.box(x + w - 62, y, 4, h, wall - 0.1, 0.05), "frame")
        body.hull(lens.box(x + 30, y - 40, w - 60, 26, wall + 0.06, 0.04), "fascia")
        room.sign(
            "way-out",
            "WAY OUT",
            "sign-gold",
            16 * lens.metres(wall),
            tuple(lens.at(x + w / 2, y - 27, wall + 0.062)),
            spacing=1.4,
        )

    # --- The hotspots. -------------------------------------------------------------------------

    def board(self) -> None:
        """`hit_board`: the departures board on the wall, its frame, DEPARTURES over it, and its
        three lit rows."""
        room, lens, wall = self.room, self.lens, self.wall
        board = room.body()
        x, y, w, h = 540, 190, 220, 120
        board.hull(lens.box(x, y, w, h, wall + 0.08, 0.08), "board")
        for points in border(x - 4, y - 4, w + 8, h + 8, 5):
            board.hull(lens.outline(points, wall + 0.09, 0.09), "frame")
        board.hull(lens.box(x, y - 26, w, 20, wall + 0.06, 0.06), "fascia")
        heading = room.sign(
            "departures",
            "DEPARTURES",
            "sign-gold",
            13 * lens.metres(wall),
            tuple(lens.at(x + w / 2, y - 16, wall + 0.062)),
            spacing=1.6,
        )
        rows = [heading]
        for i, text in enumerate(DEPARTURES):
            top = 210 + 32 * i
            board.hull(lens.box(556, top, 188, 12, wall + 0.084, 0.004), "sign-gold")
            rows.append(
                room.sign(
                    f"departure-{i}",
                    text,
                    "board",
                    8 * lens.metres(wall),
                    tuple(lens.at(650, top + 6, wall + 0.086)),
                    spacing=1.15,
                )
            )
        room.hotspot("board", board.finish("board"), *rows)

    def map_stand(self) -> None:
        """`hit_map-stand`: the stand of free maps by the exit, FREE MAPS over its two pockets,
        a folded map in each, its road and its pin printed on it."""
        room, lens = self.room, self.lens
        stand = room.body()
        foot = lens.depth_at(550)
        stand.hull(lens.standing(876, 540, 72, 10, 0.32), "iron")
        stand.hull(lens.standing(880, 430, 64, 120, 0.14), "stand")
        stand.hull(lens.box(874, 410, 76, 20, foot - 0.04, 0.04), "sign-gold")
        heading = room.sign(
            "free-maps",
            "FREE MAPS",
            "fascia",
            10 * lens.metres(foot),
            tuple(lens.at(912, 420, foot - 0.038)),
            spacing=1.2,
        )
        for top in (440, 480):
            stand.hull(lens.box(890, top, 44, 28, foot + 0.01, 0.012), "map")
            stand.hull(lens.box(890, top + 16, 44, 14, foot + 0.024, 0.01), "stand")
            stand.hull(lens.box(894, top + 6, 36, 2.5, foot + 0.023, 0.002), "map-road")
            stand.hull(
                lens.outline(ellipse(922, top + 11, 2.5, 2.5, sides=6), foot + 0.024, 0.002),
                "map-pin",
            )
        room.hotspot("map-stand", stand.finish("map-stand"), heading)


main()
