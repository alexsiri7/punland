"""The dream, where the cat dreams his songs. docs/design/rooms/dream.svg is the layout: a slab of
pavement hanging in a dusk sky, the rooftops of Punland upside down overhead, music staves drifting
across, and an empty little stage on its own slab floating beyond, its two lamps already lit.
story/CANON.md (Places) describes it: a trippy world where things from the street turn into parts
of a song.

    blender -b --factory-startup --python art/blender/dream.py -- \\
        --out frontend/public/models/scenes/dream.glb \\
        [--previews docs/screenshots/blender/dream]

Built from scratch every run, in glTF axes, metres, placed in the reference art's scene pixels
through `cam_main` (lib/scene.py).
"""

import os
import sys
from itertools import pairwise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.build import dome, limb
from lib.export import arguments, empty_scene, export_glb
from lib.scene import FRONT, UP, Room, border, box, ellipse, rect

# STYLE.md's palette, and the reference art's own tones for the stage and the music.
COLOURS = {
    "pavement": "#5E5A62",
    "paving-joints": "#4A464E",
    "slab-edge": "#2F2D35",
    "rock": "#4A464E",
    "stage": "#5A332D",
    "stage-boards": "#8A5A34",
    "frame": "#2A1C1A",
    "stage-slab": "#5E5A62",
    "stage-rock": "#4A4A5E",
    "lamp-post": "#16161A",
    "lamp-shade": "#2F4A36",
    "bulb": "#FFE3A0",
    "mic": "#2A2A30",
    "mic-head": "#3A3C46",
    "verse": "#C8483B",
    "paper": "#D9CDB4",
    "window-glow": "#E8B566",
    "stave": "#A9A6B2",
    "can": "#C8483B",
    "can-rim": "#A9A6B2",
    "dusk": "#2E3A52",
    "haze": "#6E6478",
    "horizon": "#C98A6C",
}

#: The pavement slab the cat stands on: the pixel row its back edge meets the art's ground at,
#: its columns there, and at the art's front edge, the row of that edge.
SLAB_BACK, SLAB_BACK_COLUMNS = 526, (140, 1180)
SLAB_EDGE, SLAB_EDGE_COLUMNS = 628, (80, 1240)
#: How far the slab hangs down under its pavement, and how much its rock narrows by there.
SLAB_DROP, SLAB_TAPER = 1.6, 0.8
#: How far the stage floats behind the back of the slab, as the placeholder places it.
STAGE_BEHIND = 6.0
#: The stage's deck and the slab it stands on, how deep each is.
STAGE_DEPTH, STAGE_SLAB_DEPTH = 3.0, 4.0
#: The stage's two lamps, their pixel columns, and the mic stand's.
LAMPS, MIC = (690, 950), 811
#: The rooftops of Punland hanging upside down from the top of the sky, after the reference art:
#: (x, width, the row of the eaves, the row of the gable's point) in pixels, and how far away
#: each stands, in metres behind the back of the slab: the nearer in the depth ramp's third
#: layer, the farther in its last.
ROOFTOPS = (
    (80, 80, 70, 92, 40),
    (200, 36, 48, 48, 80),
    (300, 60, 104, 124, 40),
    (880, 80, 60, 84, 80),
    (1010, 50, 112, 112, 40),
    (1120, 60, 74, 96, 80),
)
#: The art's lit windows, one in each of four of the rooftops: (rooftop, x, y) in pixels.
WINDOWS = ((0, 116, 30), (2, 326, 60), (4, 1030, 70), (5, 1146, 40))
#: The music staves' five lines drifting across the sky, each the art's curve from (-20, 196) a
#: further 14 px down, at this distance behind the back of the slab, and the notes on them.
STAVES, STAVE_GAP, STAVE_BEHIND = 5, 14, 20.0
NOTES = ((210, 214), (420, 232), (610, 222), (1060, 206))
#: The motes of light drifting over the slab, in pixels, and how far behind its back.
MOTES = ((260, 430, 2.0), (1180, 380, 3.0), (480, 300, 5.0), (140, 340, 4.0))
#: A can from the street floating up past the slab's left end, turning into notes: its pixel
#: centre and how far behind the back of the slab.
CAN, CAN_BEHIND = (190, 400), 1.0


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    room = Room("dream", COLOURS)
    dream = Dream(room)
    dream.ground()
    dream.stage()
    dream.verse()
    dream.can()
    dream.motes()
    dream.fore()
    dream.body.finish("dream")
    dream.sky()
    room.camera()
    export_glb(os.path.abspath(args.out), cameras=True)
    if args.previews:
        room.previews(os.path.abspath(args.previews))


def curve(p0, p1, p2, p3, steps: int) -> list[tuple[float, float]]:
    """`steps` + 1 points along the cubic Bézier from `p0` to `p3`, with controls `p1` and `p2`."""
    out = []
    for i in range(steps + 1):
        t = i / steps
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t**2, t**3
        out.append(tuple(a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k] for k in (0, 1)))
    return out


class Dream:
    """The room's set pieces: the slab, the props and the rooftops in one mesh, the stage, its
    hotspot, on its own, and the sky."""

    def __init__(self, room: Room):
        self.room = room
        self.lens = room.lens
        #: The back edge of the slab, where it meets the sky in the art.
        self.back = self.lens.depth_at(SLAB_BACK)
        self.body = room.body()

    @staticmethod
    def column(side: int, row: float) -> float:
        """The pixel column of the slab's left (0) or right (1) side at the pixel row `row`."""
        back, edge = SLAB_BACK_COLUMNS[side], SLAB_EDGE_COLUMNS[side]
        return back + (edge - back) * (row - SLAB_BACK) / (SLAB_EDGE - SLAB_BACK)

    def slab_side(self, row: float) -> tuple[float, float]:
        """The x of the slab's left and right sides on the ground at the pixel row `row`."""
        return tuple(self.lens.floor(self.column(side, row), row).x for side in (0, 1))

    # --- The slab. -------------------------------------------------------------------------------

    def ground(self) -> None:
        """`floor`, the slab's pavement from its back edge to the front of the walk line, the
        pavement on to its front edge, its joints, and the rock it breaks off from, hanging
        under it."""
        room, lens, body = self.room, self.lens, self.body
        front_row = max(p["y"] for p in room.content["walkable"])
        back_left, back_right = self.slab_side(SLAB_BACK)
        front_left, front_right = self.slab_side(front_row)
        room.floor(
            [
                (back_left, self.back),
                (back_right, self.back),
                (front_right, FRONT),
                (front_left, FRONT),
            ],
            "pavement",
        )
        edge = lens.depth_at(SLAB_EDGE)
        edge_left, edge_right = self.slab_side(SLAB_EDGE)
        body.plate(
            [
                (front_left, 0, FRONT),
                (front_right, 0, FRONT),
                (edge_right, 0, edge),
                (edge_left, 0, edge),
            ],
            "pavement",
            UP,
        )
        for top, bottom in ((300, 270), (520, 506), (740, 742)):
            a, b = lens.floor(top, SLAB_BACK), lens.floor(bottom, SLAB_EDGE)
            body.plate(
                [
                    (a.x - 0.012, 0.002, a.z),
                    (a.x + 0.012, 0.002, a.z),
                    (b.x + 0.012, 0.002, b.z),
                    (b.x - 0.012, 0.002, b.z),
                ],
                "paving-joints",
                UP,
            )
        rim = [
            (back_left, self.back),
            (back_right, self.back),
            (edge_right, edge),
            (edge_left, edge),
        ]
        body.hull([(x, y, z) for x, z in rim for y in (-0.12, -0.005)], "slab-edge")
        centre = sum(x for x, _z in rim) / 4, (self.back + edge) / 2
        under = [
            (
                centre[0] + (x - centre[0]) * SLAB_TAPER,
                -SLAB_DROP,
                centre[1] + (z - centre[1]) * 0.6,
            )
            for x, z in rim
        ]
        body.hull([(x, -0.12, z) for x, z in rim] + under, "rock")
        # Shards broken off the slab, falling away under its front edge.
        for x, drop in ((230, 0.5), (676, 0.8), (1070, 0.6)):
            at = lens.floor(x, SLAB_EDGE)
            shard = [(at.x - 0.3, -0.25, at.z - 0.2), (at.x + 0.3, -0.25, at.z - 0.2)]
            shard += [(at.x, -0.25, at.z + 0.15), (at.x + 0.05, -0.25 - drop, at.z)]
            body.hull(shard, "rock")

    # --- `hit_stage`. ----------------------------------------------------------------------------

    def stage(self) -> None:
        """The empty stage floating on its own slab of pavement beyond: its deck, framed, its
        boards, the rock under the slab, a mic stand waiting on it, and its two lamps, already
        lit."""
        room, lens = self.room, self.lens
        z = self.back - STAGE_BEHIND
        stage = room.body()
        stage.hull(lens.box(560, 360, 520, 44, z + 0.4, STAGE_SLAB_DEPTH), "stage-slab")
        bottom = [(600, 404), (1040, 404), (980, 450), (660, 450)]
        rock = [lens.at(x, y, z + 0.4) for x, y in bottom[:2]]
        rock += [lens.at(x, y, z - 0.4) for x, y in bottom[2:]]
        far = z + 0.4 - STAGE_SLAB_DEPTH
        stage.hull([tuple(p) for p in rock] + [(p.x, p.y, far + 0.6) for p in rock], "stage-rock")
        stage.hull(lens.box(620, 300, 400, 60, z, STAGE_DEPTH), "stage")
        for points in border(620, 300, 400, 60, 4):
            stage.hull(lens.outline(points, z + 0.02, 0.02), "frame")
        stage.hull(lens.box(616, 292, 408, 10, z + 0.025, STAGE_DEPTH + 0.025), "stage-boards")
        deck = lens.at(0, 292, z).y
        mic = lens.at(MIC, 0, z - 0.8).x
        stage.hull(box((mic - 0.1, deck, z - 0.9), (mic + 0.1, deck + 0.06, z - 0.7)), "mic")
        stage.hull(limb((mic, deck, z - 0.8), (mic, deck + 0.75, z - 0.8), 0.025, 0.02, 6), "mic")
        stage.hull(dome((mic, deck + 0.82, z - 0.84), 0.08, 0.1, 0.06, 8), "mic-head")
        for x in LAMPS:
            self.lamp(stage, lens.at(x, 0, z - 0.3).x, deck, z - 0.3)
        room.hotspot("stage", stage.finish("stage"))

    def lamp(self, body, x: float, deck: float, z: float) -> None:
        """A stage lamp on its post: the post up from the deck, the green shade at its top,
        tipped down over the stage, and the bulb lit under it."""
        top = self.lens.at(0, 150, z).y
        body.hull(limb((x, deck, z), (x, top, z), 0.03, 0.025, 6), "lamp-post")
        body.hull(limb((x, top, z), (x, top - 0.36, z + 0.05), 0.12, 0.3, 10), "lamp-shade")
        body.hull(dome((x, top - 0.33, z + 0.05), 0.1, 0.1, 0.04, 8), "bulb")

    # --- On the slab and around it. --------------------------------------------------------------

    def verse(self) -> None:
        """A red post at the slab's back corner, the street's bollard turned into a page of the
        song: VERSE runs up it."""
        lens, body = self.lens, self.body
        post = lens.standing(1108, 460, 24, 70, 0.24)
        body.hull(post, "verse")
        front = max(p[2] for p in post)
        centre = lens.at(1120, 495, front + 0.004)
        self.room.sign(
            "verse-sign",
            "VERSE",
            "paper",
            14 * lens.metres(front),
            tuple(centre),
            turn=(0, 0, 90),
            spacing=1.2,
        )

    def can(self) -> None:
        """A can from the street, kicked up into the dream, floating on its side by the slab's
        left end with two notes coming out of it."""
        lens, body = self.lens, self.body
        z = self.back - CAN_BEHIND
        x, y = CAN
        a, b = lens.at(x - 18, y + 8, z), lens.at(x + 18, y - 8, z)
        body.hull(limb(tuple(a), tuple(b), 0.11, 0.11, 10), "can")
        body.hull(limb(tuple(b), tuple(b + (b - a) * 0.08), 0.1, 0.1, 10), "can-rim")
        for dx, dy, size in ((40, -40, 9), (66, -84, 7)):
            self.note(x + dx, y + dy, z, size)

    def note(self, x: float, y: float, z: float, size: float) -> None:
        """A note of `size` pixels with its head at (x, y) at depth `z`, its stem up the right."""
        lens, body = self.lens, self.body
        body.hull(lens.outline(ellipse(x, y, size, size * 0.72, -20, 8), z, 0.04), "stave")
        body.hull(lens.outline(rect(x + size - 2, y - size * 4, 2.5, size * 4), z, 0.03), "stave")

    def motes(self) -> None:
        """Motes of light drifting about the slab, as the art's string-light dots."""
        for x, y, behind in MOTES:
            centre = self.lens.at(x, y, self.back - behind)
            self.body.hull(dome(tuple(centre), 0.035, 0.035, 0.03, 6), "bulb")

    def fore(self) -> None:
        """Shards of the street hanging in the top corners, close to the camera, the nearest
        layer of the depth ramp, and a mote by each."""
        lens, body = self.lens, self.body
        z = lens.eye.z - 4
        for points in (
            [(-40, -40), (70, -40), (40, 60), (-40, 100)],
            [(1320, -40), (1200, -40), (1236, 52), (1320, 80)],
        ):
            body.hull(lens.outline(points, z, 0.3), "depth-0")
        for x, y in ((40, 120), (1240, 110)):
            centre = lens.at(x, y, z - 0.5)
            body.hull(dome(tuple(centre), 0.02, 0.02, 0.015, 6), "bulb")

    # --- The sky. --------------------------------------------------------------------------------

    def sky(self) -> None:
        """The dream's sky beyond the slab: the rooftops of Punland hanging upside down in it, in
        the depth ramp, with the odd window still lit; the music staves drifting across it with
        their notes; and the dusk in flat bands behind, clay at the bottom where the void
        under the slab shows."""
        room, lens = self.room, self.lens
        far = room.body()
        for x, w, eaves, point, behind in ROOFTOPS:
            z = self.back - behind
            house = [(x, -400), (x + w, -400), (x + w, eaves), (x + w / 2, point), (x, eaves)]
            room.far(far, lens.outline(house, z, 4))
        for rooftop, x, y in WINDOWS:
            z = self.back - ROOFTOPS[rooftop][4] + 0.05
            far.hull(lens.outline(rect(x, y, 8, 10), z, 0.05), "window-glow")
        z = self.back - STAVE_BEHIND
        for line in range(STAVES):
            dy = STAVE_GAP * line
            points = curve((-20, 196 + dy), (240, 160 + dy), (480, 236 + dy), (760, 200 + dy), 24)
            points += curve(
                (760, 200 + dy), (1040, 164 + dy), (1140, 170 + dy), (1300, 210 + dy), 16
            )[1:]
            for (x0, y0), (x1, y1) in pairwise(points):
                segment = [(x0, y0 - 1.5), (x1, y1 - 1.5), (x1, y1 + 1.5), (x0, y0 + 1.5)]
                far.hull(lens.outline(segment, z, 0.02), "stave")
        for x, y in NOTES:
            far.hull(lens.outline(ellipse(x, y, 7, 5, -20, 8), z + 0.02, 0.04), "stave")
            far.hull(lens.outline(rect(x + 5, y - 28, 2.5, 28), z + 0.02, 0.03), "stave")
        far.finish("far")
        sky = room.body()
        for part, top, bottom in (("dusk", -400, 290), ("haze", 290, 470), ("horizon", 470, 900)):
            sky.hull(lens.box(-600, top, 2500, bottom - top, -300, 1), part)
        sky.finish("sky")


main()
