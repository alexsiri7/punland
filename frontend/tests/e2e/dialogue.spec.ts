import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { content, conversation, enterPub, game, goal, hotspot, newGame, stubDialogue, type DialogueTurn } from './play';

// Acceptance tests for openspec/specs/dialogue/spec.md, from the player's side. The backend
// is stubbed, so these cover the conversation panel (#8); the backend's own part of
// "Escalating options", "Coming back", "AI unavailable" and "Limit reached" is in
// backend/tests/test_dialogue.py.

test.use({ actionTimeout: 5_000 });

const OPTIONS = ['Got any work going?', 'Nice pub.', 'Is the open mic any good?'];

function reply(line: string, extra: Partial<DialogueTurn> = {}): DialogueTurn {
  return {
    line,
    options: OPTIONS.map((text) => ({ text, reaches_goal: false })),
    goal_reached: false,
    ended: false,
    ...extra,
  };
}

async function talkToBartender(page: Page): Promise<void> {
  await newGame(page);
  await enterPub(page);
  await hotspot(page, content.bartender).click();
  await expect(conversation(page)).toBeVisible();
}

test('Starting a conversation', async ({ page }) => {
  // Requirement: Improvised conversations. Talking to a character shows an AI-written line.
  const requests: unknown[] = [];
  await stubDialogue(page, (body) => {
    requests.push(body);
    return reply('Another musician. Wipe your paws.');
  });
  await talkToBartender(page);
  await expect(conversation(page)).toHaveAccessibleName(content.bartender);
  await expect(conversation(page)).toContainText('Another musician. Wipe your paws.');
  expect(requests).toEqual([
    expect.objectContaining({ character: expect.stringMatching(content.bartender), reply: null }),
  ]);
});

test('Picking an option', async ({ page }) => {
  // Requirement: Three options or your own. Each turn offers three suggested replies.
  const replies: (string | null)[] = [];
  await stubDialogue(page, (body) => {
    replies.push(body.reply);
    return reply(body.reply ? 'Work? Maybe.' : 'Evening.');
  });
  await talkToBartender(page);
  const options = conversation(page).getByRole('button', { name: new RegExp(OPTIONS.join('|')) });
  await expect(options).toHaveCount(3);
  await conversation(page).getByRole('button', { name: OPTIONS[0] }).click();
  await expect(conversation(page)).toContainText(OPTIONS[0]);
  await expect(conversation(page)).toContainText('Work? Maybe.');
  expect(replies).toEqual([null, OPTIONS[0]]);
});

test('Typing a reply', async ({ page }) => {
  // Requirement: Three options or your own. Each turn offers a field to type your own reply.
  const replies: (string | null)[] = [];
  await stubDialogue(page, (body) => {
    replies.push(body.reply);
    return reply(body.reply ? 'A kazoo. Bold.' : 'Evening.');
  });
  await talkToBartender(page);
  await conversation(page).getByRole('textbox').fill('I play the kazoo.');
  await conversation(page).getByRole('textbox').press('Enter');
  await expect(conversation(page)).toContainText('I play the kazoo.');
  await expect(conversation(page)).toContainText('A kazoo. Bold.');
  expect(replies).toEqual([null, 'I play the kazoo.']);
});

test('Reaching the goal', async ({ page }) => {
  test.fail(true, 'needs #11');
  // Requirement: Conversation goals. A reply that reaches the goal runs the related puzzle step.
  await stubDialogue(page, (body) =>
    body.reply ? reply('Fine. Start Friday.', { options: [], goal_reached: true, ended: true }) : reply('Evening.'),
  );
  await talkToBartender(page);
  await expect(goal(page, content.jobGoal)).not.toBeChecked();
  await conversation(page).getByRole('button', { name: OPTIONS[0] }).click();
  await expect(conversation(page)).toContainText('Fine. Start Friday.');
  await expect(goal(page, content.jobGoal)).toBeChecked();
});

test('AI unavailable', async ({ page }) => {
  // Requirement: Leaving and failure. If the AI is unavailable the character says so in
  // character and the player keeps playing.
  // The backend answers with its canned line when it cannot reach the model (#6). A failed
  // request to the backend itself would also log a console error, which the fixture fails on.
  await stubDialogue(page, () => reply('Sorry, kid, my head is somewhere else tonight.', { options: [], ended: true }));
  await talkToBartender(page);
  await expect(conversation(page)).toContainText('Sorry, kid, my head is somewhere else tonight.');
  await expect(conversation(page).getByRole('textbox')).toHaveCount(0);
  await hotspot(page, content.pubDoor).click();
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
});

test('Limit reached', async ({ page }) => {
  // Requirement: Spending limits. At the turn limit the character ends the conversation in character.
  await stubDialogue(page, () => reply("That's enough chat for tonight, kid.", { options: [], ended: true }));
  await talkToBartender(page);
  await expect(conversation(page)).toContainText("That's enough chat for tonight, kid.");
  await expect(conversation(page).getByRole('textbox')).toHaveCount(0);
  await hotspot(page, content.pubDoor).click();
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
});
