"""One material per part, in its base tone only (asset contract, "Materials").

No textures, metallic 0, roughness 1: the renderer's two-step toon ramp makes the shade tone.
"""

import bpy


def linear(hex_colour: str) -> tuple[float, float, float, float]:
    """An sRGB `#RRGGBB` as linear RGBA, as Blender's colours and glTF's baseColorFactor hold it."""

    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    rgb = [int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return (*(channel(c) for c in rgb), 1.0)


def material(name: str, hex_colour: str) -> bpy.types.Material:
    """The part's material, named after it, with `hex_colour` as its base colour."""
    mat = bpy.data.materials.new(name)
    bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = linear(hex_colour)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 1.0
    mat.diffuse_color = linear(hex_colour)
    return mat
