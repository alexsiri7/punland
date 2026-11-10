"""A room's scene model (asset contract, docs/ARCHITECTURE.md section 8): its `cam_main`, its
`floor`, its `hit_<id>` hotspots, its far set pieces in the depth ramp, its signs, and previews
from its camera. Points are in glTF axes (see __init__.py).

A room is laid out in the scene pixels of its reference art, docs/design/rooms/<room>.svg, seen
through `cam_main` as the placeholder rooms are (lens() in frontend/scripts/make-placeholders.mjs):
the camera is 25° high, 2.5 m up and tipped 6° down, placed so the front centre of the content's
walkable area is the origin. So the content's floor points, which are scene pixels, land where
they did on the placeholder, and the protagonist stands about 256 px tall at the front.
"""

import json
import math
import os
import re
from collections.abc import Sequence

import bpy
from mathutils import Matrix, Vector

from .build import Body, Point, blender, limb
from .palette import material
from .preview import render, stage, toon

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

YFOV = math.radians(25)
EYE = 2.5
TILT = math.radians(-6)
#: A room's scene in pixels (SCENE in frontend/src/domain/geometry.ts), its reference art's frame.
SCENE_WIDTH, SCENE_HEIGHT = 1280, 640
#: How far the floor may reach past the front of the walk line (the contract's tolerance is 0.02).
FRONT = 0.015
#: STYLE.md's depth ramp, near to far: each layer lighter and bluer.
DEPTH_RAMP = ("#2F2D35", "#4A4A5E", "#6E6A82", "#8E879C")
UP = (0, 1, 0)
#: glTF's axes in Blender's (blender() as a matrix).
GLTF_TO_BLENDER = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
#: The in-world sign face (STYLE.md, "Type"), from the frontend's own @fontsource package.
SIGN_FONT = "frontend/node_modules/@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2"


class Lens:
    """`cam_main` placed so the scene pixel `front` is over the origin, and the room's pixels as
    points through it."""

    def __init__(self, front: tuple[float, float]):
        towards = self.direction(*front)
        reach = EYE / -towards.y
        self.eye = Vector((-reach * towards.x, EYE, -reach * towards.z))

    @staticmethod
    def direction(x: float, y: float) -> Vector:
        """The ray from the camera through the scene pixel (x, y)."""
        tan = math.tan(YFOV / 2)
        dx = (2 * x / SCENE_WIDTH - 1) * tan * SCENE_WIDTH / SCENE_HEIGHT
        dy = (1 - 2 * y / SCENE_HEIGHT) * tan
        return Vector(
            (dx, dy * math.cos(TILT) + math.sin(TILT), dy * math.sin(TILT) - math.cos(TILT))
        )

    def on(self, x: float, y: float, point: Point, normal: Point) -> Vector:
        """Where the ray through the scene pixel (x, y) meets the plane through `point`."""
        ray = self.direction(x, y)
        normal = Vector(normal)
        return self.eye + ray * ((Vector(point) - self.eye).dot(normal) / ray.dot(normal))

    def floor(self, x: float, y: float) -> Vector:
        """The ground (y = 0) under the scene pixel (x, y)."""
        return self.on(x, y, (0, 0, 0), UP)

    def at(self, x: float, y: float, z: float) -> Vector:
        """The point at depth `z` under the scene pixel (x, y)."""
        return self.on(x, y, (0, 0, z), (0, 0, 1))

    def depth_at(self, row: float) -> float:
        """The depth at which the pixel row `row` meets the ground (the same across the row)."""
        return self.floor(SCENE_WIDTH / 2, row).z

    def box(self, x: float, y: float, width: float, height: float, z: float, depth: float):
        """A box whose front face, at depth `z`, covers the pixel rect; `depth` deep behind it."""
        left, top = self.at(x, y, z)[:2]
        right, bottom = self.at(x + width, y + height, z)[:2]
        return box((left, bottom, z - depth), (right, top, z))

    def outline(self, points: Sequence[tuple[float, float]], z: float, depth: float) -> list[Point]:
        """The pixel outline `points` at depth `z`, `depth` deep behind it."""
        front = [self.at(x, y, z) for x, y in points]
        return [tuple(p) for p in front] + [(p.x, p.y, z - depth) for p in front]

    def metres(self, z: float) -> float:
        """How many metres a pixel spans at depth `z`."""
        return self.at(1, 0, z).x - self.at(0, 0, z).x

    def standing(self, x: float, y: float, width: float, height: float, depth: float):
        """A box over the pixel rect standing on the ground where its foot (the rect's bottom)
        meets it, `depth` deep behind that."""
        return self.box(x, y, width, height, self.depth_at(y + height), depth)


def box(low: Point, high: Point) -> list[Point]:
    """The corners of the box between two opposite corners."""
    return [
        (x, y, z) for x in (low[0], high[0]) for y in (low[1], high[1]) for z in (low[2], high[2])
    ]


def rect(x: float, y: float, w: float, h: float) -> list[tuple[float, float]]:
    """A pixel rect's corners."""
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def ellipse(
    cx: float, cy: float, rx: float, ry: float, turn: float = 0.0, sides: int = 10
) -> list[tuple[float, float]]:
    """`sides` points round a pixel ellipse, turned `turn` degrees."""
    t = math.radians(turn)
    out = []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        ex, ey = rx * math.cos(a), ry * math.sin(a)
        out.append(
            (cx + ex * math.cos(t) - ey * math.sin(t), cy + ex * math.sin(t) + ey * math.cos(t))
        )
    return out


class Wall:
    """An upright plane that is not square to the camera, with points in its own (along, up,
    out) metres: from `origin` along the level direction `along`, up, and out of its face."""

    def __init__(self, origin: Point, along: tuple[float, float]):
        self.origin = Vector(origin)
        self.along = Vector((along[0], 0, along[1])).normalized()
        self.out = Vector(UP).cross(self.along)

    def point(self, s: float, y: float, out: float = 0.0) -> Point:
        return tuple(self.origin + s * self.along + Vector((0, y, 0)) + out * self.out)

    def box(self, s: tuple[float, float], y: tuple[float, float], out: tuple[float, float]):
        """The box from s[0] to s[1] along it, y[0] to y[1] up, and out[0] to out[1] out of it."""
        return [self.point(a, b, c) for a in s for b in y for c in out]


class Room:
    """A room being built: its content, the lens its reference art is seen through, and one
    material per part from `colours`, with the depth ramp's layers as `depth-0` to `depth-3`."""

    def __init__(self, room: str, colours: dict[str, str]):
        self.id = room
        with open(os.path.join(REPO, "frontend/src/content/rooms", f"{room}.json")) as file:
            self.content = json.load(file)
        with open(os.path.join(REPO, "docs/design/rooms", f"{room}.svg")) as file:
            frame = re.search(r'<svg[^>]*viewBox="([^"]*)"', file.read())
        if frame is None or frame.group(1).split() != ["0", "0", "1280", "640"]:
            raise ValueError(f"docs/design/rooms/{room}.svg is not in the 1280 x 640 scene frame")
        walkable = self.content["walkable"]
        row = max(p["y"] for p in walkable)
        front = [p["x"] for p in walkable if p["y"] == row]
        self.lens = Lens(((min(front) + max(front)) / 2, row))
        self.materials = {part: material(part, tone) for part, tone in colours.items()}
        for step, tone in enumerate(DEPTH_RAMP):
            self.materials[f"depth-{step}"] = material(f"depth-{step}", tone)

    @property
    def walkable(self) -> list[Vector]:
        """The content's walkable area on the ground."""
        return [self.lens.floor(p["x"], p["y"]) for p in self.content["walkable"]]

    def body(self) -> Body:
        return Body(self.materials)

    def camera(self) -> bpy.types.Object:
        """`cam_main`. The exporter takes the aspect from the render size, so that is set too."""
        scene = bpy.context.scene
        scene.render.resolution_x, scene.render.resolution_y = SCENE_WIDTH, SCENE_HEIGHT
        cam = bpy.data.objects.new("cam_main", bpy.data.cameras.new("cam_main"))
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle_y = YFOV
        cam.data.clip_start = 0.1
        cam.data.clip_end = 400
        cam.location = blender(self.lens.eye)
        cam.rotation_euler = (math.pi / 2 + TILT, 0, 0)
        scene.collection.objects.link(cam)
        return cam

    def floor(self, outline: Sequence[tuple[float, float]], part: str) -> bpy.types.Object:
        """`floor`: the ground (y = 0) inside the (x, z) `outline`. It must hold the walkable
        area and reach no further forward than FRONT."""
        body = self.body()
        body.plate([(x, 0, z) for x, z in outline], part, UP)
        if max(z for _x, z in outline) > FRONT:
            raise ValueError(f"the floor reaches past the front of the walk line: {outline}")
        return body.finish("floor")

    def hotspot(self, node: str, *parts: bpy.types.Object) -> bpy.types.Object:
        """`hit_<node>`, for the content's hotspot on the scene node `node`: an empty holding the
        visible `parts` the player points at. The renderer picks and frames the node with its
        children, and draws every mesh, so a hit area is what is seen rather than a proxy."""
        nodes = {h["target"].get("node") for h in self.content["hotspots"]}
        if node not in nodes:
            raise ValueError(f"{self.id} has no hotspot on the node {node!r}")
        hit = bpy.data.objects.new(f"hit_{node}", None)
        bpy.context.scene.collection.objects.link(hit)
        for part in parts:
            part.parent = hit
        return hit

    def depth(self, z: float) -> str:
        """The depth ramp's layer for a far set piece whose front is at depth `z`: the nearest
        out to twice the camera's distance to the back of the walkable area, then a step lighter
        and bluer each time that distance doubles."""
        near = self.lens.eye.z - min(p.z for p in self.walkable)
        steps = math.log2(max(1.0, (self.lens.eye.z - z) / near))
        return f"depth-{min(len(DEPTH_RAMP) - 1, int(steps))}"

    def far(self, body: Body, points: Sequence[Point]) -> None:
        """A far set piece: a hull in its depth ramp layer, with no detail (STYLE.md)."""
        body.hull(points, self.depth(max(p[2] for p in points)))

    def sign(
        self,
        name: str,
        text: str,
        part: str,
        height: float,
        at: Point,
        turn: tuple[float, float, float] = (0, 0, 0),
        spacing: float = 1.0,
    ) -> bpy.types.Object:
        """In-world lettering in the sign face, flat, as a mesh: `text` in capitals `height`
        metres tall, centred on `at`, facing +Z turned by `turn` (degrees about x, y and z, glTF
        axes), its letters `spacing` times their own advance apart."""
        path = os.path.join(REPO, SIGN_FONT)
        if not os.path.exists(path):
            raise FileNotFoundError(f"{SIGN_FONT} is missing: run `npm ci` in frontend/ first")
        font = bpy.data.fonts.load(path, check_existing=True)
        curve = bpy.data.curves.new(name, "FONT")
        curve.font = font
        curve.body = text
        # Bebas Neue's capitals are 0.7 of its size.
        curve.size = height / 0.7
        curve.space_character = spacing
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.resolution_u = 2
        letters = bpy.data.objects.new(name, curve)
        bpy.context.scene.collection.objects.link(letters)
        mesh = bpy.data.meshes.new_from_object(
            letters.evaluated_get(bpy.context.evaluated_depsgraph_get())
        )
        bpy.data.objects.remove(letters)
        bpy.data.curves.remove(curve)
        mesh.materials.append(self.materials[part])
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        rotation = Matrix.Identity(3)
        for axis, degrees in zip("XYZ", turn, strict=True):
            rotation = Matrix.Rotation(math.radians(degrees), 3, axis) @ rotation
        # The lettering's own axes are glTF's: across +X, up +Y, facing +Z.
        obj.matrix_world = Matrix.Translation(blender(at)) @ (GLTF_TO_BLENDER @ rotation).to_4x4()
        return obj

    def signpost(
        self, name: str, node: str, x: float, text: str, band: str, pointing: int
    ) -> bpy.types.Object:
        """`hit_<node>`: a street's wayfinding sign, `name`, standing on the pavement at the
        reference art's 56 x 160 px post from (x, 384): `text` on its `band`, over an arrow
        pointing left (-1) or right (1)."""
        lens = self.lens
        post = self.body()
        post.hull(lens.standing(x, 384, 56, 160, 0.14), "fascia")
        front = lens.depth_at(544)
        post.hull(lens.box(x + 4, 392, 48, 36, front + 0.006, 0.01), band)
        lettering = self.sign(
            f"{node}-sign",
            text,
            "fascia",
            12 * lens.metres(front),
            tuple(lens.at(x + 28, 405, front + 0.008)),
            spacing=1.2,
        )
        ends = (lens.at(x + 14, 419, front + 0.008), lens.at(x + 42, 419, front + 0.008))
        tip, tail = ends if pointing < 0 else ends[::-1]
        post.hull(
            [
                (tip.x, tip.y, tip.z),
                (tip.x - pointing * 0.03, tip.y + 0.02, tip.z),
                (tip.x - pointing * 0.03, tip.y - 0.02, tip.z),
                (tip.x - pointing * 0.01, tip.y, tip.z - 0.004),
            ],
            "fascia",
        )
        post.hull(
            limb(
                (tip.x - pointing * 0.02, tip.y, tip.z - 0.002),
                (tail.x, tail.y, tail.z - 0.002),
                0.005,
                0.005,
                4,
            ),
            "fascia",
        )
        return self.hotspot(node, post.finish(name), lettering)

    def previews(self, folder: str) -> None:
        """The room from `cam_main` (`scene.png`), with the protagonist at the content's start
        for scale, and from up and to the right (`overview.png`), to look at the set pieces off
        the game's camera. Run after the export: it swaps the materials for toon ones."""
        os.makedirs(folder, exist_ok=True)
        stage()
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(
            filepath=os.path.join(REPO, "frontend/public/models/characters/protagonist.glb")
        )
        for obj in set(bpy.data.objects) - before:
            for slot in obj.material_slots if obj.type == "MESH" else ():
                toon(slot.material)
            if obj.parent is None:
                start = self.content["start"]
                obj.location = blender(self.lens.floor(start["x"], start["y"]))
        cam = bpy.data.objects["cam_main"]
        render(os.path.join(folder, "scene.png"), cam, SCENE_WIDTH, SCENE_HEIGHT)
        overview = bpy.data.objects.new("overview", bpy.data.cameras.new("overview"))
        bpy.context.scene.collection.objects.link(overview)
        overview.data.clip_end = 400
        overview.data.lens = 24
        overview.location = blender((9, 11, 15))
        overview.rotation_euler = (
            (blender((-3, 0, -8)) - overview.location).to_track_quat("-Z", "Y").to_euler()
        )
        render(os.path.join(folder, "overview.png"), overview, SCENE_WIDTH, SCENE_HEIGHT)
