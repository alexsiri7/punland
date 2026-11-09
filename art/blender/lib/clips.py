"""The five clips every character has (idle, walk, talk, pickup, use) for a rig built by rig.py.

Turns are angles, so they fit any biped as they are; the hips' moves are metres, so they scale
with the legs. Poses name bones a biped may not have (ears, tail); a rig without them ignores them.
"""

from dataclasses import dataclass

from .build import Rig
from .rig import Biped

#: The hip height the moves below were tuned on: the protagonist's.
PILOT_LEG = 0.62


@dataclass(frozen=True)
class Style:
    """A character's own walk; the defaults are the protagonist's.

    `stride` scales how far the legs and arms swing, `knee` how far the knees bend (below 1 is a
    stiff walk), `bounce` how far the hips bob, and `waddle` rolls the hips from side to side, in
    degrees.
    """

    stride: float = 1.0
    knee: float = 1.0
    bounce: float = 1.0
    waddle: float = 0.0


def legs(left_thigh, left_shin, left_foot, right_thigh, right_shin, right_foot):
    return {
        "thigh_l": {"turn": (left_thigh, 0, 0)},
        "shin_l": {"turn": (left_shin, 0, 0)},
        "foot_l": {"turn": (left_foot, 0, 0)},
        "thigh_r": {"turn": (right_thigh, 0, 0)},
        "shin_r": {"turn": (right_shin, 0, 0)},
        "foot_r": {"turn": (right_foot, 0, 0)},
    }


def mirrored(pose):
    """The pose with left and right swapped, turns about y and z flipped."""
    swap = {"_l": "_r", "_r": "_l"}
    out = {}
    for bone, parts in pose.items():
        name = bone[:-2] + swap[bone[-2:]] if bone[-2:] in swap else bone
        turn = parts.get("turn", (0, 0, 0))
        out[name] = {**parts, "turn": (turn[0], -turn[1], -turn[2])}
        if "move" in parts:
            mx, my, mz = parts["move"]
            out[name]["move"] = (-mx, my, mz)
    return out


# Turns are degrees about the model's own axes: +x tips a bone that hangs down backwards and one
# that points up forwards; +y turns to its left.
REST_ARMS = {
    "upper_arm_l": {"turn": (0, 0, 4)},
    "upper_arm_r": {"turn": (0, 0, -4)},
    "forearm_l": {"turn": (-6, 0, 0)},
    "forearm_r": {"turn": (-6, 0, 0)},
}


def clips(rig: Rig, biped: Biped, style: Style | None = None) -> None:
    style = style or Style()
    k = biped.leg_length / PILOT_LEG
    breathe_in = {
        **REST_ARMS,
        "chest": {"turn": (-2, 0, 0)},
        "head": {"turn": (-2, 0, 0)},
        "tail_2": {"turn": (0, 0, 8)},
        "tail_3": {"turn": (0, 0, 10)},
    }
    breathe_out = {
        **REST_ARMS,
        "chest": {"turn": (2, 0, 0)},
        "head": {"turn": (2, 0, 0)},
        "ear_r": {"turn": (0, 0, -10)},
        "tail_2": {"turn": (0, 0, -8)},
        "tail_3": {"turn": (0, 0, -10)},
    }
    rig.clip("idle", {0: breathe_in, 24: breathe_out, 48: breathe_in})

    # A stride: left foot down in front, right pushing off behind; then the right leg passes.
    stride, knee, bob = style.stride, style.knee, k * style.bounce
    contact = {
        **legs(-26 * stride, 6 * knee, -12 * stride, 22 * stride, 22 * knee, 18 * stride),
        "hips": {"move": (0, -0.035 * bob, 0), "turn": (0, 6, style.waddle)},
        "spine": {"turn": (4, -4, 0)},
        "chest": {"turn": (0, -6, 0)},
        "head": {"turn": (-3, 4, 0)},
        "upper_arm_l": {"turn": (24 * stride, 0, 4)},
        "forearm_l": {"turn": (-6, 0, 0)},
        "upper_arm_r": {"turn": (-26 * stride, 0, -4)},
        "forearm_r": {"turn": (-24, 0, 0)},
        "tail_1": {"turn": (18, 0, 10)},
        "tail_2": {"turn": (0, 0, -6)},
    }
    passing = {
        **legs(4 * stride, 4 * knee, -4 * stride, -14 * stride, 60 * knee, 8 * stride),
        "hips": {"move": (0, 0.01 * bob, 0)},
        "spine": {"turn": (5, 0, 0)},
        "head": {"turn": (-3, 0, 0)},
        **REST_ARMS,
        "tail_1": {"turn": (22, 0, 0)},
        "tail_2": {"turn": (0, 0, 6)},
    }
    rig.clip(
        "walk", {0: contact, 5: passing, 10: mirrored(contact), 15: mirrored(passing), 20: contact}
    )

    gesture = {
        **REST_ARMS,
        "upper_arm_r": {"turn": (-30, 0, -10)},
        "forearm_r": {"turn": (-60, 0, 0)},
        "hand_r": {"turn": (0, 0, 0)},
    }
    rig.clip(
        "talk",
        {
            0: {**gesture, "head": {"turn": (-3, 0, 0)}},
            9: {
                **gesture,
                "head": {"turn": (4, 4, 0)},
                "forearm_r": {"turn": (-70, 0, 0)},
                "ear_l": {"turn": (0, 0, 8)},
            },
            18: {**gesture, "head": {"turn": (-2, -3, 0)}, "forearm_r": {"turn": (-55, 0, 0)}},
            27: {**gesture, "head": {"turn": (3, 2, 0)}, "forearm_r": {"turn": (-68, 0, 0)}},
            36: {**gesture, "head": {"turn": (-3, 0, 0)}},
        },
    )

    # Crouch and reach: hips down as far as the bent knees take them, the feet kept flat.
    reach = {
        **legs(-30, 58, -28, -30, 58, -28),
        "hips": {"move": (0, -0.065 * k, 0)},
        "spine": {"turn": (22, 0, 0)},
        "chest": {"turn": (14, 0, 0)},
        "head": {"turn": (-14, 0, 0)},
        "upper_arm_r": {"turn": (-45, 0, 0)},
        "forearm_r": {"turn": (-10, 0, 0)},
        "upper_arm_l": {"turn": (10, 0, 6)},
    }
    rig.clip("pickup", {0: REST_ARMS, 7: reach, 15: REST_ARMS})
    use = {
        **REST_ARMS,
        "chest": {"turn": (4, 0, 0)},
        "upper_arm_r": {"turn": (-75, 0, -6)},
        "forearm_r": {"turn": (-20, 0, 0)},
    }
    rig.clip("use", {0: REST_ARMS, 7: use, 15: REST_ARMS})
