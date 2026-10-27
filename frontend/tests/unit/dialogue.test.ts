import { describe, expect, it } from 'vitest';
import { BackendDialogue } from '../../src/services/dialogue';

const turn = { line: 'Evening.', options: [{ text: 'Hi.', reaches_goal: false }], goal_reached: false, ended: false };

describe('BackendDialogue', () => {
  it('posts the turn for the player and returns the answer', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const dialogue = new BackendDialogue({
      base: 'https://api.test',
      player: 'p1',
      fetch: async (url, init) => {
        calls.push([String(url), init]);
        return new Response(JSON.stringify(turn), { status: 200 });
      },
    });
    expect(await dialogue.turn('bartender', null)).toEqual(turn);
    expect(calls).toEqual([
      [
        'https://api.test/dialogue/turn',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Player-Id': 'p1' },
          body: JSON.stringify({ character: 'bartender', reply: null }),
        },
      ],
    ]);
  });

  it('answers null when the backend is down, refuses or answers something else', async () => {
    const answering = (respond: () => Promise<Response>) =>
      new BackendDialogue({ base: '', player: 'p1', fetch: respond }).turn('bartender', 'Hi.');
    expect(await answering(() => Promise.reject(new TypeError('offline')))).toBeNull();
    expect(await answering(async () => new Response('', { status: 404 }))).toBeNull();
    expect(await answering(async () => new Response('{not json', { status: 200 }))).toBeNull();
    const malformed = JSON.stringify({ ...turn, options: 'no' });
    expect(await answering(async () => new Response(malformed, { status: 200 }))).toBeNull();
  });
});
