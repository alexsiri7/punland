"""Preview renders of a model, to look at before calling it done: Eevee with a two-step toon
ramp standing in for the game's (frontend/src/presentation/three3d/look.ts), lit from the upper
left as the game lights it. Run after the export: it swaps the materials for toon ones."""

import json
import math
import os

import bpy
from mathutils import Vector

from .build import Rig, blender
from .palette import linear, material

SIZE = 512
#: The game's key light comes from (-6, 9, 2), glTF axes (look.ts).
KEY = (-6, 9, 2)
#: The share of the base tone the shade side keeps: the ambient plus the key light's ramp step
#: (look.ts).
SHADE = 0.25 + 0.75 * 0.52
UI_GROUND = "#1C1D22"
PAVEMENT = "#5E5A62"


def toon(mat: bpy.types.Material) -> None:
    """Makes `mat` its base tone where the key light reaches and SHADE of it where it doesn't."""
    tree = mat.node_tree
    bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    base = tuple(bsdf.inputs["Base Color"].default_value)
    for node in list(tree.nodes):
        tree.nodes.remove(node)
    diffuse = tree.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
    to_rgb = tree.nodes.new("ShaderNodeShaderToRGB")
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].color = (SHADE, SHADE, SHADE, 1)
    ramp.color_ramp.elements[1].position = 0.02
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    tint = tree.nodes.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.blend_type = "MULTIPLY"
    tint.inputs["Factor"].default_value = 1.0
    tint.inputs["B"].default_value = base
    emission = tree.nodes.new("ShaderNodeEmission")
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    tree.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], tint.inputs["A"])
    tree.links.new(tint.outputs["Result"], emission.inputs["Color"])
    tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])


def stage() -> None:
    """Eevee, the key light, a backdrop only the camera sees, and toon materials."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 16
    scene.view_settings.view_transform = "Standard"
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("backdrop")
    scene.world = world
    tree = world.node_tree
    for node in list(tree.nodes):
        tree.nodes.remove(node)
    dark = tree.nodes.new("ShaderNodeBackground")
    dark.inputs["Color"].default_value = (0, 0, 0, 1)
    seen = tree.nodes.new("ShaderNodeBackground")
    seen.inputs["Color"].default_value = linear(UI_GROUND)
    camera_ray = tree.nodes.new("ShaderNodeLightPath")
    mix = tree.nodes.new("ShaderNodeMixShader")
    out = tree.nodes.new("ShaderNodeOutputWorld")
    tree.links.new(camera_ray.outputs["Is Camera Ray"], mix.inputs["Fac"])
    tree.links.new(dark.outputs["Background"], mix.inputs[1])
    tree.links.new(seen.outputs["Background"], mix.inputs[2])
    tree.links.new(mix.outputs["Shader"], out.inputs["Surface"])

    sun = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    sun.data.energy = 3.0
    sun.data.angle = 0.0
    sun.rotation_euler = (-blender(KEY)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)
    for mat in bpy.data.materials:
        toon(mat)


def ground(size: float = 4.0) -> bpy.types.Object:
    mesh = bpy.data.meshes.new("ground")
    h = size / 2
    mesh.from_pydata([(-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0)], [], [(0, 1, 2, 3)])
    mat = material("ground", PAVEMENT)
    toon(mat)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new("ground", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def camera(
    name: str, look_from: Vector, look_at: Vector, ortho: float | None = None
) -> bpy.types.Object:
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = look_from
    cam.rotation_euler = (look_at - look_from).to_track_quat("-Z", "Y").to_euler()
    if ortho is not None:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    return cam


def render(path: str, cam: bpy.types.Object, width: int = SIZE, height: int = SIZE) -> None:
    scene = bpy.context.scene
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def turnaround(rig: Rig, folder: str, height: float) -> None:
    """Front, three-quarter, side and back, the rig turned under a fixed camera and light."""
    centre = blender((0, height / 2, 0))
    cam = camera(
        "turnaround",
        centre + blender((0, 0.25, 6)),
        centre + blender((0, 0.05, 0)),
        ortho=height * 1.18,
    )
    idle = bpy.data.actions["idle"]
    rig.play(idle, 0)
    for view, degrees in (("front", 0), ("three-quarter", -40), ("side", -90), ("back", 180)):
        rig.object.rotation_euler = (0, 0, math.radians(degrees))
        render(os.path.join(folder, f"turnaround-{view}.png"), cam)
    rig.object.rotation_euler = (0, 0, 0)


def walk(rig: Rig, folder: str, height: float, frames: int = 4) -> None:
    """`frames` evenly spaced frames of the walk, seen three-quarter on."""
    centre = blender((0, height / 2, 0))
    cam = camera(
        "walk", centre + blender((0, 0.25, 6)), centre + blender((0, 0.05, 0)), ortho=height * 1.18
    )
    action = bpy.data.actions["walk"]
    start, end = action.frame_range
    rig.object.rotation_euler = (0, 0, math.radians(-60))
    for i in range(frames):
        rig.play(action, start + (end - start) * i / frames)
        render(os.path.join(folder, f"walk-{i + 1}.png"), cam)
    rig.object.rotation_euler = (0, 0, 0)


def in_scene(rig: Rig, folder: str, repo: str, room: str) -> None:
    """The rig at the room's start point, seen from the room's `cam_main` as the game sees it."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(
        filepath=os.path.join(repo, "frontend/public/models/scenes", f"{room}.glb")
    )
    imported = set(bpy.data.objects) - before
    for mat in bpy.data.materials:
        if mat.node_tree and any(node.type == "BSDF_PRINCIPLED" for node in mat.node_tree.nodes):
            toon(mat)
    cam = next(obj for obj in imported if obj.type == "CAMERA")
    with open(os.path.join(repo, "frontend/src/content/rooms", f"{room}.json")) as file:
        start = json.load(file)["start"]
    rig.play(bpy.data.actions["idle"], 0)
    rig.object.location = floor_point(cam, start["x"], start["y"])
    render(os.path.join(folder, f"scene-{room}.png"), cam, 2 * SIZE, SIZE)
    rig.object.location = (0, 0, 0)
    for obj in imported:
        obj.hide_render = True


def floor_point(cam: bpy.types.Object, x: float, y: float) -> Vector:
    """Where the ray from `cam` through the scene pixel (x, y) of 1280 x 640 meets the ground."""
    cam.data.sensor_fit = "VERTICAL"
    tan = math.tan(cam.data.angle_y / 2)
    local = Vector(((2 * x / 1280 - 1) * tan * 2, (1 - 2 * y / 640) * tan, -1))
    origin = cam.matrix_world.translation
    ray = cam.matrix_world.to_3x3() @ local
    return origin + ray * (-origin.z / ray.z)


def previews(rig: Rig, folder: str, height: float, room: str = "opening") -> None:
    os.makedirs(folder, exist_ok=True)
    repo = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )
    stage()
    floor = ground()
    turnaround(rig, folder, height)
    walk(rig, folder, height)
    floor.hide_render = True
    in_scene(rig, folder, repo, room)
