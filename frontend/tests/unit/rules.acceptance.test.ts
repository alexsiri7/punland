// @vitest-environment node
// No DOM in this file: the rules must play the game without a renderer or a document.
import { describe, expect, it } from 'vitest';
import { type Command, load, play } from './support/modules';

// Acceptance tests for openspec/specs/architecture/spec.md, requirement "Rules as commands and
// events". The commands and events are in docs/ARCHITECTURE.md, section 4.

const BARTENDER_TAKES_FLYER = 'I slide the flyer over. The bartender pins it up behind the bar.';
const GUITAR_NO_USE = "My guitar's in enough pieces already.";

async function newGame() {
  const { loadContent } = await load('content');
  const { newGame } = await load('domain');
  const content = loadContent();
  return { content, state: newGame(content) };
}

const activate = (hotspot: string): Command => ({ type: 'activate', hotspot });
const select = (item: string): Command => ({ type: 'select', item });

describe('Rules as commands and events', () => {
  // Requirement: Rules as commands and events. Every player action is a command the rules apply
  // to the game state, giving the new state and events, without a renderer or the DOM.
  it('Playing without a renderer', async () => {
    const { content, state } = await newGame();
    const played = await play(content, state, [
      activate('flyer'),
      activate('door'),
      select('flyer'),
      activate('bartender'),
    ]);
    expect(played.state.room).toBe('pub');
    expect(played.state.inventory.carried).not.toContain('flyer');
    expect(played.state.inventory.pickedUp).toContain('flyer');
    expect(played.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'pickedUp', item: 'flyer', hotspot: 'flyer' }),
        expect.objectContaining({ type: 'roomChanged', room: 'pub' }),
        expect.objectContaining({ type: 'said', line: BARTENDER_TAKES_FLYER }),
      ]),
    );
  });

  // Requirement: Rules as commands and events. Using an item on a hotspot gives the hotspot's
  // response when it accepts the item, and the item's refusal (`noUse`) when it does not.
  it('Use X on Y', async () => {
    const game = await newGame();
    const inPub = await play(game.content, game.state, [activate('flyer'), activate('door')]);
    const refused = await play(game.content, inPub.state, [select('broken-guitar'), activate('bartender')]);
    expect(refused.events).toContainEqual(expect.objectContaining({ type: 'said', line: GUITAR_NO_USE }));
    expect(refused.state.inventory.carried).toEqual(['broken-guitar', 'flyer']);
    const accepted = await play(game.content, inPub.state, [select('flyer'), activate('bartender')]);
    expect(accepted.events).toContainEqual(expect.objectContaining({ type: 'said', line: BARTENDER_TAKES_FLYER }));
    expect(accepted.state.inventory.carried).toEqual(['broken-guitar']);
  });
});
