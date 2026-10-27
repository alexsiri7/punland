# Tune Story frontend architecture

This is the target structure of `frontend/src`, the reasons for it, and the plan to get there. The behaviour it promises is in [`openspec/specs/architecture`](../openspec/specs/architecture/spec.md) and [`openspec/specs/models`](../openspec/specs/models/spec.md). The look is still [`docs/design/STYLE.md`](design/STYLE.md).

The work lands in two phases of small issues, wired in order with GitHub `blocked_by` dependencies:

- **Phase A** refactors the 2D game into these layers. The game keeps working and every test stays green after each step.
- **Phase B** adds the Three.js renderer and the 3D models, then removes the 2D path.

Each issue's title starts with its step (`A1` … `A9`, `B1` … `B7`), listed in [Migration plan](#migration-plan). This file is the reference those issues point to. When a step changes the structure, update this file in the same PR.

## 1. Where the code is today (audit, 2026-10-25)

The skeleton is small (about 1,260 lines of TypeScript) and tidy, with good unit and e2e coverage. But the game logic and the 2D engine are fused together, and that would turn into spaghetti as dialogue, stats, acts and 3D arrive.

| # | Finding | Where | Risk |
| --- | --- | --- | --- |
| 1 | **One class runs everything.** `RoomScene` (389 lines, a `Phaser.Scene`) holds the rules: walking and the pending action after it, hotspot actions, pickups, use X on Y, world switching, dream material, presence of hotspots. It also holds the rendering (layers, sprites, speech text, UI bar), the input, the DOM wiring (hotspot, inventory and world layers), the `data-*` mirroring and autosave. | `scenes/RoomScene.ts` | Every new feature (dialogue #8, stats and acts #11, 3D) has to edit it. The rules can't be unit-tested without Phaser. 3D would mean rewriting the rules. |
| 2 | **The game state is mutable and scattered.** `Inventory` and `Journey` are mutable classes handed between scene restarts. The room, the position, the selected item and the walk target are private fields of the scene. A save is put together by hand in `persist()`. | `inventory.ts`, `journey.ts`, `RoomScene` | Nothing owns "the state", so there is no single place to save, restore, replay or test it. #11 would add a third and a fourth mutable bag. |
| 3 | **Content is typed by assertion, not validated.** `rooms.ts` casts JSON to `Room`. `items.json` and `worlds.json` are imported as is. The checks live in unit tests (`rooms.test.ts`), not where the data is loaded. | `content/*.ts` | A typo in a content file gets past the type checker. The only guard is whichever test someone remembered to write. |
| 4 | **Presentation data is mixed into game content.** A hotspot's screen `rect` sits next to its rules. Actors are matched to hotspots by art-layer id (`layer.actor === hotspot.id`), and the protagonist by `PROTAGONIST.actor`. | `content/rooms/*.json`, `RoomScene.create` | A 3D model has no screen rect and no art layer. 3D would need content changes in every room. |
| 5 | **The UI is half canvas, half DOM.** The hotspot buttons, inventory and world switcher are DOM (good). The UI bar text (location label, action line, hint) and the speech line are Phaser text. | `RoomScene.drawUiBar`, `say` | The dialogue panel (#8) and any renderer swap would have to re-implement canvas text. |
| 6 | **The interaction model is closed.** One `action` per hotspot (`say`, `exit`, `pickup`) plus `uses`. There are no conditions, verbs, multiple effects or flags. | `content/rooms.ts` | Talking (#8), stats and acts (#11) and real puzzles need new cases in the `switch` in `RoomScene.run`, which is code, against the "story as content" invariant. |
| 7 | **Infrastructure is tangled with the domain.** `save.ts` holds the save format, its validation, the local store and the HTTP store. `SaveGame` is built in the scene. | `save.ts` | Fine at this size. But the save format should be the domain's serialised `GameState`, and the stores should be swappable services. |
| 8 | **Nothing enforces boundaries.** There is no linter, and no import rules. | — | Clean layering would erode one PR at a time. |

What is already right, and stays: data-driven rooms, the `SaveStore` interface (local plus backend, newest wins), DOM-first accessible controls, the `#game` `data-*` test interface, the CSP discipline, `theme.ts` tokens, and the acceptance-test conventions.

The backend talks to the frontend through two endpoints only: `/saves` (`GET`, `PUT`, `DELETE`, keyed by `X-Player-Id`, body = `SaveGame`) and, from #6, `POST /dialogue/turn` (`{character, reply}` → `{line, options[{text, reaches_goal}], goal_reached, ended}`). Character sheets for the AI live in the backend (`backend/src/punland_api/content/characters/<id>.json`). The frontend's character ids MUST be the same ids. This plan does not touch `backend/`.

## 2. Layers

```
frontend/src/
  domain/        pure model: ids, geometry, GameState, Content types, inventory/journey state functions
  rules/         pure: commands -> (state, events); tick (walking); interactions, conditions, effects
  content/       JSON content + loaders/validators -> domain Content (worlds, rooms, items, characters, objects)
  assets/        model registry: entity id -> its 3D model (glb + metadata) + validators
  services/      infrastructure: api.ts, save stores (local, backend), player id, storage, dialogue client
  presentation/
    renderer.ts  the Renderer interface and its types (no engine imports)
    ui/          DOM overlay: UI bar, action line, speech, hotspot buttons, inventory, world switcher, dialogue panel
    theme.ts     design tokens (palette, fonts, sizes); fonts.ts; style.css
    three3d/     the 3D renderer: the ONLY folder that imports `three` (from B2)
  app/           composition root: main.ts boot, title screen, GameSession, data-* mirror, autosave wiring, renderer choice
```

**Allowed imports.** A layer may import itself and the layers in its row, nothing else.

| Layer | May import | Must not touch |
| --- | --- | --- |
| `domain` | — | any other layer, `three`, `document`/`window`/`localStorage`/`fetch`, `import.meta.env` |
| `rules` | `domain` | the same as domain |
| `content` | `domain` | renderers, DOM, network. `import.meta.glob` of JSON is allowed. |
| `assets` | `domain` | renderers, DOM, network (JSON manifests only) |
| `services` | `domain` | `rules`, `content`, `presentation` |
| `presentation/renderer.ts`, `presentation/ui` | `domain`, `assets` (types), `presentation/theme` | `rules` (UI only shows events and sends commands through the session), `three` |
| `presentation/three3d` | `presentation/*`, `domain`, `assets`, `three` | `rules`, `services` |
| `app` | everything | — |

**How it is enforced: an architecture unit test, not a linter.** `frontend/tests/unit/architecture.test.ts` (added in A1) reads every file under `src/`. It extracts static imports, `export … from`, dynamic `import()` and `import.meta.glob` specifiers, resolves relative ones to a layer, and fails on any import outside the table above. It names the file and the import. It also fails on browser globals (`document`, `window`, `localStorage`, `fetch`, `navigator`) in `domain/` and `rules/`.

The reasons for a test rather than a lint tool:

- **The tools don't support the compiler.** The repo is on TypeScript 7 (the native compiler), which has no JavaScript compiler API. typescript-eslint (so eslint-plugin-boundaries too) supports `typescript < 6.1`, and dependency-cruiser needs that API (or swc) to parse `.ts`.
- **It costs nothing to add.** A test adds no dependency, no `package.json` script and no CI change, so it runs in the existing `npm test` CI step, and factory PRs that touch it pass the unsafe-change check.

If a TS-7-compatible linter is wanted later, Oxlint (Rust, parses TS itself) is the candidate. The test stays the source of truth for layering.

`tsconfig.json` is `strict`, with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noImplicitOverride` on (from A1).

Code that A1 moved into a layer but that still imported across the table was listed in a baseline file, which only shrank as each step removed its imports. The last entry went with A5, and A9 deleted the file: the test checks `src/` against the table alone.

## 3. Domain model (`domain/`)

The domain is plain, serialisable data: no classes with hidden state, no engine types. Ids are branded strings (`type RoomId = string & {readonly __brand: 'RoomId'}`), made only by the content validators.

```ts
// Coordinates on a room's floor. While each room has one fixed camera (all of phase B), a floor
// point is the scene-pixel position (1280 x 640) where that spot of floor appears on screen.
// The renderer maps it to the floor by raycasting from the room camera (section 7). A projective
// map keeps lines straight and convex polygons convex, so walking in straight lines on a convex
// floor, saves and the e2e tests carried over unchanged from 2D.
interface FloorPoint { x: number; y: number }

interface World     { id: WorldId; name: string; start: RoomId; locked?: string }
interface Item      { id: ItemId; name: string; noUse: string; model: ModelId }
interface Character { id: CharacterId; name: string; model: ModelId; onGoal?: Reaction[] }  // the id is also its backend sheet's id
interface Prop      { id: ObjectId; name: string; model: ModelId }  // a reusable prop, e.g. the flyer
interface Room {
  id: RoomId; world: WorldId; model: ModelId;            // the scene's model (its glb)
  label: string; place: { verb: string; name: string }; hint: string;
  start: FloorPoint; walkable: FloorPoint[];             // convex
  hotspots: Hotspot[];
}
interface Hotspot {
  id: HotspotId; name: string; verb: string;             // default verb shown on hover
  target: { entity: CharacterId | ObjectId; at: FloorPoint } // a placed reusable entity...
        | { node: string };                              // ...or a part of the scene model (door, board)
  walkTo: FloorPoint;
  interactions: Interaction[];                           // see rules
  presentWhen?: Condition[];                             // e.g. not picked up, dream material gathered
}

interface GameState {
  room: RoomId; at: FloorPoint;
  inventory: { carried: ItemId[]; pickedUp: ItemId[] };
  journey: { left: Partial<Record<WorldId, Place>>; gathered: string[] };
  flags: Record<string, boolean | number | string>;      // puzzle state
  stats: Record<StatId, number>;                         // career stats
  act: ActId; goals: GoalId[];                           // the act being played, and its reached goals
  // transient, never saved:
  selected: ItemId | null;
  walk: { target: FloorPoint; then: { hotspot: HotspotId; item: ItemId | null } | null } | null; // on arrival: the hotspot's interaction, or use `item` on it
  saying: { line: string; by: 'player' | CharacterId } | null;
}
```

- **Content shapes today.** `domain/content.ts` holds the content types as the files have them: items keyed by id, and no `model` on items yet. `content/characters.json` lists the characters (`{ id, name, model }`) and the protagonist's display data (`protagonist: { model }`, whose name `loadContent` takes from `content/protagonist.ts`); `content/objects.json` lists the props. `Content` carries them by id (`characters`, `objects`, `protagonist`) beside the start room and items. A `model` (`ModelId`) is an id in the model registry (section 6), such as `character/bartender`; since A8 a room has one too (`scene/<room>`). `ModelId` is a plain string: the content validator can't see the registry, so the asset validators check that each one is there. Since A7 a hotspot has `target`, `interactions` and `presentWhen` as above; `node` is the hotspot's id for now.
- **Validated content (A6).** `content/validate.ts` checks `worlds.json`, `items.json` and `rooms/<room>.json` (a room's id is its file name) by hand, in the style of `isSaveGame`: the shapes, that every room, item, world, character and object an id names exists (a `talk` names a character, a `target` a character or an object), known verbs, conditions and effects (each condition and effect has exactly one of its kind's keys), an `item` only on a `use` interaction, unique ids for hotspots per room and for characters and objects, a convex floor with the room's `start`, every `walkTo`, every entity's `at` and every `goTo`'s `at` on the right floor, `goTo`s that stay in their world, worlds that start in their own rooms, and a `model` on every room (the asset validators check what it names, section 6). A problem is `{file, field, message}`, with `field` a JSON path such as `hotspots[0].interactions[0].effects[0].goTo`. `validateContent(files)` lists every problem, and `content/index.ts` `loadContent(files?)` builds the `Content` from the real files (or the ones given) or throws, listing them; `app/main.ts` loads it before the title screen. A new game starts in the first world's start room. The ids in a `Content` (`RoomId`, `ItemId`, `WorldId`, `HotspotId`, `CharacterId`, `ObjectId`) are branded by the validator. `GameState`, commands, events and the renderer types still hold plain strings: commands and saves hand ids in unchecked, and the rules look them up in the content.
- **Save format.** `SaveGame` stays `version: 1` and only grows by optional fields, so old saves still load (architecture spec, "An older save"). `domain/save.ts` holds `SaveGame` (with an optional `at`, the spot the player stood on, since A7 the optional `flags`, and since #11 the optional `act`, `goals` and `stats`), `toSave(state)` and `fromSave(save, content)`, which drops unknown ids the way `game.ts` does today: an unknown act resumes at the first act, goals of other acts are dropped, and a stat the save lacks starts at its `start`. `toSave` leaves out `savedAt`: the rules read no clock, so whoever writes the save stamps it.
- **Hotspot rects.** A hotspot has no screen rect in the room content (since A8). The renderer derives it from the projected bounds of the hotspot's hit area in its model (B3); the 2D rects that A8 put in the registry went with B7.
- **Stats and acts (#11).** `content/stats.json` lists the career stats in display order (`{ id, name, start }`: followers, musicians, practice, instruments), and `content/acts.json` the acts (`{ id, name, goals: { id, name }[], next?: { act, when? }[] }`); a new game starts in the first act with each stat at its `start`. Goal ids are unique across acts. `GameState.goals` holds the reached goals of the current act only. An act ends when all its goals are reached, and the first `next` entry whose conditions all hold starts at once, with no goals reached; the validator requires the last entry to have no `when`, so one always does. An act without `next` is final. That is how the last act is chosen from the player's decisions (`flag` and `goal` conditions) and stats (`stat`): Acts 1 and 2 have one `next` each, and Act 3 has one per ending. The effects `changeStat` and `reachGoal` and the conditions `stat`, `act` and `goal` (section 4) are the only way the story reads and changes them. A character's `onGoal` reactions (`{ when?, effects }[]`) are what a conversation that reaches its goal does (section 4, "Dialogue"); the validator keeps `goTo`, `pickUp` and `talk` out of them, since they need a hotspot. Act 1's goals are the placeholders fix the guitar, get the pub job and get the late slot; Acts 2 to 4 are stand-ins until the story has them.

## 4. Rules (`rules/`): commands, events, interactions

`Command` and `GameEvent` are types in `domain/commands.ts`, so presentation can send the one and draw the other without importing `rules/`; `rules/` re-exports them with `apply`.

```ts
type Command =
  | { type: 'walk'; to: FloorPoint }                       // a floor click; the rules clamp it to the floor
  | { type: 'activate'; hotspot: HotspotId }               // default verb, or "use selected item on"
  | { type: 'select'; item: ItemId | null }
  | { type: 'enterWorld'; world: WorldId }
  | { type: 'tick'; dtMs: number }                         // advances walking; runs `walk.then` on arrival
  | { type: 'dialogueResult'; character: CharacterId; goalReached: boolean }; // from #8's panel

type GameEvent =
  | { type: 'moved'; at: FloorPoint } | { type: 'arrived' }
  | { type: 'said'; line: string; by: 'player' | CharacterId } | { type: 'hushed' }
  | { type: 'pickedUp'; item: ItemId; hotspot: HotspotId } | { type: 'itemAdded' | 'itemRemoved'; item: ItemId }
  | { type: 'used'; item: ItemId; hotspot: HotspotId }    // an accepted use, before its effects (B5)
  | { type: 'selected'; item: ItemId | null }
  | { type: 'roomChanged'; room: RoomId; at: FloorPoint } | { type: 'worldChanged'; world: WorldId }
  | { type: 'hotspotShown' | 'hotspotHidden'; hotspot: HotspotId }
  | { type: 'conversationStarted'; character: CharacterId }
  | { type: 'gathered'; material: string }
  | { type: 'statChanged'; stat: StatId; value: number } | { type: 'goalReached'; goal: GoalId }
  | { type: 'actStarted'; act: ActId }                     // the act ended and this one started
  | { type: 'saved' };                                     // state worth persisting changed

function apply(content: Content, state: GameState, command: Command): { state: GameState; events: GameEvent[] };
```

- **Dialogue.** `dialogueResult` and `conversationStarted` arrived with the dialogue panel (#8); A2 has the rest. A `talk` effect starts the conversation, and the panel shows the character's `name` from `characters.json`. A `dialogueResult` that reaches the goal runs the effects of the character's first `onGoal` reaction whose conditions hold, then saves (#11); with none, or when the goal isn't reached, it changes nothing.
- **The rules are pure.** `apply` never mutates its input, reads no clock and no randomness, and needs no DOM. That is how the spec scenario "Playing without a renderer" is tested.
- **Walking is a tick.** `tick` is the old `RoomScene.update()` at `WALK_SPEED`, and the app's frame loop sends it. The `walk` command clamps its target to the floor with `nearestWalkable`.
- **Interactions** replace `action` and `uses` (A7):

  ```ts
  interface Interaction {
    verb: 'look' | 'use' | 'talk' | 'pickup' | 'go';   // 'use' with `item` is "use X on Y"
    item?: ItemId;
    when?: Condition[];                                // all must hold
    effects: Effect[];                                 // run in order
  }
  type Condition = { has: ItemId } | { pickedUp: ItemId } | { gathered: string } | { flag: string; is?: boolean | number | string } // `is` is true when left out
    | { stat: StatId; atLeast: number } | { act: ActId } | { goal: GoalId }  // `goal`: reached in the current act
    | { not: Condition };
  type Effect =
    | { say: string } | { goTo: RoomId; at?: FloorPoint } | { pickUp: ItemId } | { give: ItemId } | { take: ItemId }
    | { gather: string } | { set: string; to: boolean | number | string } | { talk: CharacterId }
    | { changeStat: StatId; by: number } | { reachGoal: GoalId };  // a goal of another act, or one reached, does nothing
  interface Reaction { when?: Condition[]; effects: Effect[] }   // a character's onGoal
  ```

  Activating a hotspot with no item selected runs its first interaction without an `item` whose conditions hold; when none holds, nothing happens. With an item selected, it runs the first `use` interaction for that item whose conditions hold, or else says the item's `noUse`. The verb names what an interaction is; the hotspot's `verb` stays the text shown on hover. After the effects, the rules compare each hotspot of the room with its `presentWhen` and send `hotspotShown` or `hotspotHidden` for the ones that changed. `pickUp` records the item as picked up for good (a `presentWhen: [{ not: { pickedUp } }]` hides its hotspot), `give` and `take` only move it in or out of the inventory (`itemAdded`, `itemRemoved`), and `gather` is the dream material that used to be a hotspot's `dreamMaterial`. Adding an effect or condition is a rules change with unit tests. Adding a puzzle that uses existing ones is content only (progress spec, "Adding a puzzle").
- **The session.** `app/session.ts` (`GameSession`) owns the current `GameState`. It exposes `dispatch(command)` and `subscribe(listener)`, applies the rules and fans the events out to the renderer, the UI, the `data-*` mirror and autosave (on `saved`, through the `SaveStore`, stamping `savedAt`). It is the one stateful object, and it is small. `app/main.ts` builds it from `fromSave` or `newGame` and hands it, with the renderer from `app/renderers.ts`, to `playGame` (`app/game.ts`). The DOM UI may not import `app/`: it sees the session through the `Session` interface in `presentation/session.ts`.

## 5. Presentation

### Renderer interface (`presentation/renderer.ts`)

```ts
interface SceneView {                              // what to draw, built by the app from content + state
  room: RoomId; model: ModelId;                    // the room's scene model
  entities: { hotspot: HotspotId; model?: ModelId; visible: boolean }[]; // model: the entity a hotspot places
  player: { model: ModelId; at: FloorPoint };
}
type Pick = { kind: 'hotspot'; hotspot: HotspotId } | { kind: 'floor'; at: FloorPoint } | { kind: 'none' };

interface Renderer {
  readonly picksHotspots: boolean;                    // 3D: pick finds hotspots, the buttons let the pointer through
  mount(container: HTMLElement): Promise<void>;       // creates its canvas inside #game
  show(view: SceneView): Promise<void>;               // load (cached) assets, draw the room
  setPlayer(at: FloorPoint, facing: 'left' | 'right'): void;
  setVisible(hotspot: HotspotId, visible: boolean): void;
  play(who: 'player' | HotspotId, clip: AnimationName): void;   // from B5
  pick(screen: { x: number; y: number }): Pick;       // screen = scene pixels (1280 x 640)
  hotspotBounds(hotspot: HotspotId): Rect | null;     // scene pixels, for the DOM hotspot buttons
  anchor(who: 'player' | HotspotId, name: 'head' | 'hand_r'): { x: number; y: number } | null; // speech placement
  canvas(): HTMLCanvasElement;                        // for the DOM overlay to line up with
  onResize(callback: () => void): () => void;         // the canvas was resized or moved
  frame(callback: (dtMs: number) => void): () => void;// frame loop; the app sends `tick`
  destroy(): void;
}
```

- **Renderers draw. They decide nothing.** Input goes `canvas pointer → renderer.pick → app → session.dispatch`. A fake renderer (`tests/unit/fakes/renderer.ts`) lets the app and session be tested in jsdom.
- **What A5 built.** `presentation/renderer.ts` has these types with the ids as plain strings, like `GameState` and the commands (section 3). Since A8 every `ModelId` is a registry id (section 6): the view carries the room's scene model, the model of each entity a hotspot places (a `node` hotspot has none), and the protagonist's model, and the renderer looks up how each one looks in the registry. Since B2 an entity also carries its hotspot's `at`, the floor point the 3D renderer stands its model on. `onResize` is new: the overlay lines up again whenever the canvas is resized or moved. `app/game.ts` (`playGame`) builds the `SceneView` from the session, shows it on `roomChanged`, calls `setPlayer` on `moved` and `setVisible` on `hotspotShown` and `hotspotHidden` (A7: a hotspot shown in the room no longer redraws it, so a line or conversation from the same interaction stays up), sends `tick` from `frame`, and turns canvas pointer presses into `walk` through `pick`. A5's 2D renderer implemented it with Phaser until B7 removed it.
- **What B2 built.** `three3d/renderer.ts` (`Three3dRenderer`) checks for a WebGL 2 context first: without one it puts a short message on `#game` and never resolves `mount`, so nothing goes on to use a canvas. Otherwise its canvas is sized and centred in `#game`, the scene drawn in its top 1280 × 640 and the UI bar's ground under it, with the grain overlay (`.grain`, `public/textures/grain.svg`, STYLE.md's noise at 16%) laid over the scene. `three3d/room.ts` builds one `Room` per view: until B3's scene models bring `cam_main`, every room is a default room, a ground plane under the dusk sky seen by a fixed camera that frames the protagonist about 256 px tall at the front of the walk line, with the horizon above every room's floor polygon. A floor point is where the ray through that scene pixel meets `y = 0`, and the player and each placed entity stand there; the player turns to the way they walked. `pick` returns that floor point (none above the horizon), `hotspotBounds` is an entity model's projected bounds (a `node` hotspot's came from the registry's 2D rect until B3), and `anchor` projects the model's `anchor_<name>` node. `three3d/models.ts` loads each registry glb once (`GLTFLoader`; a file that fails to load leaves just that model out of the room, with a console warning, and is tried again by the next room) and gives every material a `MeshToonMaterial` of its base colour with the two-step ramp in `three3d/look.ts`, which also sets the low ambient and the key light from the upper left with hard shadows. The hotspot buttons still take the pointer until B4. Headless Chromium got a WebGL context with no launch flag, so `playwright.config.ts` only gained a second project that ran the whole e2e suite in 3D until B6 made 3D the default.
- **What B3 built.** Every room has a scene model, `models/scenes/<room>.glb`, written by `scripts/make-placeholders.mjs`: a low-poly room shell laid out in the scene pixels of the room's reference art (`docs/design/rooms/<room>.svg`, the 2D art it replaced) through one camera shared by the four rooms (25° high, 2.5 m up, tipped 6° down, placed so the front centre of the walkable area is the origin and the protagonist is about 256 px tall there), with `floor`, `cam_main` and a `hit_<node>` box for each `node` hotspot. `three3d/room.ts` draws the scene model and renders through its `cam_main`, at the 2:1 scene aspect; a floor point is where the ray from `cam_main` through that scene pixel meets the `floor` mesh, and the player and each placed entity stand there. The default room of B2 is gone: a room whose scene model fails to load is the empty sky, with nothing to stand on. A `node` hotspot's view entity carries its node, and `hotspotBounds` is the projected bounds of its `hit_<node>`, as it is of an entity's model, with no 2D rect. Entities come from their one registry entry wherever they are placed: the flyer stands on the pavement in the opening room and, once gathered, on the dream's platform, and `setVisible` hides it when it is picked up.
- **What B4 built.** The 3D renderer's `pick` raycasts from `cam_main` through the pointer: first the hotspots in the room, the nearest hit winning, each one's `hit_<node>` in the scene model or its entity model's `hit` proxy, else its visible meshes; then the floor; else `none`. A hotspot that is not in the room (`setVisible` false, or not visible in the view) is not picked, `hit_<node>` ones included. Nearest rather than `hit_*` first, so the flyer standing on the pavement in front of the pub door's `hit_door` is the flyer. `Renderer.picksHotspots` says whether `pick` finds hotspots (true in 3D; the fake renderer of the unit tests leaves it false, as the 2D renderer did): the hotspot layer then gets the `pointer-through` class, which turns pointer events off on its buttons, and they stay for Tab, focus (hover) and Enter (activate) at their projected bounds, in scene-pixel percentages, so a resize keeps them on their models and each room lays them out anew. `app/game.ts` turns canvas pointer moves into `ui.pointed(hotspot | null)`, which hovers the hotspot in the UI bar and `data-hover` as a button hover does, sets the pointer cursor over hotspots, and turns a press on a hotspot into `activate`. The e2e helpers `clickHotspot` and `pointAtHotspot` (`tests/e2e/play.ts`) aim at the centre of a hotspot's button, which in 3D reaches the canvas, and the specs click hotspots through them.
- **What B5 built.** `app/animation.ts` (`animate`) turns the session's events into `renderer.play(who, clip)`: the player plays `walk` while `moved` comes and, standing, `pickup` once after `pickedUp` and `use` once after `used` (a new event: the selected item was taken by one of the hotspot's `use` interactions, before its effects; a refused item sends none), each held for `ONCE_MS` (600 ms, the contract's "about 0.6 s"), then `talk` while their line is up (`speechMs`, until `hushed`), then `idle`. The player's clip settles once a command's events are all in, so arriving to speak goes from `walk` straight to `talk`, and `play` is called only when it changes. A character plays `talk` from `conversationStarted` (its hotspot in the room) until the dialogue panel closes: the player walks away, leaves the room, or leaves the conversation with Leave or Escape, which the panel reports through `mountUi`'s `on.left` to the `conversationLeft` that `animate` returns. The app passes the player's clip to the mirror's `playerAnimation`, which writes `data-player-animation` (`idle` from the start). In 3D each placed model (the player and every entity) is a `three3d/actor.ts` `Actor` with an `AnimationMixer` of its own over the clips its glb carries (`Models` keeps them on each copy's `animations`): it starts on `idle`, cross-fades 0.15 s to the clip it is told, plays `pickup` and `use` once and holds their last frame, and plays `idle` for a clip the model lacks. The renderer advances the mixers every frame and keeps the player's clip from room to room. The player turns to the way they walk as since B2. Speech follows `renderer.anchor('player', 'head')` every frame (`Speech.follow`), so it stays on `anchor_head` as the model moves.
- **What B6 built.** 3D became the default renderer, with `?renderer=2d` as a fallback until B7, and the e2e suite ran once in each. The title screen loads no engine: the renderer's chunk is fetched after New game or Continue. Screenshots of the four rooms at 1280 × 800 and 960 × 540 are in `docs/screenshots/b6/`.
- **What B7 built.** The 2D path is gone: `presentation/phaser2d`, the `phaser` dependency, the registry's `sprite2d` variants and their checks, `scripts/render-art.mjs`, the rendered layers under `public/rooms/`, `?renderer=2d` and its e2e project. The room SVGs moved to `docs/design/rooms/` as reference art, and the title screen's backdrop to `public/title/poster.jpg`. The production build went from 4.42 MB (2.05 MB of JavaScript, 1.37 MB of it Phaser) to 1.32 MB (0.68 MB of JavaScript). A screenshot of the title screen is in `docs/screenshots/b7/`.
- **Renderer choice.** `app/renderers.ts` is the one place the app names a renderer: it loads the 3D renderer as its own chunk, so the title screen downloads no engine. The architecture spec's "Swapping the renderer" is a unit test (`tests/unit/renderer.acceptance.test.ts`) that plays the same route with two renderers behind the interface: the fake one, whose hotspot buttons take the pointer, and one that picks hotspots on its canvas as the 3D one does.

### DOM UI (`presentation/ui/`)

All controls and text are DOM over the canvas: the UI bar (location label, action line, hint), the speech line, hotspot buttons, inventory, the world switcher, the dialogue panel (#8), and the career stats and the act's goals (#11, `ui/progress.ts`: a `Career stats` list along the foot of the UI bar, and the act's name over a `Goals` list of checkboxes in the scene's top-left corner, checked once reached, re-rendered on `statChanged`, `goalReached` and `actStarted`). They are styled from `style.css` and `theme.ts`, with no inline styles. Setting `element.style.left` and the like from JS is fine under the CSP.

- **Hotspot buttons** get their rects from `renderer.hotspotBounds()` on every layout or camera change: the projected bounds of the hit area.
- **Speech** is positioned at `renderer.anchor('player', 'head')`.
- **Pointer input in 3D.** The 3D renderer turns pointer events off on the hotspot buttons. They stay focusable for keyboard and screen-reader players, but mouse hover and click are raycast against what is drawn (models spec, "Picking in 3D"). A renderer whose `picksHotspots` is false leaves the buttons taking the pointer.

This is what lets the renderer be swapped with the same public interface (architecture spec, "Replaceable renderer"). It also means the UI needs no canvas text or `loadFonts()` before a scene.

**The mount point (from A4).** `presentation/ui/index.ts` exports `mountUi(container, session, renderer, on, dialogue)`. It puts one overlay root (`ui/overlay.ts`) over the canvas, lines it up with the canvas on every resize and sets `--s`, the canvas scale, so `style.css` sizes everything in scene pixels as `calc(<px> * var(--s))`. In that root go the UI bar (`uiBar.ts`: location label, action line, hint), the inventory, the speech line (`speech.ts`, held for `max(3000, 60 * length)` ms), and the room's hotspot buttons and world switcher. The UI subscribes to the session for what it shows and dispatches commands for what the player does. It reports the hotspot under the pointer to `on.hover` (the mirror's `hover`) and the player leaving a conversation with Leave or Escape to `on.left`. Since A5 the overlay follows `renderer.canvas()` and `renderer.onResize`, the hotspot buttons go at `renderer.hotspotBounds()` and speech at `renderer.anchor('player', 'head')`. The app calls the returned `shown()` each time the renderer has drawn the session's room, and `walked()` when the player clicks the floor, which clears the hover. Once the session changes room, the old room's controls are removed until the new room is shown. The dialogue panel (#8) is a `ui/dialogue.ts` that `mountUi` creates and appends to the same root. It opens on `conversationStarted`, closes on Leave, Escape, walking away or a room change, and gets each turn from `dialogue`, a `DialogueBackend` the app passes in (`services/dialogue.ts`, `POST /dialogue/turn` with `X-Player-Id`): presentation imports no services. A reply that reaches the goal dispatches `dialogueResult`.

### The `#game` mirror (`app/mirror.ts`)

`data-scene`, `data-world`, `data-player` ("x,y" in scene pixels, which is the floor point, so it is the same whatever the renderer), `data-hover`, `data-say`, `data-act` (#11) and, from B5, `data-player-animation` are written from session events in one place. They are not written by renderers. Two of them are what only the view knows, which it reports to the mirror rather than writing them: `data-hover` (the pointer's hotspot, which the DOM UI reports) and when a room is drawn and takes input, which is when `data-scene` and `data-world` change.

## 6. Assets: the model registry (`assets/`)

Each scene, character and object is one registry entry, keyed by a `ModelId` that content refers to. A model is defined once and placed in as many rooms as needed. The protagonist is the same entry in every room. The flyer object is one entry, shown in both the opening room and the dream.

```jsonc
// frontend/src/assets/models.json
{
  "models": [
    { "id": "scene/opening", "kind": "scene",
      "model3d": { "file": "models/scenes/opening.glb", "placeholder": true } },
    { "id": "character/protagonist", "kind": "character",
      "model3d": { "file": "models/characters/protagonist.glb", "placeholder": true, "height": 1.5 } },
    { "id": "object/flyer", "kind": "object",
      "model3d": { "file": "models/objects/flyer.glb", "placeholder": true } }
  ]
}
```

- **What A8 built.** `assets/models.json` lists the entries, like the content files list theirs, so a second entry with the same id is a problem the validator reports rather than a key `JSON.parse` silently drops. `assets/registry.ts` checks the file's shape as it loads (or throws, listing the problems) and holds the `models` by id; `model3dFile` gives the renderer a model's glb. The protagonist's entry is `character/protagonist`, so nothing hangs on his placeholder name.
- **The model.** Every entry has a `model3d` (since B1; B7 removed the 2D `sprite2d` variants A8 started with): `{file, placeholder, height?}`, the glb's path under `public/`, whether it is still a placeholder, and a character's height in metres.
- **The registry holds no logic.** It never says what a thing does, only how it looks and where its anchors and hit areas are.
- **Validators** (`assets/validate.ts`, run in unit tests: the browser can't see which files are under `public/`) check two things:
  - every `model` id in content has an entry of the right kind, and every entry's id is used once;
  - every model file is at `models/<kind>s/<id>.glb` and meets the [asset contract](#8-asset-contract-for-the-designer). `assets/glb.ts` reads the glb with no dependency (its header and JSON chunk), and `assets/contract.ts` `checkModel` checks it for its kind, returning `{file, rule, message}`, with the rule's topic from section 8 (`nodes: anchor_head`, `budget: triangles`). The unit tests hand `validateAssets` the files under `public/models/`, and it reports a broken rule with the rule in the field. Since B3 a room's scene file must also have a `hit_<node>` node for each `node` hotspot, and every floor point of the room (its `walkable` corners, `start`, each hotspot's `walkTo` and entity `at`, and every `goTo` exit's `at` into it) must land on the file's `floor`: `contract.ts` `offFloor` casts the ray from `cam_main` with plain math on the camera and the floor's triangles, which `glb.ts` reads from the binary chunk, counting only faces turned to the camera as the renderer does. A point that misses is reported by the content file and field it is in.

  A problem is `{file, field, message}` as in the content validator, with a model named by its id in the field (`models[id=scene/opening].model3d.file`).

## 7. 3D: the engine decision

**Three.js. Phaser drew the 2D game until B7 removed it.**

- **It is the smallest option that does the job.** Three.js is about 170 KB gzipped tree-shaken, against Phaser's 1 MB bundle, so the build shrank (section 5, "What B7 built"). Everything the game needs is in the box: `GLTFLoader`, `AnimationMixer`, `Raycaster` for picking, and perspective cameras.
- **The look maps directly.** `MeshToonMaterial` with a 2-step `gradientMap` gives STYLE.md's two tones and hard terminator. A `DirectionalLight` from the upper left with shadow maps gives hard cast shadows down and to the right. There are no outline passes ("no outer outlines"). The grain is a CSS overlay (a self-hosted noise PNG at about 16%) above the canvas, so no post-processing is needed.
- **Babylon.js** is heavier (around 1 MB and up) and has its own GUI and inspector we don't need. **PlayCanvas** is built around its hosted editor. **react-three-fiber or Threlte** adds a UI framework the game doesn't otherwise use. **Phaser** has no 3D.
- **Phaser has no remaining job once the UI is DOM (A4).** It would only draw 2D image layers, which the 3D scene replaces. Keeping it as an overlay would ship two engines for nothing.
- **CSP.** Three.js needs no `eval`, wasm or workers when the asset contract below is followed (no Draco, meshopt or KTX2 decoders), so `_headers` stays as it is. One catch: `GLTFLoader` decodes embedded textures through a `blob:` URL with `fetch`, which `connect-src` does not allow. So the contract starts with **untextured, colour-only materials**, which is also what the flat two-tone style wants. Allowing textures later means adding `blob:` to `connect-src` in `frontend/public/_headers`, and that needs the owner's review.
- **WebGL in CI.** Three.js has no Canvas fallback. B2 must first prove that WebGL works in CI's headless Chromium. Recent Chromium may need `--enable-unsafe-swiftshader` or `--use-angle=swiftshader` in `playwright.config.ts`, which is an unsafe-change path that needs the owner's review. If WebGL is unavailable at run time, the game shows a short message on `#game` rather than a blank canvas.
- **Camera and coordinates.** Each scene model carries one perspective camera node, `cam_main`, rendered at the 2:1 scene aspect (1280 × 640 logical). A floor point (section 3) is turned into a world position by raycasting from `cam_main` through that scene pixel onto the ground plane (`y = 0`), and a world position goes back by projection. Picking raycasts against the hotspots in the room, the nearest hit winning (`hit_*` nodes and entity meshes alike), then the floor.
  - Because content coordinates are tied to the camera, changing a scene's `cam_main` means re-checking that room's floor points. The asset validator flags floor points that no longer land on the scene's `floor` mesh.
  - A moving or scrolling camera would need world-space floor coordinates. That would be its own spec change, and is out of scope here.

## 8. Asset contract (for the designer)

Every model file must follow this. A placeholder model follows it too, so a designer file is a drop-in replacement: same path, same node and clip names, no code or content change (models spec, "Replacing a placeholder"). The unit tests check every rule marked ✓.

| Topic | Rule |
| --- | --- |
| Format ✓ | glTF 2.0 binary, `.glb`, one file per registry entry. No `extensionsRequired`. No `KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu` (the CSP blocks their wasm decoders). |
| Location and naming ✓ | `frontend/public/models/<kind>/<id>.glb`, where kind is `scenes`, `characters` or `objects` and the id is lowercase kebab-case matching the registry (`characters/protagonist.glb`, `objects/broken-guitar.glb`, `scenes/opening.glb` for the registry entry `scene/opening`). |
| Units and axes ✓ | Metres, +Y up, the model faces +Z (glTF default), right-handed. Apply all transforms (scale 1, no negative scale) before export. |
| Origin ✓ | **Characters:** between the feet, on the ground (`y = 0`). **Objects:** the centre of their resting base. **Scenes:** the floor at `y = 0`, with the origin at the front centre of the walkable area. |
| Scale | The protagonist is about 1.5 m tall including ears (about 5.5 heads). Other animals scale from him. At the front of the walk line, `cam_main` frames him about 256 px tall in the 1280 × 640 view (STYLE.md). |
| Scene nodes ✓ | `cam_main` (perspective camera, the room's view). `floor` (the walkable ground mesh, `y = 0`, may be invisible). `hit_<hotspot-id>` for every part of the scene that is a hotspot (`hit_door`, `hit_board`), as a mesh or an invisible proxy. Optional: `light_key` (ignored; lighting comes from the renderer), `spawn_<name>` empties. |
| Character nodes ✓ | `anchor_head` (above the head: speech is placed here), `anchor_hand_r` (held items), `anchor_back` (the broken guitar on his back). Optional `hit` proxy mesh, else the visible mesh is picked. |
| Object nodes | An optional `hit` proxy. `anchor_grip` if a character can hold it. |
| Animations ✓ | Exact lowercase clip names. Characters must have `idle` (loop) and `walk` (loop, in place, no root motion; the game moves the character). They should have `talk` (loop), `pickup` and `use` (once, about 0.6 s), and may have `look` and the expressions `bored`, `curious`, `smug`, `panicked`. Objects may have `idle`. |
| Materials | Base colour only: **no textures** (see CSP above), no vertex-colour gradients, metallic 0, roughness 1. Colours come from the STYLE.md palette, one material per part named after it (`fur`, `muzzle`, `hoodie`, `jeans`, `high-tops`, `guitar`, `brick`, …). Give the **base** tone only. The renderer's two-step toon ramp makes the shade tone and the hard terminator. No outlines or inverted-hull meshes. |
| Budgets ✓ | Character ≤ 8,000 triangles, ≤ 64 joints, ≤ 1.5 MB. Object ≤ 2,000 triangles, ≤ 300 KB. Scene ≤ 60,000 triangles, ≤ 5 MB. Up to 4 joint influences per vertex. |
| Style | Angular, long tapered limbs, pointed snouts. Flat planes read best under the toon ramp. Silhouettes get lighter and bluer with distance, by material colour on the far set pieces (STYLE.md depth ramp). Light comes from the upper left, set by the renderer, so don't bake lighting. |

**Placeholders.** `frontend/scripts/make-placeholders.mjs` (B1, runs in Node with no new dependencies) writes contract-shaped glb files from simple primitives in the palette:

- a faceted capsule cat with ears and the anchors;
- a flat card for the flyer;
- a box guitar;
- a room shell with a floor, the scene's `hit_*` boxes and `cam_main`, laid out in the scene pixels of the room's reference art (`docs/design/rooms/<room>.svg`).

The output is committed, and each one is marked `"placeholder": true` in the registry. `tests/unit/placeholders.test.ts` checks that the script reproduces the committed files still marked `placeholder` byte for byte, so after changing the script, run it and commit its output with it. B1 writes the protagonist, the bartender (a crow), the flyer and the broken guitar; B3 writes the room shells of `opening`, `pub`, `feed` and `dream`. The script no longer writes a file whose entry is not a placeholder.

**Delivering a model.** Everything below runs in `frontend/` (`npm ci` once first; `npx playwright install chromium` once for the e2e tests).

1. Export the model as a glb that follows the table above, to its path: `public/models/<kind>s/<id>.glb`. For a placeholder, that is the file to replace. A new model also needs an entry in the registry, and content that names it (a room's `model`, a character's or object's `model`): that part is a content change.
2. In the registry, `src/assets/models.json`, set the entry's `model3d.placeholder` to `false`, so `make-placeholders.mjs` leaves the file alone. A character's `height` is its height in metres: the contract checks the file against it.
3. Run `npm test`. It checks every rule marked ✓, and for a scene that each of the room's `node` hotspots has its `hit_<node>` and that every floor point of the room's content lands on `floor` seen from `cam_main`. A problem names the file and the rule or field.
4. Look at it in the game: `npm run dev`, then New game at http://localhost:5173. Then run `npm run build` and `npm run test:e2e`, which plays the game in the browser.

A scene's floor points (its walkable area, start, walk-to points, where entities stand and where exits land) are scene pixels seen through `cam_main`. Keep the placeholder's camera, or expect step 3 to list the points that need moving in the room's content.

## 9. Tests

| What | Where | Notes |
| --- | --- | --- |
| Layering | `tests/unit/architecture.test.ts` | A1. The architecture spec, "Layered code". |
| Domain | `tests/unit/walk.test.ts`, `tests/unit/game-save.test.ts` | Pure. Floor geometry, and `toSave`/`fromSave`. |
| Rules | `tests/unit/rules.test.ts`, `tests/unit/rules.acceptance.test.ts` | Pure. Every command and effect, plus the "Playing without a renderer" script. |
| Content and registry | `tests/unit/content.test.ts`, `tests/unit/assets.test.ts`, `tests/unit/models.acceptance.test.ts`, `tests/unit/contract.test.ts`, `tests/unit/placeholders.test.ts` | The validators, against the real files and broken copies, with the glb contract over every `model3d` file and broken fixtures for each of its rules (`tests/fixtures/models/glb.ts`). The placeholders match their script. |
| App and session | `tests/unit/session.test.ts`, `tests/unit/game.test.ts` | The session: the `data-*` mirror and autosave. The app: a game played with the fake renderer (`tests/unit/fakes/renderer.ts`). |
| Renderer swap | `tests/unit/renderer.acceptance.test.ts` | The architecture spec, "Swapping the renderer": the same route with two renderers behind the interface (B7). |
| Behaviour | `tests/e2e/*.spec.ts` | Unchanged public interface, played with the 3D renderer. |

Acceptance tests for this spec change are written by its acceptance-tests issue: unit tests for `architecture` and the glb contract, e2e for `models`, marked expected-to-fail until their step lands.

B7 replaced what was tied to the 2D files:

- scenes "Swapping art", which replaced `background.jpg`, went; the scene-model swap the scenes spec names stays;
- `look.spec.ts` "the opening scene loads its art layers" became "the opening scene loads its models";
- the e2e "Swapping the renderer", which played the route with `?renderer=2d` and the 3D renderer, became the unit test above;
- the title screen's backdrop moved from `rooms/opening/poster.jpg` to `public/title/poster.jpg`.

`frontend/tests/e2e/play.ts` stays the single place for the public interface's selectors.

## Migration plan

Each step is one issue and one PR, and each keeps the game playable and CI green. Steps run strictly in order. Nearly every step touches what is left of `RoomScene`, so parallel steps would only conflict.

| Step (issue) | Size | What lands |
| --- | --- | --- |
| **A1** ([#27](https://github.com/alexsiri7/punland/issues/27)), done | 3 | Folders `domain/ rules/ content/ assets/ services/ presentation/ app/`. Move the pure modules (`walk.ts` → `domain/geometry.ts`, inventory and journey state, `Point` types, theme and fonts, api/save/player/storage → `services/`). `architecture.test.ts`. Stricter `tsconfig` flags. No behaviour change. |
| **A2** ([#28](https://github.com/alexsiri7/punland/issues/28)), done | 5 | `domain` `GameState` plus `rules/apply` with commands and events for everything `RoomScene` does today (walk and tick, activate, use X on Y, pickup, exit, enterWorld, gather, presence), with unit tests. Not wired in yet. |
| **A3** ([#29](https://github.com/alexsiri7/punland/issues/29)), done | 5 | `app/session.ts` (`GameSession`): `RoomScene` becomes a view that dispatches commands and draws from events. Autosave and the `data-*` mirror run from session events. Mutable `Inventory` and `Journey` classes are removed. The save format is unchanged. |
| **A4** ([#30](https://github.com/alexsiri7/punland/issues/30)), done | 3 | DOM UI layer: the UI bar text, action line, hint and speech move from Phaser text to `presentation/ui`, driven by the session. Hotspot, inventory and world controls move under `presentation/ui`. The dialogue panel (#8) builds on this. |
| **A5** ([#31](https://github.com/alexsiri7/punland/issues/31)), done | 5 | `presentation/renderer.ts` plus `presentation/phaser2d` (the only `phaser` import), with picking through `renderer.pick` and a fake renderer for unit tests. `game.ts`/`RoomScene` are folded into the 2D renderer and the app. |
| **A6** ([#32](https://github.com/alexsiri7/punland/issues/32)), done | 3 | Content validators: every content file is checked at load and in tests, ids are branded, and errors name the file and the field. |
| **A7** ([#33](https://github.com/alexsiri7/punland/issues/33)), done | 5 | Entities and interactions as data: `characters.json` and `objects.json`, rooms place entities, `interactions` with verbs, conditions and effects replace `action` and `uses`, the `talk` effect, and the four rooms migrated. |
| **A8** ([#34](https://github.com/alexsiri7/punland/issues/34)), done | 3 | Model registry (`assets/models.json`) with the `sprite2d` variants. Hotspot rects and actor/layer mapping move out of room content. Registry validators. |
| **A9** ([#35](https://github.com/alexsiri7/punland/issues/35)), done | 2 | Phase A gate: remove leftover shims, check that every layer matches this document, and update the status line below. Every phase-B step waits on this one. |
| **B1** ([#36](https://github.com/alexsiri7/punland/issues/36)), done | 5 | The 3D asset contract in code: `model3d` registry entries, the glb contract validator (unit tests), and `make-placeholders.mjs` with committed placeholders for the protagonist, bartender, flyer and broken guitar. |
| **B2** ([#37](https://github.com/alexsiri7/punland/issues/37)), done | 5 | `presentation/three3d`: renderer behind `?renderer=3d`. Proves WebGL in CI. Fixed `cam_main` camera, the toon look, floor raycast ↔ floor points, projected hotspot bounds and anchors, and the grain overlay. Adds the `three` dependency. |
| **B3** ([#38](https://github.com/alexsiri7/punland/issues/38)), done | 5 | Placeholder scene models for `opening`, `pub`, `feed` and `dream`, with `cam_main`, `floor` and the `hit_*` nodes matching today's hotspots. Entities placed from the registry, with the flyer reused in two rooms. |
| **B4** ([#39](https://github.com/alexsiri7/punland/issues/39)), done | 3 | 3D picking and hover: raycast `hit_*` and entity meshes, hover drives `data-hover` and the action line, DOM buttons follow the projected bounds. |
| **B5** ([#40](https://github.com/alexsiri7/punland/issues/40)), done | 3 | Character animation: `AnimationMixer` clips from session events (walk, idle, talk, pickup, use), facing, `data-player-animation`. |
| **B6** ([#41](https://github.com/alexsiri7/punland/issues/41)), done | 3 | 3D becomes the default renderer. The whole e2e suite runs against it, and `?renderer=2d` stays as a fallback. |
| **B7** ([#42](https://github.com/alexsiri7/punland/issues/42)), done | 3 | Remove the 2D path: `phaser2d`, the `phaser` dependency, `sprite2d` entries, `scripts/render-art.mjs` and `public/rooms/*` layers. Replace the 2D-specific tests (see Tests). Update CLAUDE.md and STYLE.md's "Scene build" to describe 3D. |

**Status:** design merged (spec change #25); acceptance tests #26 done; phase A done (A1 to A9); phase B done (B1 to B7). Every step is `blocked_by` the one before it and by #26; every B step is also blocked by A9 (#35). Dialogue UI #8 builds on A4 (#30); stats and acts #11 are done.
