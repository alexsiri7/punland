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
  assets/        model registry: entity id -> renderer asset entries (2D sprites/layers, 3D glb + metadata) + validators
  services/      infrastructure: api.ts, save stores (local, backend), player id, storage, dialogue client
  presentation/
    renderer.ts  the Renderer interface and its types (no engine imports)
    ui/          DOM overlay: UI bar, action line, speech, hotspot buttons, inventory, world switcher, dialogue panel
    theme.ts     design tokens (palette, fonts, sizes); fonts.ts; style.css
    phaser2d/    the 2D renderer: the ONLY folder that imports `phaser` (removed in B7)
    three3d/     the 3D renderer: the ONLY folder that imports `three` (from B2)
  app/           composition root: main.ts boot, title screen, GameSession, data-* mirror, autosave wiring, renderer choice
```

**Allowed imports.** A layer may import itself and the layers in its row, nothing else.

| Layer | May import | Must not touch |
| --- | --- | --- |
| `domain` | — | any other layer, `phaser`, `three`, `document`/`window`/`localStorage`/`fetch`, `import.meta.env` |
| `rules` | `domain` | the same as domain |
| `content` | `domain` | renderers, DOM, network. `import.meta.glob` of JSON is allowed. |
| `assets` | `domain` | renderers, DOM, network (JSON manifests only) |
| `services` | `domain` | `rules`, `content`, `presentation` |
| `presentation/renderer.ts`, `presentation/ui` | `domain`, `assets` (types), `presentation/theme` | `rules` (UI only shows events and sends commands through the session), `phaser`, `three` |
| `presentation/phaser2d` | `presentation/*` except `three3d`, `domain`, `assets`, `phaser` | `rules`, `services`, `three` |
| `presentation/three3d` | `presentation/*` except `phaser2d`, `domain`, `assets`, `three` | `rules`, `services`, `phaser` |
| `app` | everything | — |

**How it is enforced: an architecture unit test, not a linter.** `frontend/tests/unit/architecture.test.ts` (added in A1) reads every file under `src/`. It extracts static imports, `export … from`, dynamic `import()` and `import.meta.glob` specifiers, resolves relative ones to a layer, and fails on any import outside the table above. It names the file and the import. It also fails on browser globals (`document`, `window`, `localStorage`, `fetch`, `navigator`) in `domain/` and `rules/`.

The reasons for a test rather than a lint tool:

- **The tools don't support the compiler.** The repo is on TypeScript 7 (the native compiler), which has no JavaScript compiler API. typescript-eslint (so eslint-plugin-boundaries too) supports `typescript < 6.1`, and dependency-cruiser needs that API (or swc) to parse `.ts`.
- **It costs nothing to add.** A test adds no dependency, no `package.json` script and no CI change, so it runs in the existing `npm test` CI step, and factory PRs that touch it pass the unsafe-change check.

If a TS-7-compatible linter is wanted later, Oxlint (Rust, parses TS itself) is the candidate. The test stays the source of truth for layering.

`tsconfig.json` is `strict`, with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noImplicitOverride` on (from A1).

Code that A1 moved into a layer but that still imports across the table (the `phaser2d` game and scene import `content/` and `services/`, and its `room/` controls import `content/`) is listed in `tests/unit/support/layer-baseline.json`. The test fails on a new violation and on an entry that no longer occurs, so the list only shrinks; the step that removes an import deletes its entry, and A9 needs the list empty.

## 3. Domain model (`domain/`)

The domain is plain, serialisable data: no classes with hidden state, no engine types. Ids are branded strings (`type RoomId = string & {readonly __brand: 'RoomId'}`), made only by the content validators.

```ts
// Coordinates on a room's floor. While each room has one fixed camera (all of phase B), a floor
// point is the scene-pixel position (1280 x 640) where that spot of floor appears on screen.
// In 2D this is the art itself. In 3D the renderer maps it to the ground plane by raycasting
// from the room camera. A projective map keeps lines straight and convex polygons convex, so
// walking in straight lines on a convex floor, saves and the e2e tests carry over unchanged.
interface FloorPoint { x: number; y: number }

interface World     { id: WorldId; name: string; start: RoomId; locked?: string }
interface Item      { id: ItemId; name: string; noUse: string; model: ModelId }
interface Character { id: CharacterId; name: string; model: ModelId; dialogue?: { sheet: CharacterId } } // sheet id = backend sheet
interface Prop      { id: ObjectId; name: string; model: ModelId }  // a reusable prop, e.g. the flyer
interface Room {
  id: RoomId; world: WorldId; model: ModelId;            // the scene's model (2D layers or 3D glb)
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
  journey: { left: Partial<Record<WorldId, Place>>; gathered: MaterialId[] };
  flags: Record<string, boolean | number | string>;      // puzzle state; #11 adds stats, act and goals beside it
  // transient, never saved:
  selected: ItemId | null;
  walk: { target: FloorPoint; then: { hotspot: HotspotId; item: ItemId | null } | null } | null; // on arrival: the hotspot's interaction, or use `item` on it
  saying: { line: string; by: 'player' | CharacterId } | null;
}
```

- **Today's content shapes.** Until A6 and A7, `domain/content.ts` holds the content types as the files have them today (string ids, `action` and `uses` on a hotspot, items keyed by id), and `Content` carries the start room and items. `content/index.ts` (`loadContent()`) puts the files together.
- **Save format.** `SaveGame` stays `version: 1` and only grows by optional fields, so old saves still load (architecture spec, "An older save"). `domain/save.ts` holds `SaveGame` (with an optional `at`, the spot the player stood on), `toSave(state)` and `fromSave(save, content)`, which drops unknown ids the way `game.ts` does today. `toSave` leaves out `savedAt`: the rules read no clock, so whoever writes the save stamps it.
- **Hotspot rects.** The screen `rect` of a hotspot moves out of the room content into the room's 2D asset entry (A8). In 3D it is derived from the projected bounds of the model's hit area.
- **Stats and acts (#11).** These plug in as `GameState.stats`, `GameState.act` and `GameState.goals`, plus the effects `changeStat` and `reachGoal` and the conditions `stat`, `act` and `goal`. Act definitions go in `content/acts.json`. No other layer needs to change.

## 4. Rules (`rules/`): commands, events, interactions

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
  | { type: 'pickedUp'; item: ItemId; hotspot: HotspotId } | { type: 'itemRemoved'; item: ItemId }
  | { type: 'selected'; item: ItemId | null }
  | { type: 'roomChanged'; room: RoomId; at: FloorPoint } | { type: 'worldChanged'; world: WorldId }
  | { type: 'hotspotShown' | 'hotspotHidden'; hotspot: HotspotId }
  | { type: 'conversationStarted'; character: CharacterId }
  | { type: 'gathered'; material: MaterialId }
  | { type: 'saved' };                                     // state worth persisting changed

function apply(content: Content, state: GameState, command: Command): { state: GameState; events: GameEvent[] };
```

- **Dialogue.** `dialogueResult` and `conversationStarted` arrive with the dialogue panel (#8); A2 has the rest.
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
  type Condition = { has: ItemId } | { pickedUp: ItemId } | { gathered: MaterialId } | { flag: string; is?: boolean | number | string } | { not: Condition };
  type Effect =
    | { say: string } | { goTo: RoomId; at?: FloorPoint } | { pickUp: ItemId } | { give: ItemId } | { take: ItemId }
    | { gather: MaterialId } | { set: string; to: boolean | number | string } | { talk: CharacterId };
  ```

  Activating a hotspot with no item selected runs its first interaction whose verb is the hotspot's default and whose conditions hold. With an item selected, it runs the matching `use` interaction for that item, or else says the item's `noUse`. Adding an effect or condition is a rules change with unit tests. Adding a puzzle that uses existing ones is content only (progress spec, "Adding a puzzle").
- **The session.** `app/session.ts` (`GameSession`) owns the current `GameState`. It exposes `dispatch(command)` and `subscribe(listener)`, applies the rules and fans the events out to the renderer, the UI, the `data-*` mirror and autosave (on `saved`). It is the one stateful object, and it is small.

## 5. Presentation

### Renderer interface (`presentation/renderer.ts`)

```ts
interface SceneView {                              // what to draw, built by the app from content + state
  room: RoomId; model: ModelId;
  entities: { hotspot: HotspotId; model: ModelId; at?: FloorPoint; node?: string; visible: boolean }[];
  player: { model: ModelId; at: FloorPoint };
}
type Pick = { kind: 'hotspot'; hotspot: HotspotId } | { kind: 'floor'; at: FloorPoint } | { kind: 'none' };

interface Renderer {
  mount(container: HTMLElement): Promise<void>;       // creates its canvas inside #game
  show(view: SceneView): Promise<void>;               // load (cached) assets, draw the room
  setPlayer(at: FloorPoint, facing: 'left' | 'right'): void;
  setVisible(hotspot: HotspotId, visible: boolean): void;
  play(who: 'player' | HotspotId, clip: AnimationName): void;   // no-op in 2D
  pick(screen: { x: number; y: number }): Pick;       // screen = scene pixels (1280 x 640)
  hotspotBounds(hotspot: HotspotId): Rect | null;     // scene pixels, for the DOM hotspot buttons
  anchor(who: 'player' | HotspotId, name: 'head' | 'hand_r'): { x: number; y: number } | null; // speech placement
  canvas(): HTMLCanvasElement;                        // for the DOM overlay to line up with
  frame(callback: (dtMs: number) => void): () => void;// frame loop; the app sends `tick`
  destroy(): void;
}
```

- **Renderers draw. They decide nothing.** Input goes `canvas pointer → renderer.pick → app → session.dispatch`. A fake renderer (`tests/unit/fakes/renderer.ts`) lets the app and session be tested in jsdom.
- **Renderer choice.** The app picks the renderer: `?renderer=2d|3d` while both exist (B2 to B6), with 3D the default from B6 and 2D removed in B7.

### DOM UI (`presentation/ui/`)

All controls and text are DOM over the canvas: the UI bar (location label, action line, hint), the speech line, hotspot buttons, inventory, the world switcher, and the dialogue panel (#8). They are styled from `style.css` and `theme.ts`, with no inline styles. Setting `element.style.left` and the like from JS is fine under the CSP.

- **Hotspot buttons** get their rects from `renderer.hotspotBounds()` on every layout or camera change. In 2D that is the asset entry's rect. In 3D it is the projected bounds of the hit area.
- **Speech** is positioned at `renderer.anchor('player', 'head')`.
- **Pointer input in 3D.** The 3D renderer turns pointer events off on the hotspot buttons. They stay focusable for keyboard and screen-reader players, but mouse hover and click are raycast against what is drawn (models spec, "Picking in 3D"). In 2D the buttons keep taking the pointer, as today.

This is what lets the renderer be swapped with the same public interface (architecture spec, "Replaceable renderer"). It also means the UI no longer needs Phaser text or `loadFonts()` before a scene.

### The `#game` mirror (`app/mirror.ts`)

`data-scene`, `data-world`, `data-player` ("x,y" in scene pixels, which is the floor point, so it is the same in 2D and 3D), `data-hover`, `data-say` and, from B5, `data-player-animation` are written from session events in one place. They are not written by renderers.

## 6. Assets: the model registry (`assets/`)

Each scene, character and object is one registry entry, keyed by a `ModelId` that content refers to. A model is defined once and placed in as many rooms as needed. The protagonist is the same entry in every room. The flyer object is one entry, shown in both the opening room and the dream.

```jsonc
// frontend/src/assets/models.json
{
  "models": {
    "scene/opening":   { "kind": "scene",
                         "sprite2d": { "layers": "rooms/opening/art.json", "hotspots": { "door": {"x":..,"y":..,"width":..,"height":..}, "board": {..} } },
                         "model3d":  { "file": "models/scenes/opening.glb", "placeholder": true } },
    "character/paws":  { "kind": "character",
                         "sprite2d": { "actor": "cat" },
                         "model3d":  { "file": "models/characters/paws.glb", "placeholder": true, "height": 1.5 } },
    "object/flyer":    { "kind": "object", "sprite2d": { "actor": "flyer" },
                         "model3d":  { "file": "models/objects/flyer.glb", "placeholder": true } }
  }
}
```

- **Variants.** `sprite2d` is filled in A8 and removed in B7. `model3d` is filled from B1.
- **The registry holds no logic.** It never says what a thing does, only how it looks and where its anchors and hit areas are.
- **Validators** (`assets/validate.ts`, run in unit tests) check four things:
  - every `model` id in content has an entry of the right kind;
  - every file exists;
  - every `hotspots`/`node` a room uses exists, as a 2D rect or a 3D `hit_*` node;
  - every 3D file meets the [asset contract](#8-asset-contract-for-the-designer). The glb is parsed in the test with no dependency: read its JSON chunk and inspect it.

## 7. 3D: the engine decision

**Three.js, with Phaser removed at the end (B7).**

- **It is the smallest option that does the job.** Three.js is about 170 KB gzipped tree-shaken, against Phaser's 1 MB bundle, so the build shrinks. Everything the game needs is in the box: `GLTFLoader`, `AnimationMixer`, `Raycaster` for picking, and perspective cameras.
- **The look maps directly.** `MeshToonMaterial` with a 2-step `gradientMap` gives STYLE.md's two tones and hard terminator. A `DirectionalLight` from the upper left with shadow maps gives hard cast shadows down and to the right. There are no outline passes ("no outer outlines"). The grain is a CSS overlay (a self-hosted noise PNG at about 16%) above the canvas, so no post-processing is needed.
- **Babylon.js** is heavier (around 1 MB and up) and has its own GUI and inspector we don't need. **PlayCanvas** is built around its hosted editor. **react-three-fiber or Threlte** adds a UI framework the game doesn't otherwise use. **Phaser** has no 3D.
- **Phaser has no remaining job once the UI is DOM (A4).** It would only draw 2D image layers, which the 3D scene replaces. Keeping it as an overlay would ship two engines for nothing.
- **CSP.** Three.js needs no `eval`, wasm or workers when the asset contract below is followed (no Draco, meshopt or KTX2 decoders), so `_headers` stays as it is. One catch: `GLTFLoader` decodes embedded textures through a `blob:` URL with `fetch`, which `connect-src` does not allow. So the contract starts with **untextured, colour-only materials**, which is also what the flat two-tone style wants. Allowing textures later means adding `blob:` to `connect-src` in `frontend/public/_headers`, and that needs the owner's review.
- **WebGL in CI.** Three.js has no Canvas fallback. B2 must first prove that WebGL works in CI's headless Chromium. Recent Chromium may need `--enable-unsafe-swiftshader` or `--use-angle=swiftshader` in `playwright.config.ts`, which is an unsafe-change path that needs the owner's review. If WebGL is unavailable at run time, the game shows a short message on `#game` rather than a blank canvas.
- **Camera and coordinates.** Each scene model carries one perspective camera node, `cam_main`, rendered at the 2:1 scene aspect (1280 × 640 logical). A floor point (section 3) is turned into a world position by raycasting from `cam_main` through that scene pixel onto the ground plane (`y = 0`), and a world position goes back by projection. Picking raycasts against the `hit_*` nodes first, then the floor.
  - Because content coordinates are tied to the camera, changing a scene's `cam_main` means re-checking that room's floor points. The asset validator flags floor points that no longer land on the scene's `floor` mesh.
  - A moving or scrolling camera would need world-space floor coordinates. That would be its own spec change, and is out of scope here.

## 8. Asset contract (for the designer)

Every model file must follow this. A placeholder model follows it too, so a designer file is a drop-in replacement: same path, same node and clip names, no code or content change (models spec, "Replacing a placeholder"). The unit tests check every rule marked ✓.

| Topic | Rule |
| --- | --- |
| Format ✓ | glTF 2.0 binary, `.glb`, one file per registry entry. No `extensionsRequired`. No `KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu` (the CSP blocks their wasm decoders). |
| Location and naming ✓ | `frontend/public/models/<kind>/<id>.glb`, where kind is `scenes`, `characters` or `objects` and the id is lowercase kebab-case matching the registry (`characters/paws.glb`, `objects/broken-guitar.glb`, `scenes/opening.glb` for the registry entry `scene/opening`). |
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
- a room shell with a floor, the scene's `hit_*` boxes and `cam_main` matched to today's 2D art.

The output is committed, and each one is marked `"placeholder": true` in the registry. A designer replaces a placeholder by writing a file of the same name, running `npm test` (contract check) and `npm run test:e2e`, then flipping `placeholder` to `false`.

## 9. Tests

| What | Where | Notes |
| --- | --- | --- |
| Layering | `tests/unit/architecture.test.ts` | A1. The architecture spec, "Layered code". |
| Rules | `tests/unit/rules/*.test.ts` | Pure. Every command and effect, plus the "Playing without a renderer" script. |
| Content and registry | `tests/unit/content.test.ts`, `tests/unit/assets.test.ts` | Replace the checks now in `rooms.test.ts`. They include the glb contract checks. |
| App and session | `tests/unit/session.test.ts` | Fake renderer: the `data-*` mirror and autosave. |
| Behaviour | `tests/e2e/*.spec.ts` | Unchanged public interface. Renderer-specific tests are listed below. |

Acceptance tests for this spec change are written by its acceptance-tests issue: unit tests for `architecture` and the glb contract, e2e for `models`, marked expected-to-fail until their step lands.

Three existing tests are tied to the 2D files:

- scenes "Swapping art" (it replaces `background.jpg`);
- `look.spec.ts` "the opening scene loads its art layers";
- the title screen's `rooms/opening/poster.jpg` backdrop in `style.css`.

These tests and the backdrop stay until **B7**, which is the one step allowed to replace them:

- "Swapping art" becomes the scene-model swap that the scenes spec now names. The acceptance-tests issue adds that variant first, marked expected-to-fail.
- The look test checks the opening room's models load.
- The poster moves to a static `public/title/poster.jpg`.

`frontend/tests/e2e/play.ts` stays the single place for the public interface's selectors.

## Migration plan

Each step is one issue and one PR, and each keeps the game playable and CI green. Steps run strictly in order. Nearly every step touches what is left of `RoomScene`, so parallel steps would only conflict.

| Step (issue) | Size | What lands |
| --- | --- | --- |
| **A1** ([#27](https://github.com/alexsiri7/punland/issues/27)), done | 3 | Folders `domain/ rules/ content/ assets/ services/ presentation/ app/`. Move the pure modules (`walk.ts` → `domain/geometry.ts`, inventory and journey state, `Point` types, theme and fonts, api/save/player/storage → `services/`). `architecture.test.ts`. Stricter `tsconfig` flags. No behaviour change. |
| **A2** ([#28](https://github.com/alexsiri7/punland/issues/28)), done | 5 | `domain` `GameState` plus `rules/apply` with commands and events for everything `RoomScene` does today (walk and tick, activate, use X on Y, pickup, exit, enterWorld, gather, presence), with unit tests. Not wired in yet. |
| **A3** ([#29](https://github.com/alexsiri7/punland/issues/29)) | 5 | `app/session.ts` (`GameSession`): `RoomScene` becomes a view that dispatches commands and draws from events. Autosave and the `data-*` mirror run from session events. Mutable `Inventory` and `Journey` classes are removed. The save format is unchanged. |
| **A4** ([#30](https://github.com/alexsiri7/punland/issues/30)) | 3 | DOM UI layer: the UI bar text, action line, hint and speech move from Phaser text to `presentation/ui`, driven by the session. Hotspot, inventory and world controls move under `presentation/ui`. The dialogue panel (#8) builds on this. |
| **A5** ([#31](https://github.com/alexsiri7/punland/issues/31)) | 5 | `presentation/renderer.ts` plus `presentation/phaser2d` (the only `phaser` import), with picking through `renderer.pick` and a fake renderer for unit tests. `game.ts`/`RoomScene` are folded into the 2D renderer and the app. |
| **A6** ([#32](https://github.com/alexsiri7/punland/issues/32)) | 3 | Content validators: every content file is checked at load and in tests, ids are branded, and errors name the file and the field. |
| **A7** ([#33](https://github.com/alexsiri7/punland/issues/33)) | 5 | Entities and interactions as data: `characters.json` and `objects.json`, rooms place entities, `interactions` with verbs, conditions and effects replace `action` and `uses`, the `talk` effect, and the four rooms migrated. |
| **A8** ([#34](https://github.com/alexsiri7/punland/issues/34)) | 3 | Model registry (`assets/models.json`) with the `sprite2d` variants. Hotspot rects and actor/layer mapping move out of room content. Registry validators. |
| **A9** ([#35](https://github.com/alexsiri7/punland/issues/35)) | 2 | Phase A gate: remove leftover shims, check that every layer matches this document, and update the status line below. Every phase-B step waits on this one. |
| **B1** ([#36](https://github.com/alexsiri7/punland/issues/36)) | 5 | The 3D asset contract in code: `model3d` registry entries, the glb contract validator (unit tests), and `make-placeholders.mjs` with committed placeholders for the protagonist, bartender, flyer and broken guitar. |
| **B2** ([#37](https://github.com/alexsiri7/punland/issues/37)) | 5 | `presentation/three3d`: renderer behind `?renderer=3d`. Proves WebGL in CI. Fixed `cam_main` camera, the toon look, floor raycast ↔ floor points, projected hotspot bounds and anchors, and the grain overlay. Adds the `three` dependency. |
| **B3** ([#38](https://github.com/alexsiri7/punland/issues/38)) | 5 | Placeholder scene models for `opening`, `pub`, `feed` and `dream`, with `cam_main`, `floor` and the `hit_*` nodes matching today's hotspots. Entities placed from the registry, with the flyer reused in two rooms. |
| **B4** ([#39](https://github.com/alexsiri7/punland/issues/39)) | 3 | 3D picking and hover: raycast `hit_*` and entity meshes, hover drives `data-hover` and the action line, DOM buttons follow the projected bounds. |
| **B5** ([#40](https://github.com/alexsiri7/punland/issues/40)) | 3 | Character animation: `AnimationMixer` clips from session events (walk, idle, talk, pickup, use), facing, `data-player-animation`. |
| **B6** ([#41](https://github.com/alexsiri7/punland/issues/41)) | 3 | 3D becomes the default renderer. The whole e2e suite runs against it, and `?renderer=2d` stays as a fallback. |
| **B7** ([#42](https://github.com/alexsiri7/punland/issues/42)) | 3 | Remove the 2D path: `phaser2d`, the `phaser` dependency, `sprite2d` entries, `scripts/render-art.mjs` and `public/rooms/*` layers. Replace the 2D-specific tests (see Tests). Update CLAUDE.md and STYLE.md's "Scene build" to describe 3D. |

**Status:** design merged (spec change #25); acceptance tests #26 done; phase A in progress (A1 and A2 done). Every step is `blocked_by` the one before it and by #26; every B step is also blocked by A9 (#35). Dialogue UI #8 waits on A4 (#30); stats and acts #11 wait on A7 (#33).
