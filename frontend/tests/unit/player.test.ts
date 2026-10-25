import { beforeEach, describe, expect, it } from 'vitest';
import { PLAYER_KEY, playerId } from '../../src/services/player';

describe('playerId', () => {
  beforeEach(() => localStorage.clear());

  it('makes up an id once and keeps it in this browser', () => {
    let made = 0;
    const newId = () => `id-${++made}`;
    const id = playerId(localStorage, newId);
    expect(playerId(localStorage, newId)).toBe(id);
    expect(localStorage.getItem(PLAYER_KEY)).toBe(id);
    expect(made).toBe(1);
  });

  it('keeps one id for the page load when storage is blocked', () => {
    expect(playerId(null)).toBe(playerId(null));
  });
});
