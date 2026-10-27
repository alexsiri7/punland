// The dialogue client: one turn of a conversation is one POST /dialogue/turn to the backend
// (#6), which holds the model key and answers with a canned line itself when the AI is
// unavailable or the player's turn limit is reached. Keyed by the anonymous player id.

import type { DialogueTurn } from '../domain';
import { apiBase } from './api';
import { playerId } from './player';

export interface DialogueOptions {
  base: string;
  player: string;
  fetch: typeof globalThis.fetch;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isOption = (value: unknown): boolean =>
  isObject(value) && typeof value.text === 'string' && typeof value.reaches_goal === 'boolean';

function isDialogueTurn(value: unknown): value is DialogueTurn {
  return (
    isObject(value) &&
    typeof value.line === 'string' &&
    Array.isArray(value.options) &&
    value.options.every(isOption) &&
    typeof value.goal_reached === 'boolean' &&
    typeof value.ended === 'boolean'
  );
}

export class BackendDialogue {
  private readonly options: DialogueOptions;

  constructor(options: Partial<DialogueOptions> = {}) {
    this.options = {
      base: options.base ?? apiBase(),
      player: options.player ?? playerId(),
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    };
  }

  /**
   * The character's answer to `reply`, or its opening line when `reply` is null. Null when the
   * backend can't be reached, refuses, or answers with something else.
   */
  async turn(character: string, reply: string | null): Promise<DialogueTurn | null> {
    try {
      const res = await this.options.fetch(`${this.options.base}/dialogue/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Player-Id': this.options.player },
        body: JSON.stringify({ character, reply }),
      });
      if (!res.ok) return null;
      const turn: unknown = await res.json();
      return isDialogueTurn(turn) ? turn : null;
    } catch {
      return null;
    }
  }
}
