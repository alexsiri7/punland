"""The band's page, the online world's room: walking about inside a phone feed. The layout is
docs/design/rooms/feed.svg: a dark violet hall whose back wall is a giant phone showing the band's
page, with a [BAND NAME] header, an empty avatar, no followers and four empty post slots; blank
posts hang about it like posters; the cat walks on a glowing scroll bar. story/CANON.md (Places)
describes it: a visual version of running a band's Instagram, full of visual puns.

    blender -b --factory-startup --python art/blender/feed.py -- \\
        --out frontend/public/models/scenes/feed.glb \\
        [--previews docs/screenshots/blender/feed]

Built from scratch every run, in glTF axes, metres, placed in the reference art's scene pixels
through `cam_main` (lib/scene.py).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.export import arguments, empty_scene, export_glb
from lib.scene import FRONT, UP, Room, ellipse, rect, rounded

# STYLE.md's palette: the phone in the UI's own tones, the props in its accents.
COLOURS = {
    "hall-floor": "#26272E",
    "floor-edge": "#3A3C46",
    "scroll-track": "#34363F",
    "scroll-thumb": "#5FA39A",
    "phone": "#1C1D22",
    "screen": "#26272E",
    "header": "#4F6A8A",
    "band-name": "#E3C58A",
    "avatar": "#3A3C46",
    "label": "#8E8B98",
    "muted": "#A9A6B2",
    "post": "#3A3C46",
    "status": "#E8E4DC",
    "like": "#C8483B",
    "heart": "#D9CDB4",
    "play": "#8A7FA8",
    "void": "#2F2D35",
}

#: The row the phone and the props stand on the hall floor at, the art's ground line.
WALL_ROW = 520
#: How far the hall floor runs on behind the phone's face.
FLOOR_BEHIND = 0.5
#: The phone: its bezel and its screen, rounded pixel rects, and how deep it is.
BEZEL, SCREEN, PHONE_DEPTH = (380, 20, 520, 500, 40), (400, 40, 480, 460, 24), 0.24
#: The page's header band, its avatar's centre and radius, and its four empty post slots.
HEADER = (400, 40, 480, 120)
AVATAR, AVATAR_RADIUS = (470, 160), 44
SLOTS = ((430, 236, 200, 120), (650, 236, 200, 120), (430, 372, 200, 110), (650, 372, 200, 110))
#: Blank posts hanging in the dark beyond the phone, the feed scrolling away: the art's four, in
#: pixel rects, this far behind the phone, the near end of the depth ramp's second layer.
POSTS = ((60, 80, 150, 190), (60, 300, 150, 190), (1070, 80, 150, 190), (1070, 300, 150, 190))
POSTS_BEHIND = 8.0
#: The like button standing on the floor right of the phone, and the play button on its left.
LIKE, PLAY = (960, 430, 80, 90), (220, 460, 60, 60)
#: The scroll bar's thumb on the floor, a pixel rect.
THUMB = (420, 574, 260, 24)


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    room = Room("feed", COLOURS)
    feed = Feed(room)
    feed.ground()
    feed.page()
    feed.likes()
    feed.play()
    feed.status_bar()
    feed.body.finish("feed")
    feed.void()
    room.camera()
    export_glb(os.path.abspath(args.out), cameras=True)
    if args.previews:
        room.previews(os.path.abspath(args.previews))


class Feed:
    """The room's set pieces: the hall floor, the props and the status bar in one mesh, the phone
    and the like button, its hotspots, each on its own, and the void with the posts in it."""

    def __init__(self, room: Room):
        self.room = room
        self.lens = room.lens
        #: The phone's face, where it meets the hall floor in the art.
        self.wall = self.lens.depth_at(WALL_ROW)
        self.body = room.body()

    # --- The hall floor. -------------------------------------------------------------------------

    def ground(self) -> None:
        """`floor`, the hall floor from a little behind the phone to the front of the walk line,
        and on in front of it; its edge at the back; and the scroll bar laid on it, its track
        round the walk line and its thumb."""
        room, lens, body = self.room, self.lens, self.body
        back = self.wall - FLOOR_BEHIND
        room.floor([(-14, back), (14, back), (14, FRONT), (-14, FRONT)], "hall-floor")
        body.plate([(-14, 0, FRONT), (14, 0, FRONT), (14, 0, 4), (-14, 0, 4)], "hall-floor", UP)
        body.plate(
            [
                (-14, 0.002, back),
                (14, 0.002, back),
                (14, 0.002, back + 0.08),
                (-14, 0.002, back + 0.08),
            ],
            "floor-edge",
            UP,
        )
        track = [(p.x, 0.002, p.z) for p in room.walkable]
        body.plate(track, "scroll-track", UP)
        thumb = [lens.floor(x, y) for x, y in rounded(*THUMB, 12)]
        body.plate([(p.x, 0.004, p.z) for p in thumb], "scroll-thumb", UP)

    # --- `hit_page`. -----------------------------------------------------------------------------

    def page(self) -> None:
        """The giant phone standing at the back of the hall, showing the band's page: its header
        with [BAND NAME] on it, the empty avatar with a question mark in it, no followers and no
        posts, and four empty post slots, each with a plus to add one."""
        room, lens, wall = self.room, self.lens, self.wall
        phone = room.body()
        phone.hull(lens.outline(rounded(*BEZEL), wall, PHONE_DEPTH), "phone")
        phone.hull(lens.outline(rounded(*SCREEN), wall + 0.01, 0.01), "screen")
        x, y, w, h = HEADER
        phone.hull(lens.outline(rounded(x, y, w, h, SCREEN[4]), wall + 0.02, 0.01), "header")
        phone.hull(lens.outline(rect(x, y + h / 2, w, h / 2), wall + 0.02, 0.01), "header")
        cx, cy = AVATAR
        phone.hull(
            lens.outline(
                ellipse(cx, cy, AVATAR_RADIUS, AVATAR_RADIUS, sides=20), wall + 0.04, 0.02
            ),
            "avatar",
        )
        phone.hull(lens.outline(ellipse(cx, cy, 36, 36, sides=20), wall + 0.045, 0.005), "screen")
        for x, y, w, h in SLOTS:
            phone.hull(lens.outline(rect(x, y, w, h), wall + 0.05, 0.04), "post")
            mx, my = x + w / 2, y + h / 2
            for plus in (rect(mx - 30, my - 2, 60, 4), rect(mx - 2, my - 30, 4, 60)):
                phone.hull(lens.outline(plus, wall + 0.055, 0.005), "screen")
        metres = lens.metres(wall)
        lettering = [
            room.sign(
                "band-name",
                "[BAND NAME]",
                "band-name",
                28 * metres,
                tuple(lens.at(640, 96, wall + 0.03)),
                spacing=1.25,
            ),
            room.sign(
                "avatar-mark", "?", "label", 24 * metres, tuple(lens.at(470, 160, wall + 0.05))
            ),
            room.sign(
                "followers",
                "0 FOLLOWERS · 0 POSTS",
                "muted",
                12 * metres,
                tuple(lens.at(610, 198, wall + 0.015)),
                spacing=1.2,
            ),
        ]
        room.hotspot("page", phone.finish("page"), *lettering)

    # --- `hit_likes`. ----------------------------------------------------------------------------

    def likes(self) -> None:
        """The like button standing on the floor by the phone: a red block with a heart on its
        face and its count under it, nought."""
        room, lens, wall = self.room, self.lens, self.wall
        like = room.body()
        like.hull(lens.outline(rounded(*LIKE, 10), wall, 0.4), "like")
        for lobe in (993, 1007):
            like.hull(
                lens.outline(ellipse(lobe, 458, 7.5, 7.5, sides=10), wall + 0.02, 0.02), "heart"
            )
        like.hull(
            lens.outline([(985.5, 460), (1014.5, 460), (1000, 484)], wall + 0.02, 0.02), "heart"
        )
        count = room.sign(
            "like-count",
            "0",
            "heart",
            14 * lens.metres(wall),
            tuple(lens.at(1000, 503, wall + 0.005)),
        )
        room.hotspot("likes", like.finish("likes"), count)

    # --- About the hall. -------------------------------------------------------------------------

    def play(self) -> None:
        """A video's play button standing on the floor left of the phone."""
        lens, wall, body = self.lens, self.wall, self.body
        body.hull(lens.outline(rounded(*PLAY, 10), wall, 0.3), "play")
        body.hull(lens.outline([(238, 480), (262, 490), (238, 500)], wall + 0.02, 0.02), "status")

    def status_bar(self) -> None:
        """The phone's status bar across the top of the view, close to the camera: the room is
        inside the phone too. Its clock and battery are two pills."""
        lens, body = self.lens, self.body
        z = lens.eye.z - 3
        body.hull(lens.outline(rect(-40, -40, 1360, 54), z, 0.05), "phone")
        for points in (rounded(24, 4, 18, 6, 2), rounded(1230, 4, 26, 6, 2)):
            body.hull(lens.outline(points, z + 0.01, 0.01), "status")

    # --- The void. -------------------------------------------------------------------------------

    def void(self) -> None:
        """The dark the phone stands in, and the art's four blank posts hanging in it, a step
        lighter and bluer in the depth ramp, their picture and caption in its next two tones."""
        room, lens = self.room, self.lens
        far = room.body()
        z = self.wall - POSTS_BEHIND
        for x, y, w, h in POSTS:
            room.far(far, lens.outline(rect(x, y, w, h), z, 0.1))
            far.hull(lens.outline(rect(x + 16, y + 16, w - 32, 100), z + 0.01, 0.01), "depth-2")
            for length, row in ((94, 135), (64, 149)):
                far.hull(lens.outline(rect(x + 16, y + row, length, 3), z + 0.01, 0.01), "depth-3")
        far.finish("far")
        void = room.body()
        void.hull(lens.box(-600, -400, 2500, 1400, -300, 1), "void")
        void.finish("void")


main()
