"""The scene a script builds in, and the glb export the asset contract wants.

The contract is docs/ARCHITECTURE.md, section 8.
"""

import argparse
import sys

import bpy


def arguments(description: str) -> argparse.Namespace:
    """The script's own arguments: the ones after `--` on Blender's command line."""
    parser = argparse.ArgumentParser(
        prog=f"blender -b --factory-startup --python {sys.argv[sys.argv.index('--python') + 1]} --",
        description=description,
    )
    parser.add_argument("--out", required=True, help="the glb to write")
    parser.add_argument("--previews", help="a folder to render the preview images into")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def empty_scene() -> None:
    """Removes the factory startup's cube, camera and light."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            collection.remove(block)
    bpy.context.scene.render.fps = 24


def export_glb(path: str) -> None:
    """Writes every object in the scene as a glb: untextured, skinned with at most four joints a
    vertex, every action a clip named after it, and no cameras, lights or extensions."""
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_vertex_color="NONE",
        export_attributes=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_skins=True,
        export_influence_nb=4,
        export_all_influences=False,
        export_def_bones=False,
        export_leaf_bone=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_range=False,
        export_anim_slide_to_zero=True,
        export_reset_pose_bones=True,
        export_rest_position_armature=True,
        export_morph=False,
        export_draco_mesh_compression_enable=False,
    )
