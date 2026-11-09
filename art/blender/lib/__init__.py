"""Helpers the Blender source scripts in art/blender/ share (docs/ARCHITECTURE.md, section 8).

Every script authors in glTF axes, the ones the asset contract and the game use: metres, +Y up,
the model facing +Z, so a character's left is +X. `blender()` turns such a point into Blender's
+Z-up axes, and the glTF exporter turns it back.
"""
