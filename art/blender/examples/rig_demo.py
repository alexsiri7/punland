"""A throwaway biped, not shipped as a model: short, a big head, no ears, no tail, digitigrade
legs and a waddle. It shows lib/rig.py and lib/clips.py fit proportions other than the
protagonist's.

    blender -b --factory-startup --python art/blender/examples/rig_demo.py -- \\
        --out /tmp/rig_demo.glb [--previews docs/screenshots/blender/rig-demo]

Points are in glTF axes, metres: +Y up, facing +Z, its left +X.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.build import Body, limb, ring
from lib.clips import Style, clips
from lib.export import arguments, empty_scene, export_glb
from lib.palette import material
from lib.rig import SIDES, Biped, anchors, armature, mirror, torso

COLOURS = {"skin": "#6E8F5A", "pale": "#D9C9A0", "coat": "#9E5A5A", "eyes": "#16161A"}

BIPED = Biped(
    spine=(
        (0, 0.5, 0),
        (0, 0.58, 0),
        (0, 0.68, 0.01),
        (0, 0.78, 0.02),
        (0, 0.81, 0.02),
        (0, 1.1, 0.02),
    ),
    arm=((0.13, 0.76, 0.02), (0.17, 0.62, 0.02), (0.18, 0.5, 0.04), (0.18, 0.43, 0.05)),
    leg=(
        (0.08, 0.5, 0),
        (0.08, 0.32, 0.07),
        (0.08, 0.14, -0.05),
        (0.08, 0.03, 0.03),
        (0.08, 0.01, 0.12),
    ),
    back=(0, 0.66, -0.15),
)


def build_body(body: Body) -> None:
    trunk = [(0.48, 0.13, 0.1), (0.6, 0.15, 0.12), (0.72, 0.13, 0.1), (0.8, 0.08, 0.07)]
    body.hull([p for y, w, d in trunk for p in ring((0, y, 0.01), w, d)], "coat", torso(BIPED))
    head = [
        p
        for y, w in ((0.8, 0.12), (0.92, 0.19), (1.06, 0.17), (1.1, 0.1))
        for p in ring((0, y, 0.03), w, w * 0.9)
    ]
    body.hull(head, "skin", "head")
    body.hull(ring((0, 0.88, 0.2), 0.08, 0.02) + ring((0, 0.82, 0.17), 0.06, 0.02), "pale", "head")
    for x in SIDES.values():
        body.hull(
            limb((0.065 * x, 0.96, 0.17), (0.065 * x, 0.96, 0.2), 0.025, 0.02), "eyes", "head"
        )
    for side, x in SIDES.items():
        shoulder, elbow, wrist, tip = (mirror(p, x) for p in BIPED.arm)
        body.hull(limb(shoulder, elbow, 0.04, 0.035), "coat", f"upper_arm_{side}")
        body.hull(limb(elbow, wrist, 0.035, 0.03), "skin", f"forearm_{side}")
        body.hull(limb(wrist, tip, 0.035, 0.03), "skin", f"hand_{side}")
        hip, knee, hock, ball, toe = (mirror(p, x) for p in BIPED.leg)
        body.hull(limb(hip, knee, 0.06, 0.045), "skin", f"thigh_{side}")
        body.hull(limb(knee, hock, 0.04, 0.03), "skin", f"shin_{side}")
        body.hull(limb(hock, ball, 0.03, 0.03), "skin", f"foot_{side}")
        body.hull(limb(ball, toe, 0.035, 0.02, 4), "pale", f"toe_{side}")


def main() -> None:
    args = arguments(__doc__.splitlines()[0])
    empty_scene()
    materials = {part: material(part, hex_colour) for part, hex_colour in COLOURS.items()}
    rig = armature("rig_demo", BIPED)
    body = Body(materials)
    build_body(body)
    body.finish("rig_demo-body", rig.object)
    anchors(rig, BIPED)
    clips(rig, BIPED, Style(stride=0.7, waddle=8))
    export_glb(os.path.abspath(args.out))
    if args.previews:
        from lib.preview import previews

        previews(rig, os.path.abspath(args.previews), BIPED.height)


main()
