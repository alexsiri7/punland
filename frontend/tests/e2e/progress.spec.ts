import type { Page } from '@playwright/test';
import { SAVE_KEY } from '../../src/services/save';
import { expect, test } from './fixtures';
import {
  arrive,
  clickHotspot,
  content,
  continueGame,
  conversation,
  enterPub,
  game,
  goal,
  hotspot,
  inventory,
  inventoryItem,
  newGame,
  type Save,
  seedSave,
  startOutsidePub,
  stats,
  stubDialogue,
  stubSaves,
  toHighStreet,
  toOutsidePub,
  useItemOn,
  useItemOnItem,
  worlds,
} from './play';

// Acceptance tests for openspec/specs/progress/spec.md.

test.use({ actionTimeout: 5_000 });

const STATS = content.newStats;

/** Talks to the bartender, whose conversation reaches the current act's last open goal. */
async function reachBartenderGoal(page: Page): Promise<void> {
  await stubDialogue(page, (body) => ({
    line: body.reply ? 'Fine, you win.' : 'Evening.',
    options: [{ text: 'Go on.', reaches_goal: true }],
    goal_reached: body.reply !== null,
    ended: body.reply !== null,
  }));
  await clickHotspot(page, content.bartender);
  await conversation(page).getByRole('button', { name: 'Go on.' }).click();
}

async function statValues(page: Page): Promise<string[]> {
  return stats(page).getByRole('listitem').allTextContents();
}

test('Closing and coming back', async ({ page, context }) => {
  // Requirement: Autosave. Progress is saved automatically, without signing up.
  const saves = new Map<string, string>();
  test.slow();
  await stubSaves(page, saves);
  await newGame(page);
  await toOutsidePub(page);
  await enterPub(page);
  await expect.poll(() => [...saves.values()].some((save) => save.length > 0)).toBe(true);
  await page.close();

  const again = await context.newPage();
  await again.route('https://punland-api.interstellarai.net/**', (route) => route.fulfill({ json: { status: 'ok' } }));
  await stubSaves(again, saves);
  await continueGame(again);
  await expect(game(again)).toHaveAttribute('data-scene', content.pubInterior);
});

test('Continue keeps the inventory', async ({ page, context }) => {
  // Requirement: Autosave (inventory, #10). What the cat picked up is still carried, and
  // gone from its room, after closing the browser and coming back.
  const saves = new Map<string, string>();
  test.slow();
  await stubSaves(page, saves);
  await newGame(page);
  await toOutsidePub(page);
  await toHighStreet(page);
  await clickHotspot(page, content.lessonFlyer);
  await expect(inventoryItem(page, content.lessonFlyer)).toBeVisible();
  await expect.poll(() => [...saves.values()].some((save) => save.includes('lesson-flyer'))).toBe(true);
  await page.close();

  const again = await context.newPage();
  await stubSaves(again, saves);
  await again.addInitScript((key) => localStorage.removeItem(key), SAVE_KEY);
  await continueGame(again);
  await expect(game(again)).toHaveAttribute('data-scene', content.highStreet);
  await expect(inventoryItem(again, content.lessonFlyer)).toBeVisible();
  await expect(hotspot(again, content.lessonFlyer)).toHaveCount(0);
});

test('Continue drops what the content no longer has', async ({ page }) => {
  // Requirement: Story as content. A save from before a content change can name an item or a
  // room that is gone; Continue still resumes it, without them.
  const save = {
    version: 1,
    room: content.opening,
    savedAt: new Date().toISOString(),
    inventory: { items: ['broken-guitar', 'gone-item'], pickedUp: [] },
    journey: { left: { dream: { room: 'gone-room' } }, gathered: [] },
    // The dream is open, so its gone room can be left for its start.
    flags: { 'song-stolen': true },
  };
  await stubSaves(page, new Map());
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, JSON.stringify(save)] as const);
  await continueGame(page);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await expect(inventoryItem(page, content.brokenGuitar)).toBeVisible();
  await expect(inventory(page).getByRole('button')).toHaveCount(1);
  await worlds(page).getByRole('button', { name: 'Dream' }).click();
  await expect(game(page)).toHaveAttribute('data-scene', 'dream');
});

test('A stat changes', async ({ page }) => {
  // Requirement: Career stats. Followers, musicians, practice and instruments are tracked and
  // shown. In Act 1, the bartender getting the cat a kitchen job changes a stat.
  await seedSave(page, { room: 'pub', act: '1', goals: content.act1Goals.slice(0, 1), stats: STATS });
  await continueGame(page);
  for (const name of [/followers/i, /musicians/i, /practice/i, /instruments/i]) {
    await expect(stats(page).getByRole('listitem').filter({ hasText: name })).toBeVisible();
  }
  const before = await statValues(page);
  await reachBartenderGoal(page);
  await expect.poll(() => statValues(page)).not.toEqual(before);
  const after = await statValues(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(() => statValues(page)).toEqual(after);
});

test('Finishing an act', async ({ page }) => {
  // Requirement: Acts. Completing an act's goals starts the next act.
  // Requirement: Act 1: the first show, scenario "The first show": when all three crows have
  // agreed, Act 1 ends with the cat's first show and Act 2 starts.
  await seedSave(page, { room: 'pub', act: '1', goals: content.act1Goals.slice(0, -1), stats: STATS });
  await continueGame(page);
  await expect(game(page)).toHaveAttribute('data-act', '1');
  await reachBartenderGoal(page);
  await expect(game(page)).toHaveAttribute('data-act', '2');
  // The third crow agrees first; the cat's line about the first show comes after his.
  await expect(game(page)).toHaveAttribute('data-say', /first show/i, { timeout: 15_000 });
});

test("Act 1's goals", async ({ page }) => {
  // Requirement: Act 1: the first show. Act 1 shows three goals, one per crow's condition,
  // and no open mic or late slot goal.
  await arrive(page);
  const goals = page.getByRole('list', { name: 'Goals' }).getByRole('checkbox');
  await expect(goals).toHaveCount(3);
  for (const name of [/working guitar/i, /song of my own/i, /lives here/i]) {
    await expect(goal(page, name)).not.toBeChecked();
  }
  await expect(goal(page, /late slot|open mic/i)).toHaveCount(0);
});

test('A working guitar', async ({ page }) => {
  // Requirement: Act 1: the first show. The dog buys the last string at the music shop; the
  // Mayor gives the cat a string from her mane, which mends the broken guitar; shown the
  // working guitar, the first crow agrees.
  test.setTimeout(90_000);
  await startOutsidePub(page);
  await toHighStreet(page);
  await expect(hotspot(page, content.toMayor)).toHaveCount(0);
  await clickHotspot(page, content.musicShop);
  await expect(game(page)).toHaveAttribute('data-scene', 'music-shop');
  await clickHotspot(page, content.strings);
  await expect(game(page)).toHaveAttribute('data-say', /the last string\? mine/i);
  await expect(game(page)).toHaveAttribute('data-say', /bought the last guitar string/i, { timeout: 15_000 });
  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.highStreet);
  await clickHotspot(page, content.toMayor);
  await expect(game(page)).toHaveAttribute('data-scene', 'mayors-office');
  await clickHotspot(page, content.mayor);
  await expect(inventoryItem(page, content.maneString)).toBeVisible();
  await useItemOnItem(page, content.maneString, content.brokenGuitar);
  await expect(inventoryItem(page, content.guitar)).toBeVisible();
  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.highStreet);
  await clickHotspot(page, content.backToPub);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await enterPub(page);
  await useItemOn(page, content.guitar, content.sherylCaw);
  await expect(goal(page, /working guitar/i)).toBeChecked();
});

test('A song of his own', async ({ page }) => {
  // Requirement: Act 1: the first show. The Song Master teaches the cat his song; the dog
  // plays it on the pub stage first, the Song Master stops answering and the dream opens; the
  // song the cat writes in the dream wins the second crow.
  test.setTimeout(120_000);
  await startOutsidePub(page);
  await toHighStreet(page);
  await expect(hotspot(page, content.flatDoor)).toHaveCount(0);
  await clickHotspot(page, content.lessonFlyer);
  await expect(inventoryItem(page, content.lessonFlyer)).toBeVisible();
  await clickHotspot(page, content.intercom);
  await expect(game(page)).toHaveAttribute('data-say', /come on up/i);
  await clickHotspot(page, content.flatDoor);
  await expect(game(page)).toHaveAttribute('data-scene', 'flat');
  await clickHotspot(page, content.songMaster);
  // The lesson is a cutscene: the Song Master's lines come one after another.
  await expect(game(page)).toHaveAttribute('data-say', /I came to the city/, { timeout: 15_000 });

  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.highStreet);
  await clickHotspot(page, content.backToPub);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await enterPub(page);
  await expect(worlds(page).getByRole('button', { name: 'Dream' })).toBeDisabled();
  await clickHotspot(page, content.rivalOnStage);
  await expect(game(page)).toHaveAttribute('data-say', /I came to the city/);
  await expect(worlds(page).getByRole('button', { name: 'Dream' })).toBeEnabled();

  await clickHotspot(page, content.pubDoor);
  await toHighStreet(page);
  await expect(hotspot(page, content.flatDoor)).toHaveCount(0);
  await clickHotspot(page, content.intercom);
  await expect(game(page)).toHaveAttribute('data-say', /nobody answers/i);

  await worlds(page).getByRole('button', { name: 'Dream' }).click();
  await expect(game(page)).toHaveAttribute('data-world', 'dream');
  await clickHotspot(page, content.dreamSong);
  await expect(inventoryItem(page, content.ownSong)).toBeVisible();
  await worlds(page).getByRole('button', { name: 'Street' }).click();
  await expect(game(page)).toHaveAttribute('data-scene', content.highStreet);
  await clickHotspot(page, content.backToPub);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await enterPub(page);
  await useItemOn(page, content.ownSong, content.secondCrow);
  await expect(goal(page, /song of my own/i)).toBeChecked();
});

test('Someone who lives here', async ({ page }) => {
  // Requirement: Act 1: the first show. The third crow won't vouch for the cat until the
  // bartender's conversation reaches its goal: she gets him a kitchen job, and he agrees.
  await seedSave(page, { room: 'pub', act: '1', goals: [], stats: STATS });
  await continueGame(page);
  await stubDialogue(page, (body) => {
    const bartender = body.character === 'bartender';
    return {
      line: bartender ? (body.reply ? 'Staying? Then leave it to me.' : 'Evening.') : "I won't vouch for you.",
      options: [{ text: "I'm staying.", reaches_goal: bartender }],
      goal_reached: bartender && body.reply !== null,
      ended: body.reply !== null,
    };
  });
  await clickHotspot(page, content.thirdCrow);
  await expect(conversation(page)).toContainText("I won't vouch for you.");
  await conversation(page).getByRole('button', { name: 'Leave' }).click();
  await expect(goal(page, content.livesHereGoal)).not.toBeChecked();
  await clickHotspot(page, content.bartender);
  await conversation(page).getByRole('button', { name: "I'm staying." }).click();
  await expect(goal(page, content.livesHereGoal)).toBeChecked();
  await expect(game(page)).toHaveAttribute('data-say', /vouch for you/i);
});

test('Reaching the last act', async ({ page }) => {
  // Requirement: Acts. The last act is chosen from the player's decisions and stats.
  const lastActFor = async (stats: Save['stats']): Promise<string | null> => {
    await seedSave(page, { room: 'pub', act: '3', goals: content.act3Goals.slice(0, -1), stats });
    await continueGame(page);
    await reachBartenderGoal(page);
    await expect(game(page)).not.toHaveAttribute('data-act', '3');
    return game(page).getAttribute('data-act');
  };
  const famous = await lastActFor({ followers: 5000, musicians: 0, practice: 0, instruments: 1 });
  const bandmates = await lastActFor({ followers: 0, musicians: 4, practice: 80, instruments: 5 });
  expect(famous).toMatch(/^4/);
  expect(bandmates).toMatch(/^4/);
  expect(famous).not.toEqual(bandmates);
});
