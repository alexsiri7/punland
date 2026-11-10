"""Building a model from scratch: a flat-shaded mesh of convex hulls, skinned to an armature for a
character, its anchors, and its clips. Points and angles are in glTF axes (see __init__.py).

A convex hull of a handful of points is one angular part with flat planes, which is the look
STYLE.md asks for and what reads under the toon ramp.
"""

import math
from collections.abc import Callable, Iterable, Sequence

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

Point = Sequence[float]
#: A part's skin: one bone, or each vertex's bones and weights from its position.
Skin = str | Callable[[Vector], dict[str, float]]

#: glTF's axes in Blender's: +X stays, +Y (up) is Blender's +Z, +Z (forward) is Blender's -Y.
AXES = {"x": Vector((1, 0, 0)), "y": Vector((0, 0, 1)), "z": Vector((0, -1, 0))}


def blender(p: Point) -> Vector:
    return Vector((p[0], -p[2], p[1]))


def gltf(v: Vector) -> Vector:
    return Vector((v[0], v[2], -v[1]))


def ring(centre: Point, half_width: float, half_depth: float, chamfer: float = 0.3) -> list[Point]:
    """Eight points of a chamfered rectangle around `centre`, level (in the XZ plane)."""
    x, y, z = centre
    w, d = half_width, half_depth
    cw, cd = w * (1 - chamfer), d * (1 - chamfer)
    return [
        (x + a, y, z + b)
        for a, b in ((w, cd), (cw, d), (-cw, d), (-w, cd), (-w, -cd), (-cw, -d), (cw, -d), (w, -cd))
    ]


def symmetric(points: Iterable[Point]) -> list[Point]:
    """`points`, given on the left and on the centre line, with the left ones mirrored right."""
    return [(sx * px, py, pz) for px, py, pz in points for sx in ((1, -1) if px else (1,))]


def disc(a: Point, b: Point, radius: float, sides: int, twist: float = 0.0) -> list[Point]:
    """`sides` points round `a`, in the plane square to the line from `a` to `b`."""
    axis = (Vector(b) - Vector(a)).normalized()
    side = axis.cross(Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))).normalized()
    up = axis.cross(side)
    return [
        tuple(Vector(a) + radius * (math.cos(t) * side + math.sin(t) * up))
        for t in (twist + 2 * math.pi * i / sides for i in range(sides))
    ]


def limb(
    a: Point, b: Point, ra: float, rb: float, sides: int = 6, twist: float = 0.0
) -> list[Point]:
    """A tapered prism from `a` (radius `ra`) to `b` (radius `rb`)."""
    return disc(a, b, ra, sides, twist) + [
        tuple(p) for p in disc(b, Vector(b) + (Vector(b) - Vector(a)), rb, sides, twist)
    ]


def dome(centre: Point, rx: float, ry: float, rise: float, sides: int = 10) -> list[Point]:
    """A flat ellipse round `centre` in the XY plane, `rx` across and `ry` up, raised `rise`
    towards +Z in its middle, so it reads in facets."""
    x, y, z = centre
    return [
        (x + k * rx * math.cos(t), y + k * ry * math.sin(t), z + lift)
        for k, lift in ((1.0, 0.0), (0.6, rise))
        for t in (2 * math.pi * i / sides for i in range(sides))
    ]


def blend(
    *stops: tuple[float, str], axis: int = 1, soft: float = 0.05
) -> Callable[[Vector], dict[str, float]]:
    """A skin that hands a part from bone to bone along `axis`.

    `stops` are (where the bone starts, bone), in order.
    """

    def weights(p: Vector) -> dict[str, float]:
        out: dict[str, float] = {}
        for i, (start, bone) in enumerate(stops):
            end = stops[i + 1][0] if i + 1 < len(stops) else math.inf
            lo = 1.0 if i == 0 else min(1.0, max(0.0, (p[axis] - start + soft) / (2 * soft)))
            hi = 1.0 if end == math.inf else min(1.0, max(0.0, (end + soft - p[axis]) / (2 * soft)))
            if min(lo, hi) > 0:
                out[bone] = min(lo, hi)
        return out

    return weights


class Body:
    """One mesh, built part by part, each part a hull in a named material, skinned to bones if the
    mesh has an armature."""

    def __init__(self, materials: dict[str, bpy.types.Material]):
        self.materials = materials
        self.slots: list[str] = []
        self.bones: list[str] = []
        self.bm = bmesh.new()
        self.deform = self.bm.verts.layers.deform.verify()

    def hull(
        self, points: Iterable[Point], part: str, skin: Skin | None = None
    ) -> list[bmesh.types.BMFace]:
        """Adds the convex hull of `points` as a part; gives its faces, for `on()`."""
        verts = [self.bm.verts.new(blender(p)) for p in points]
        out = bmesh.ops.convex_hull(self.bm, input=verts, use_existing_faces=False)
        unused = {
            v
            for v in out["geom_interior"] + out["geom_unused"]
            if isinstance(v, bmesh.types.BMVert)
        }
        bmesh.ops.delete(self.bm, geom=list(unused), context="VERTS")
        faces = [f for f in out["geom"] if isinstance(f, bmesh.types.BMFace)]
        self._paint(faces, part)
        if skin is None:
            return faces
        for vert in {v for f in faces for v in f.verts}:
            weights = {skin: 1.0} if isinstance(skin, str) else skin(gltf(vert.co))
            total = sum(weights.values())
            for bone, weight in weights.items():
                if bone not in self.bones:
                    self.bones.append(bone)
                vert[self.deform][self.bones.index(bone)] = weight / total
        return faces

    def plate(self, points: Sequence[Point], part: str, facing: Point) -> bmesh.types.BMFace:
        """A flat polygon through `points`, which may be concave, turned towards `facing`."""
        face = self.bm.faces.new([self.bm.verts.new(blender(p)) for p in points])
        face.normal_update()
        if face.normal.dot(blender(facing)) < 0:
            face.normal_flip()
        self._paint([face], part)
        return face

    def _paint(self, faces: list[bmesh.types.BMFace], part: str) -> None:
        if part not in self.slots:
            self.slots.append(part)
        for face in faces:
            face.material_index = self.slots.index(part)
            face.smooth = False

    @staticmethod
    def on(
        faces: list[bmesh.types.BMFace], x: float, y: float, lift: float, back: bool = False
    ) -> Point:
        """The point of the part's surface (its `faces`) seen straight from the front (or back) at
        (`x`, `y`), raised `lift` off it: for a detail laid on a part, like a decal."""
        tree = BVHTree.FromPolygons([tuple(v.co) for f in faces for v in f.verts], _corners(faces))
        start = blender((x, y, -2.0 if back else 2.0))
        hit, _normal, _index, _distance = tree.ray_cast(start, blender((0, 0, 1 if back else -1)))
        if hit is None:
            raise ValueError(f"nothing at ({x}, {y}) to lay a detail on")
        z = gltf(hit).z
        return (x, y, z - lift if back else z + lift)

    def decal(
        self,
        faces,
        outline: Sequence[tuple[float, float]],
        depth: float,
        part: str,
        skin: Skin,
        back: bool = False,
    ):
        """A thin part laid on `faces` over the (x, y) `outline`, standing `depth` proud."""
        points = []
        for x, y in outline:
            points.append(self.on(faces, x, y, depth, back))
            points.append(self.on(faces, x, y, -0.01, back))
        return self.hull(points, part, skin)

    def finish(self, name: str, armature: bpy.types.Object | None = None) -> bpy.types.Object:
        """The mesh as an object, skinned to `armature` if it has one, at the origin with no
        transform."""
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for part in self.slots:
            mesh.materials.append(self.materials[part])
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        if armature is None:
            return obj
        for bone in self.bones:
            obj.vertex_groups.new(name=bone)
        obj.parent = armature
        obj.modifiers.new("armature", "ARMATURE").object = armature
        return obj


def _corners(faces: list[bmesh.types.BMFace]) -> list[tuple[int, ...]]:
    corners, start = [], 0
    for face in faces:
        corners.append(tuple(range(start, start + len(face.verts))))
        start += len(face.verts)
    return corners


class Rig:
    """An armature of named bones, its anchors, and its clips."""

    def __init__(self, name: str, bones: Sequence[tuple[str, Point, Point, str | None]]):
        """`bones` are (name, head, tail, parent), parents first."""
        data = bpy.data.armatures.new(name)
        self.object = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(self.object)
        bpy.context.view_layer.objects.active = self.object
        bpy.ops.object.mode_set(mode="EDIT")
        for bone, head, tail, parent in bones:
            edit = data.edit_bones.new(bone)
            edit.head, edit.tail = blender(head), blender(tail)
            edit.roll = 0.0
            if parent is not None:
                edit.parent = data.edit_bones[parent]
        bpy.ops.object.mode_set(mode="OBJECT")
        for bone in self.object.pose.bones:
            bone.rotation_mode = "QUATERNION"

    def anchor(self, name: str, at: Point, bone: str) -> None:
        """An empty at `at` that moves with `bone`."""
        empty = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(empty)
        empty.parent = self.object
        empty.parent_type = "BONE"
        empty.parent_bone = bone
        bpy.context.view_layer.update()
        empty.matrix_world = Matrix.Translation(blender(at))

    def pose(self, pose: dict[str, dict[str, Point]]) -> None:
        """Poses the rig, every bone not in `pose` at rest. A bone's `turn` is its rotation in
        degrees about the model's own x, y and z (glTF axes, applied in that order) at rest, and
        its `move` its offset in metres along them."""
        for bone in self.object.pose.bones:
            rest = bone.bone.matrix_local.to_3x3()
            turn = pose.get(bone.name, {}).get("turn", (0, 0, 0))
            rotation = Matrix.Identity(3)
            for axis, degrees in zip("xyz", turn, strict=True):
                rotation = Matrix.Rotation(math.radians(degrees), 3, AXES[axis]) @ rotation
            bone.rotation_quaternion = (rest.inverted() @ rotation @ rest).to_quaternion()
            bone.location = rest.inverted() @ blender(
                pose.get(bone.name, {}).get("move", (0, 0, 0))
            )

    def clip(self, name: str, keys: dict[int, dict[str, dict[str, Point]]]) -> bpy.types.Action:
        """The clip `name`: the rig posed at each key frame (24 fps), every bone keyed at each.
        A looping clip ends on its first pose."""
        action = bpy.data.actions.new(name)
        animation = self.object.animation_data or self.object.animation_data_create()
        animation.action = action
        for frame, pose in sorted(keys.items()):
            self.pose(pose)
            for bone in self.object.pose.bones:
                bone.keyframe_insert("rotation_quaternion", frame=frame)
                bone.keyframe_insert("location", frame=frame)
        action.use_frame_range = True
        action.frame_range = (min(keys), max(keys))
        action.use_fake_user = True
        animation.action = None
        self.pose({})
        return action

    def play(self, action: bpy.types.Action, frame: float) -> None:
        """Shows `action` at `frame` (for previews)."""
        animation = self.object.animation_data
        animation.action = action
        if action.slots:
            animation.action_slot = action.slots[0]
        bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
