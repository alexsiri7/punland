"""The conversation rules on their own: prepare and conclude, without the app or a database."""

from punland_api.characters import Character
from punland_api.conversation import (
    HISTORY_LIMIT,
    Answer,
    Conversation,
    Option,
    conclude,
    parse_answer,
    prepare,
)

BOUNCER = Character(
    id="bouncer", name="Bouncer", sheet="You guard the stairs.", canned="Move along.", goal="X"
)
COP = Character(id="cop", name="Cop", sheet="You walk the beat.", canned="Move along.", goal=None)
HM = Answer(line="Hm.", options=("One.", "Two.", "Three."), goal_reached=False)
YES = Answer(line="Fine.", options=("One.", "Two.", "Three."), goal_reached=True)


def turn(
    character: Character, conv: Conversation, reply: str | None, answer: Answer = HM
) -> tuple[Conversation, list[str], bool]:
    after, outcome = conclude(conv, prepare(character, conv, reply), answer)
    return after, [o.text for o in outcome.options if o.reaches_goal], outcome.goal_reached


def test_goal_options_escalate() -> None:
    conv, _, _ = turn(BOUNCER, Conversation(), None)
    counts = []
    for _ in range(6):
        conv, reaching, _ = turn(BOUNCER, conv, "Hello?")
        counts.append(len(reaching))
    assert counts == [0, 0, 1, 1, 1, 3]


def test_the_reaching_options_are_the_last_ones() -> None:
    conv = Conversation(attempts=2)
    _, reaching, _ = turn(BOUNCER, conv, "Hello?")
    assert reaching == ["Three."]


def test_picking_a_reaching_option_concedes_whatever_the_model_says() -> None:
    conv = Conversation(offered=(Option("One.", False), Option("Three.", True)))
    prompt = prepare(BOUNCER, conv, " Three. ")
    assert prompt.conceding
    assert "wins you over" in prompt.messages[0]["content"]

    after, outcome = conclude(conv, prompt, HM)
    assert outcome.goal_reached and outcome.ended
    assert outcome.options == () and after.offered == ()
    assert after.goal_reached


def test_a_picked_option_that_does_not_reach_is_not_judged_by_the_model() -> None:
    conv = Conversation(offered=(Option("One.", False), Option("Three.", True)))
    _, _, reached = turn(BOUNCER, conv, "One.", YES)
    assert reached is False


def test_a_typed_reply_is_judged_by_the_model() -> None:
    conv = Conversation(offered=(Option("One.", False),))
    _, _, reached = turn(BOUNCER, conv, "I'm the band.", YES)
    assert reached is True
    _, _, reached = turn(BOUNCER, conv, "I'm the band.", HM)
    assert reached is False


def test_coming_back_is_never_judged() -> None:
    _, _, reached = turn(BOUNCER, Conversation(), None, YES)
    assert reached is False


def test_attempts_count_only_replies_while_the_goal_is_open() -> None:
    assert prepare(BOUNCER, Conversation(attempts=4), "Hi.").attempts == 5
    assert prepare(BOUNCER, Conversation(attempts=4), None).attempts == 4
    assert prepare(BOUNCER, Conversation(attempts=4, goal_reached=True), "Hi.").attempts == 4
    assert prepare(COP, Conversation(), "Hi.").attempts == 0


def test_a_reached_goal_offers_no_reaching_options() -> None:
    conv = Conversation(attempts=10, goal_reached=True)
    prompt = prepare(BOUNCER, conv, "Hi.")
    assert not prompt.goal_open and prompt.reaching == 0
    after, reaching, reached = turn(BOUNCER, conv, "Hi.", YES)
    assert reaching == [] and reached is False
    assert after.goal_reached
    assert "The cat wants you to" not in prompt.messages[0]["content"]


def test_history_keeps_the_last_turns() -> None:
    conv = Conversation()
    for i in range(HISTORY_LIMIT):
        conv, _, _ = turn(COP, conv, f"Reply {i}.")
    assert len(conv.history) == HISTORY_LIMIT
    assert conv.history[0] == {"speaker": "cat", "text": f"Reply {HISTORY_LIMIT // 2}."}
    assert conv.history[-1] == {"speaker": "character", "text": "Hm."}


def test_conclude_leaves_the_conversation_it_was_given() -> None:
    conv = Conversation()
    after, _, _ = turn(BOUNCER, conv, "Hello?")
    assert conv == Conversation()
    assert after.history == (
        {"speaker": "cat", "text": "Hello?"},
        {"speaker": "character", "text": "Hm."},
    )
    assert after.attempts == 1


def test_a_conversation_survives_its_stored_state() -> None:
    conv = Conversation(
        history=({"speaker": "cat", "text": "Hi."},),
        attempts=3,
        offered=(Option("One.", False), Option("Three.", True)),
    )
    assert Conversation.from_state(conv.to_state()) == conv


def test_parse_answer() -> None:
    raw = 'Sure: {"line": " Hm. ", "options": ["a", "b", "c", "d"], "goal_reached": true}'
    assert parse_answer(raw) == Answer(line="Hm.", options=("a", "b", "c"), goal_reached=True)
    assert parse_answer('{"line": "Hm.", "options": ["a", "b"]}') is None
    assert parse_answer('{"line": "Hm.", "options": ["a", " ", "c"]}') is None
    assert parse_answer("no json") is None
