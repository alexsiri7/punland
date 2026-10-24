# Tune Story style guide

Every new scene, character, prop and piece of UI follows this guide. It comes from the owner's design canvas (claude.ai artifact `CMpXXWHtyeBqd1Ma7D7kQR`, "Tune Story — look & protagonist", 2026-10-24). The canvas source is copied into [`canvas/`](canvas/):

| Board | File | What it fixes |
| --- | --- | --- |
| 1 · Style guide | [`canvas/Main.dc.html`](canvas/Main.dc.html) | palette, shading, line weight, type, UI bar, scene build |
| 2 · Protagonist | [`canvas/Character.dc.html`](canvas/Character.dc.html) | the cat: proportions, colours, turnaround, expressions, broken guitar |
| 3 · Scene, outside The Three Crows | [`canvas/Pub.dc.html`](canvas/Pub.dc.html) | the opening room, which is the reference for every street scene |

The boards are HTML for the design tool. Open them in a browser to look at them. The SVG markup inside them is the reference art. The tool's runtime (`support.js`) is not included, so they render without its chrome.

The working implementation is the opening room: [`frontend/art/opening/scene.svg`](../../frontend/art/opening/scene.svg). It is board 3's SVG, rendered to the files the game loads. When this guide and the canvas disagree, the canvas wins. Ask the owner, then update this file.

## Mood

Indie dusk. Cartoony, but for teens and up. Flat shapes, two tones, hard shadows.

References: Return to Monkey Island, Monkey Island 2 cover art, and indie travel-poster art (Out of Line, The Islands).

- **Angular characters.** Long tapered limbs, pointed snouts and chins, big confident silhouettes. No round, bubbly forms.
- **Poster depth.** Use 3 or 4 flat silhouette layers, each lighter and bluer with distance. The far layers have no detail. Depth ramp, near to far: `#2F2D35` · `#4A4A5E` · `#6E6A82` · `#8E879C`.
- **Fine grain.** Every scene gets a noise overlay at about 16%, so the flat colour looks printed rather than vector-clean. It is the `p-grain` filter in `scene.svg`.
- **Warm against cool.** The world is cool blue, with warm pools of shop light. Interiors and windows carry the warmth.

## Palette

No primaries and no candy pastels. Everything sits slightly toward violet-grey. The UI tokens live in `frontend/src/theme.ts` and the `:root` variables in `frontend/src/style.css`. Use those, not new hex values.

| Group | Name | Hex |
| --- | --- | --- |
| Sky | Dusk blue / Haze violet / Horizon clay | `#2E3A52` / `#6E6478` / `#C98A6C` |
| Sky | Sky gradient (stops at 0 / 60 / 100%) | dusk blue → haze violet → horizon clay. **This is the only gradient allowed in scene art.** |
| City | Skyline / Brick / Brick shade / Pavement / Kerb / Road | `#4A4A5E` / `#6E4038` / `#5A332D` / `#5E5A62` / `#4A464E` / `#2F2D35` |
| Light | Window glow / String-light bulb / Sign gold / Lamp amber | `#E8B566` / `#FFE3A0` / `#E3C58A` / `#C99A54` |
| Accents | Spray teal / Poster red / Poster violet / Leaf / Stem / Flyer paper | `#5FA39A` / `#C8483B` / `#8A7FA8` / `#3E5E44` / `#2F4A36` / `#D9CDB4` |
| Ink & UI | UI ground / Slot / Slot edge / UI text / Muted text | `#1C1D22` / `#26272E` / `#3A3C46` / `#E8E4DC` / `#A9A6B2` |
| Ink & UI | Label text / Divider / Cast shadow | `#8E8B98` / `#34363F` / `#141218` at 45% |
| Ink | Architecture frame stroke | `#2A1C1A` |

## Shading and shadows

- Light comes from the **upper left**, like a low dusk sun.
- Each material gets **two tones**, a base and a shade. The shade sits on the right, about 15–20% darker and nudged toward violet.
- **Terminators are hard.** Never blend softly on objects.
- **Cast shadows** are flat `#141218` at 45%, with a hard edge, thrown down and to the right. A shadow lives in the same layer as the thing casting it.
- **Light pools** are flat polygons of `#FFE3A0` or `#E8B566` at 7–25% opacity.

## Line weight

These sizes are at 1280 × 640 scene scale. Use round caps and joins.

- **No outer outlines** on characters, props or plants. Shapes read by tone.
- Detail lines use the darkest local colour, never pure black.
  - Wires, whiskers and string: 1.5 px.
  - Lids, brows and mouth: 1.6–2 px.
  - Graffiti tags: 3.5 px.
- Only architecture gets a frame stroke: 4–5 px, ink `#2A1C1A`.

## Type

| Use | Font | Spec |
| --- | --- | --- |
| UI: menus, action line, dialogue, labels | **Inter** 400 / 500 / 600 | Action line 20–22 / 500. Dialogue 15 / 400. Labels 12 px caps with +2 tracking. |
| In-world signs, posters, titles | **Bebas Neue** | Track wide on boards (+4 to +6), tighter on chalk. The title "TUNE STORY" is sign gold `#E3C58A`. |

Both fonts are self-hosted from `@fontsource/*` (OFL) and imported in `frontend/src/fonts.ts`. **Do not link Google Fonts**, because the production CSP (`frontend/public/_headers`) only allows fonts from `'self'`. Phaser draws text on a canvas, which does not trigger font loading, so a scene must start after `loadFonts()` resolves (`main.ts` already does this).

## UI

- **UI bar.** It is 1280 × 160 and sits under the 1280 × 640 scene, so the game canvas is 1280 × 800.
  - Location label: 12 px caps, label text colour, for example `PUNLAND · HIGH STREET`.
  - Action line: the verb in muted text, the object in sign gold, for example "Walk to **The Three Crows**".
  - Hint: 13 px, label colour.
- **Inventory slots** (#5, #8): 64 px, radius 10.
  - Colours: slot fill `#26272E`, 1 px slot-edge border. A gold edge means selected.
  - Icons: 2 px stroke `#CFC9BE`, no fills. The canvas has icons for the broken guitar, duffel bag, bus ticket, loose change, cracked phone and songbook. Copy their SVG from board 1 or board 3.
- **Buttons** (title menu, dialogue options) are slots made wide: slot fill, slot edge, gold edge and gold text on hover or focus.
- **Ground.** UI panels sit on UI ground `#1C1D22`, with dividers in `#34363F`.

## Scene build

Every room is **one 1280 × 640 SVG** (`frontend/art/<room>/scene.svg`) with one `<g id="layer-…">` per layer, back to front:

1. `layer-sky`: the gradient rect.
2. `layer-far`: skyline and wires.
3. `layer-mid`: buildings.
4. `layer-ground`: the walkable path.
5. `layer-props`: posters, bins.
6. `layer-actors`: characters, one `<g id="…">` each. They become separate swappable sprites.
7. `layer-fore`: vines and lamp posts, drawn in front of the actors.
8. Hotspots: invisible and named. These come from room content data (#4), not from the art.

The scene ends with the full-frame grain rect.

Characters stand about **256 px tall** at the front of the walk line.

To get from SVG to game files, run `cd frontend && node scripts/render-art.mjs [room]`. It renders in headless Chromium with the self-hosted fonts, because an SVG used as an image cannot load web fonts. It writes `public/rooms/<room>/`:

| File | Contents |
| --- | --- |
| `background.jpg` | Layers 1–5 plus grain. |
| `<actor>.png` | Each actor, cropped. |
| `fore.png` | The foreground layer. |
| `poster.jpg` | Everything composited, used as the title screen backdrop. |
| `art.json` | Each layer's position and depth. |

Output is 2× scale. Commit the SVG and the rendered files together, and never hand-edit the PNG or JPG files. Swapping art means editing the SVG and re-rendering, with no code change. That keeps to the "art is a swappable placeholder file per room" invariant.

## The protagonist (board 2)

- **Name: Paws Anka (placeholder).** A pun on Paul Anka, chosen by the owner on 2026-10-24 as a working name. It may change, so treat it as a placeholder: don't build puns, puzzles or dialogue that only work with this exact name, and don't invent a different one. In code the name lives only in `frontend/src/content/protagonist.ts`; read it from there, never hard-code it. The canvas still says `[PROTAGONIST NAME]`.
- **Who he is.** A lanky teenage ginger cat from Literal Village. He wears a hoodie and worn high-tops, and carries a guitar that has seen better days. Friendly, eager, a bit mischievous: more hapless hero than bad boy.
- **Proportions.** About 5.5 heads tall with ears, and 256 px tall in a 1280 × 640 scene. Narrow shoulders, long arms (hands past the hem), a slight forward slouch.
- **Colours, base / shade:**

  | Part | Base | Shade |
  | --- | --- | --- |
  | Fur | `#D88A4A` | `#B86A34` |
  | Muzzle | `#EBC9A4` | `#D6B08A` |
  | Hoodie | `#4F6A8A` | `#3E5572` |
  | Jeans | `#26262C` | `#1C1C21` |
  | High-tops | `#E2DDD2` | `#C9C3B6` |
  | Guitar | `#8A5A34` | `#6E4628` |

- **Views.** Front, side and back turnarounds are on board 2.
- **Expressions.** Bored, curious, smug (up to something), and panicked. The eyes, brows and ears do the work, and the mouth stays small.
- **Broken guitar.** It is a prop and also an inventory item. The neck is snapped and gaffer-taped, and the headstock hangs by the strings. He wears it on his back in every view.

Other characters are animals and plants of Punland. Draw them in the same angular, two-tone, no-outline way, with the light from the upper left.

## Names and places

- **The Three Crows.** The big leaning Victorian corner pub where the bus drops the cat off. This is the opening scene. Board 3 is canonical.
  - Board 1's type and UI-bar samples still say "The Root Note" and "PUNLAND · BUS STOP". They predate the rename. Use The Three Crows.
  - The scaffold and the scenes spec used "The Root Note" until 2026-10-24.
- **The Holding Pen.** The live-music venue down the stairs beside the pub ("Live music below").
- **Paws Anka.** The protagonist's placeholder name (2026-10-24). See board 2 above.
- **Literal Village.** Where the cat comes from.
- **Poster text.** The A-board in the opening scene reads "TONIGHT / OPEN MIC / DOWNSTAIRS 9PM". The canvas has a `[BAND NAME]` placeholder there. "OPEN MIC" is a stand-in, not a canon band name.
