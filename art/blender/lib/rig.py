"""A biped's skeleton from its joints: the armature, the three anchors the asset contract wants,
and the torso's skin. Points are in glTF axes (see __init__.py).

A character describes its joints at rest as a `Biped`, its limbs for its left side (+X); the rig
mirrors them to the right. Every biped gets the same bone names, so the clips in clips.py fit it.
"""

from dataclasses import dataclass

from .build import Point, Rig, blend

SIDES = {"l": 1, "r": -1}

#: The root bone's length; it carries no vertices, only the rest of the skeleton.
ROOT = 0.12


@dataclass(frozen=True)
class Biped:
    """A biped's joints at rest.

    `spine`: the hips, spine, chest, neck and head bones' starts, then the crown.
    `arm`: shoulder, elbow, wrist, fingertip.
    `leg`: hip, knee, ankle, toe (plantigrade); or hip, knee, hock, ball, toe (digitigrade).
    `back`: where `anchor_back` goes, for what the character carries on its back.
    `ears`: an ear's base and tip, if it has ears.
    `tail`: the tail's joints from its root, if it has a tail; not mirrored.
    `hand`: where `anchor_hand_r` goes, given on the left; by default the middle of the hand.
    """

    spine: tuple[Point, Point, Point, Point, Point, Point]
    arm: tuple[Point, Point, Point, Point]
    leg: tuple[Point, ...]
    back: Point
    ears: tuple[Point, Point] | None = None
    tail: tuple[Point, ...] | None = None
    hand: Point | None = None

    def __post_init__(self):
        if len(self.leg) not in (4, 5):
            raise ValueError(f"a leg has 4 points (plantigrade) or 5 (digitigrade), not {self.leg}")

    @property
    def digitigrade(self) -> bool:
        return len(self.leg) == 5

    @property
    def height(self) -> float:
        """To the crown, or the ear tips if they are higher."""
        return max(self.spine[5][1], self.ears[1][1] if self.ears else 0)

    @property
    def leg_length(self) -> float:
        """The hip joint's height."""
        return self.leg[0][1]


def mirror(p: Point, x: int) -> Point:
    """`p`, given on the left, on the side `x` (1 left, -1 right)."""
    return (p[0] * x, p[1], p[2])


def bones(biped: Biped) -> list[tuple[str, Point, Point, str | None]]:
    """The armature's bones, (name, head, tail, parent), parents first."""
    out: list[tuple[str, Point, Point, str | None]] = [("root", (0, 0, 0), (0, 0, ROOT), None)]
    parent = "root"
    for i, name in enumerate(("hips", "spine", "chest", "neck", "head")):
        out.append((name, biped.spine[i], biped.spine[i + 1], parent))
        parent = name
    if biped.ears:
        base, tip = biped.ears
        out += [(f"ear_{s}", mirror(base, x), mirror(tip, x), "head") for s, x in SIDES.items()]
    leg = ("thigh", "shin", "foot", "toe") if biped.digitigrade else ("thigh", "shin", "foot")
    for s, x in SIDES.items():
        out += _chain(("upper_arm", "forearm", "hand"), biped.arm, s, x, "chest")
        out += _chain(leg, biped.leg, s, x, "hips")
    if biped.tail:
        tail = biped.tail
        out += [
            (f"tail_{i + 1}", tail[i], tail[i + 1], f"tail_{i}" if i else "hips")
            for i in range(len(tail) - 1)
        ]
    return out


def _chain(names, points, side: str, x: int, parent: str):
    out = []
    for i, name in enumerate(names):
        bone = f"{name}_{side}"
        out.append((bone, mirror(points[i], x), mirror(points[i + 1], x), parent))
        parent = bone
    return out


def armature(name: str, biped: Biped) -> Rig:
    return Rig(name, bones(biped))


def anchors(rig: Rig, biped: Biped) -> None:
    """`anchor_head` a little over the top of the head (or ears), `anchor_hand_r` in the right
    hand, `anchor_back` on the back. Call it after the body is skinned to `rig`."""
    hand = biped.hand or tuple((a + b) / 2 for a, b in zip(biped.arm[2], biped.arm[3], strict=True))
    rig.anchor("anchor_head", (0, biped.height + 0.08, biped.spine[4][2]), "head")
    rig.anchor("anchor_hand_r", mirror(hand, -1), "hand_r")
    rig.anchor("anchor_back", biped.back, "chest")


def torso(biped: Biped, soft: float = 0.05):
    """The trunk's skin: hips, then spine, then chest, handed over where those bones start."""
    return blend((0, "hips"), (biped.spine[1][1], "spine"), (biped.spine[2][1], "chest"), soft=soft)
