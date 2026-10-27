import type { DialogueTurn } from '../../domain';

/** The backend's side of a conversation (services/dialogue.ts). */
export interface DialogueBackend {
  /** The character's answer to `reply`, or its opening line for null; null when there is no answer. */
  turn(character: string, reply: string | null): Promise<DialogueTurn | null>;
}

export interface DialoguePanel {
  readonly element: HTMLElement;
  /** Starts a conversation with `character`, shown as `name`. */
  open(character: string, name: string): void;
  /** Ends the conversation; an answer still on its way is dropped. Doesn't call `left`. */
  close(): void;
}

/** Matches the backend's limit on a reply (dialogue.py, REPLY_MAX). */
const REPLY_MAX = 300;

/**
 * The conversation panel (dialogue spec): the character's line, three numbered suggested
 * replies, a field to type one's own, and Leave. The backend answers every turn, with a canned
 * line of the character's when the AI is unavailable or the turn limit is reached; a reply that
 * reaches the conversation's goal goes to `goalReached`. Keys 1 to 3 pick a reply, Escape leaves;
 * leaving, with Escape or Leave, goes to `left`.
 */
export function createDialoguePanel(
  doc: Document,
  backend: DialogueBackend,
  on: { goalReached(character: string): void; left(): void },
): DialoguePanel {
  const panel = doc.createElement('section');
  panel.className = 'dialogue';
  panel.setAttribute('role', 'dialog');
  panel.hidden = true;
  const name = doc.createElement('h2');
  name.className = 'dialogue-name';
  const said = doc.createElement('p');
  said.className = 'dialogue-said';
  const line = doc.createElement('p');
  line.className = 'dialogue-line';
  line.setAttribute('aria-live', 'polite');
  const options = doc.createElement('ol');
  options.className = 'dialogue-options';
  const own = doc.createElement('form');
  own.className = 'dialogue-own';
  const field = doc.createElement('input');
  field.type = 'text';
  field.maxLength = REPLY_MAX;
  field.autocomplete = 'off';
  field.placeholder = 'Or say something of your own';
  field.setAttribute('aria-label', 'Your reply');
  const send = doc.createElement('button');
  send.type = 'submit';
  send.textContent = 'Say';
  own.append(field, send);
  const leave = doc.createElement('button');
  leave.type = 'button';
  leave.className = 'dialogue-leave';
  leave.textContent = 'Leave';
  panel.append(name, said, line, options, own, leave);

  let character = '';
  // Counts conversations, so an answer to one that has ended is dropped.
  let conversation = 0;

  const close = () => {
    conversation += 1;
    panel.hidden = true;
  };

  const answered = (turn: DialogueTurn | null) => {
    line.textContent = turn?.line ?? `${name.textContent} doesn't answer.`;
    if (turn?.goal_reached) on.goalReached(character);
    const over = !turn || turn.ended;
    own.hidden = over;
    options.replaceChildren(
      ...(over ? [] : turn.options).map((option, i) => {
        const button = doc.createElement('button');
        button.type = 'button';
        const number = doc.createElement('span');
        number.className = 'dialogue-number';
        number.setAttribute('aria-hidden', 'true');
        number.textContent = String(i + 1);
        button.append(number, option.text);
        button.addEventListener('click', () => void reply(option.text));
        const item = doc.createElement('li');
        item.append(button);
        return item;
      }),
    );
    field.disabled = false;
    send.disabled = false;
    (options.querySelector('button') ?? (over ? leave : field)).focus();
  };

  const reply = async (text: string | null) => {
    const asked = conversation;
    said.textContent = text ?? '';
    said.hidden = text === null;
    line.textContent = '…';
    options.replaceChildren();
    field.disabled = true;
    send.disabled = true;
    const turn = await backend.turn(character, text);
    if (asked === conversation) answered(turn);
  };

  own.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = field.value.trim();
    if (!text) return;
    field.value = '';
    void reply(text);
  });
  const leaveConversation = () => {
    close();
    on.left();
  };
  leave.addEventListener('click', leaveConversation);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') leaveConversation();
    else if (event.target !== field && /^[1-3]$/.test(event.key)) {
      options.querySelectorAll('button')[Number(event.key) - 1]?.click();
    }
  });

  return {
    element: panel,
    open(id, title) {
      close();
      character = id;
      name.textContent = title;
      panel.setAttribute('aria-label', title);
      panel.hidden = false;
      own.hidden = false;
      void reply(null);
    },
    close,
  };
}
