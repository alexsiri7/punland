import { expect, test } from './fixtures';
import { fixtures } from '../fixtures/models/glb';
import { PROTAGONIST } from '../../src/content/protagonist';
import {
  clickHotspot,
  clickScene,
  content,
  enterPub,
  game,
  hotspot,
  inventoryItem,
  newGame,
  openingSceneModel,
  playerPosition,
  pointAtHotspot,
  scenePixel,
  seedSave,
  continueGame,
  startOutsidePub,
  toHighStreet,
  toOutsidePub,
} from './play';

// Acceptance tests for openspec/specs/scenes/spec.md.

test.use({ actionTimeout: 5_000 });

test('Opening scene', async ({ page }) => {
  // Requirement: Rooms. A new game plays the Arrival in the coach station: a coach comes and
  // goes, the cat introduces himself, the beetroot cop sends him up the road to The Three Crows
  // and to the map stand, and the player then has control there.
  test.slow();
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(game(page)).toHaveAttribute('data-scene', content.coachStation);
  await expect(hotspot(page, content.coach)).toBeAttached();
  await expect(hotspot(page, content.coach)).toHaveCount(0);
  for (const line of [
    'Punland.',
    `Hi, I'm ${PROTAGONIST.name}, and I want to be a star!`,
    'A star? Son, the only star I know about is the one on my badge.',
    "But you could try The Three Crows. That's where the music lot go.",
    'Three crows? We only had the one crow in Literal Village.',
    "It's a pub, son. Grab a map from the stand. You'll get lost otherwise.",
    'Oh! Right. Thanks. Bye!',
  ]) {
    await expect(game(page)).toHaveAttribute('data-say', line, { timeout: 10_000 });
  }
  await expect(game(page)).toHaveAttribute('data-scene', content.coachStation);
  await expect.poll(() => playerPosition(page)).not.toBeNull();
  await expect(hotspot(page, content.cop)).toBeAttached();
});

test('The coach station', async ({ page }) => {
  // Requirement: The coach station. Its hint, and the cop, the map stand, the departures board
  // and the way up the road.
  await newGame(page);
  await expect(page.getByText('Where every dreamer gets off. Free maps by the exit.')).toBeVisible();
  for (const name of [content.cop, content.mapStand, content.departures, content.upTheRoad]) {
    await expect(hotspot(page, name)).toBeAttached();
  }
});

test('Picking up a map', async ({ page }) => {
  // Requirement: The coach station. The map stand gives a free map, and then has only a line.
  await newGame(page);
  await clickHotspot(page, content.mapStand);
  await expect(game(page)).toHaveAttribute('data-say', /"Punland: free map\." Free\?/);
  await expect(inventoryItem(page, content.mapItem)).toBeVisible();
  await clickHotspot(page, content.mapStand);
  await expect(game(page)).toHaveAttribute(
    'data-say',
    "I've got one already. One map is plenty. Two maps is a library.",
  );
  await expect(inventoryItem(page, content.mapItem)).toHaveCount(1);
});

test('Looking at the departures board', async ({ page }) => {
  // Requirement: The coach station. The departures board has the coach home.
  await newGame(page);
  await clickHotspot(page, content.departures);
  await expect(game(page)).toHaveAttribute(
    'data-say',
    "Next coach to Literal Village: tomorrow. Not that I'm going back.",
  );
});

test('Up the road', async ({ page }) => {
  // Requirement: The coach station. Up the road is outside The Three Crows, with no cop, and the
  // way back to the coach station.
  await startOutsidePub(page);
  await expect(page.getByText('Live music below.', { exact: true })).toBeVisible();
  await expect(hotspot(page, content.cop)).toHaveCount(0);
  await clickHotspot(page, content.toStation);
  await expect(game(page)).toHaveAttribute('data-scene', content.coachStation);
});

test('The map', async ({ page }) => {
  // Requirement: The map. Using the map shows the places the cat knows about; a marked place
  // goes there, and closing the map goes back where it was opened.
  await newGame(page);
  await clickHotspot(page, content.mapStand);
  await expect(inventoryItem(page, content.mapItem)).toBeVisible();
  await toOutsidePub(page);
  await inventoryItem(page, content.mapItem).click();
  await expect(game(page)).toHaveAttribute('data-scene', content.map);
  await expect(hotspot(page, content.places.coachStation)).toBeAttached();
  await expect(hotspot(page, content.places.pub)).toBeAttached();
  await expect(hotspot(page, content.places.highStreet)).toHaveCount(0);
  await expect(hotspot(page, content.places.mayorsOffice)).toHaveCount(0);
  await clickHotspot(page, content.closeMap);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);

  await toHighStreet(page);
  await inventoryItem(page, content.mapItem).click();
  await expect(game(page)).toHaveAttribute('data-scene', content.map);
  await expect(hotspot(page, content.places.highStreet)).toBeAttached();
  await clickHotspot(page, content.places.coachStation);
  await expect(game(page)).toHaveAttribute('data-scene', content.coachStation);
});

test('The map marks the Mayor’s office once the strings are sold out', async ({ page }) => {
  // Requirement: The map. The Mayor's office is marked only once the strings are sold out.
  const flags = { arrived: true, 'string-sold-out': true };
  await seedSave(page, {
    room: 'coach-station',
    act: '1',
    goals: [],
    stats: content.newStats,
    flags,
    inventory: { items: ['broken-guitar', 'map'], pickedUp: ['map'] },
  });
  await continueGame(page);
  await inventoryItem(page, content.mapItem).click();
  await expect(game(page)).toHaveAttribute('data-scene', content.map);
  await clickHotspot(page, content.places.mayorsOffice);
  await expect(game(page)).toHaveAttribute('data-scene', 'mayors-office');
});

test('Walking', async ({ page }) => {
  // Requirement: Click to walk. The player character walks to the point clicked on the floor.
  await newGame(page);
  await clickScene(page, content.pavement);
  await expect
    .poll(async () => {
      const at = await playerPosition(page);
      return at && Math.hypot(at.x - content.pavement.x, at.y - content.pavement.y);
    })
    .toBeLessThan(24);
});

test('Hovering a hotspot', async ({ page }) => {
  // Requirement: Hotspots. Hotspots show their name on hover.
  await startOutsidePub(page);
  await pointAtHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-hover', content.pubDoor);
});

test('Clicking a hotspot', async ({ page }) => {
  // Requirement: Hotspots. Clicking one walks the character to it and its action happens.
  await newGame(page);
  const start = await playerPosition(page);
  await clickHotspot(page, content.board);
  await expect(game(page)).toHaveAttribute('data-say', /\S/);
  expect(await playerPosition(page)).not.toEqual(start);
});

test('Entering the pub', async ({ page }) => {
  // Requirement: Exits. Clicking the pub door in the opening scene enters the pub interior.
  await startOutsidePub(page);
  await enterPub(page);
  await expect.poll(() => playerPosition(page)).toEqual(content.pubEntrance);
  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
  await expect.poll(() => playerPosition(page)).toEqual(content.outsidePub);
});

test('Down the High Street', async ({ page }) => {
  // Requirement: Exits. The way down the High Street from the opening scene shows the High
  // Street, with the music shop, the Song Master's flyer and his intercom.
  await startOutsidePub(page);
  await toHighStreet(page);
  for (const name of [content.musicShop, content.lessonFlyer, content.intercom]) {
    await expect(hotspot(page, name)).toBeAttached();
  }
  await clickHotspot(page, content.backToPub);
  await expect(game(page)).toHaveAttribute('data-scene', content.opening);
});

test('Looking at the Wall of Fame', async ({ page }) => {
  // Requirement: The Three Crows. The pub's Wall of Fame has its visual-pun photos.
  await startOutsidePub(page);
  await enterPub(page);
  for (const name of [content.sherylCaw, content.secondCrow, content.thirdCrow, /stage/i]) {
    await expect(hotspot(page, name)).toBeAttached();
  }
  await clickHotspot(page, content.wallOfFame);
  for (const photo of [/pile of rocks/, /Beetles/, /Tuna and Pike Turner/, /Katty Purry/]) {
    await expect(game(page)).toHaveAttribute('data-say', photo);
  }
});

test('Swapping art (scene model)', async ({ page }) => {
  // Requirement: Placeholder art. Replacing a room's scene model needs no change to game logic.
  await page.route(`**${openingSceneModel}`, (route) =>
    route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: Buffer.from(fixtures.magentaScene()) }),
  );
  await startOutsidePub(page);
  // The toon ramp gives the backdrop two tones and the grain overlay sits above the canvas, so
  // the pixel is strongly magenta rather than exactly #FF00FF.
  await expect
    .poll(async () => {
      const [r = 0, g = 255, b = 0] = await scenePixel(page, { x: 40, y: 300 });
      return r > 150 && b > 150 && g < 80;
    })
    .toBe(true);
  await pointAtHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-hover', content.pubDoor);
  await clickHotspot(page, content.pubDoor);
  await expect(game(page)).toHaveAttribute('data-scene', content.pubInterior);
});
