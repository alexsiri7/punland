// @vitest-environment node
// No DOM in this file: the rules must play the game without a renderer or a document.
import { describe, expect, it } from 'vitest';
import { type Command, load, play } from './support/modules';

// Acceptance tests for openspec/specs/architecture/spec.md, requirement "Rules as commands and
// events". The commands and events are in docs/ARCHITECTURE.md, section 4.

const INVITED = 'I buzz. A crackly voice: "Songwriting? Come on up."';
const SHERYL_AGREES = 'A guitar that works. Caw! I agree: you can play.';
const GUITAR_NO_USE = "My guitar's in enough pieces already.";
const FIRST_SHOW = 'All three crows agree. My first show, at The Three Crows!';

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
    const played = await play(content, state, [activate('street'), activate('lesson-flyer'), activate('intercom')]);
    expect(played.state.room).toBe('high-street');
    expect(played.state.inventory.carried).toContain('lesson-flyer');
    expect(played.state.flags).toEqual({ invited: true });
    expect(played.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'roomChanged', room: 'high-street' }),
        expect.objectContaining({ type: 'pickedUp', item: 'lesson-flyer', hotspot: 'lesson-flyer' }),
        expect.objectContaining({ type: 'said', line: INVITED }),
        expect.objectContaining({ type: 'hotspotShown', hotspot: 'flat-door' }),
      ]),
    );
  });

  // Requirement: Rules as commands and events. Using an item on a hotspot gives the hotspot's
  // response when it accepts the item, and the item's refusal (`noUse`) when it does not.
  it('Use X on Y', async () => {
    const { content, state } = await newGame();
    const inPub = { ...state, room: 'pub', inventory: { carried: ['broken-guitar', 'guitar'], pickedUp: [] } };
    const refused = await play(content, inPub, [select('broken-guitar'), activate('sheryl-caw')]);
    expect(refused.events).toContainEqual(expect.objectContaining({ type: 'said', line: GUITAR_NO_USE }));
    expect(refused.state.goals).toEqual([]);
    const accepted = await play(content, inPub, [select('guitar'), activate('sheryl-caw')]);
    expect(accepted.events).toContainEqual(expect.objectContaining({ type: 'said', line: SHERYL_AGREES }));
    expect(accepted.state.goals).toEqual(['working-guitar']);
  });

  // Requirement (progress spec): Act 1: the first show, scenario "The first show". Whichever crow
  // agrees last, Act 1 ends with the cat's first show and Act 2 starts; here the guitar comes last.
  it('The first show, with the working guitar last', async () => {
    const { content, state } = await newGame();
    const inPub = {
      ...state,
      room: 'pub',
      goals: ['own-song', 'lives-here'],
      inventory: { carried: ['guitar'], pickedUp: [] },
    };
    const played = await play(content, inPub, [select('guitar'), activate('sheryl-caw')]);
    expect(played.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'said', line: SHERYL_AGREES }),
        expect.objectContaining({ type: 'said', line: FIRST_SHOW }),
        expect.objectContaining({ type: 'actStarted', act: '2' }),
      ]),
    );
    expect(played.state.stats.followers).toBe(state.stats.followers! + 50);
    expect(played.state.act).toBe('2');
  });
});
