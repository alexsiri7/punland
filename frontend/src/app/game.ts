import type { FloorPoint } from '../domain';
import type { Renderer, SceneView } from '../presentation/renderer';
import { SCENE_HEIGHT, SCENE_WIDTH, UI_BAR_HEIGHT } from '../presentation/theme';
import { type DialogueBackend, mountUi } from '../presentation/ui';
import { createMirror } from './mirror';
import type { GameSession } from './session';

/** What the renderer draws for the session's state: its room, the room's hotspots and the player. */
export function sceneView(session: GameSession): SceneView {
  const { content, state } = session;
  const current = content.rooms[state.room];
  if (!current) throw new Error(`room "${state.room}" is not in the content`);
  return {
    room: state.room,
    model: current.model,
    entities: current.hotspots.map((h) => {
      const placed = 'entity' in h.target ? h.target.entity : undefined;
      const entity = placed === undefined ? undefined : (content.characters[placed] ?? content.objects[placed]);
      return { hotspot: h.id, ...(entity && { model: entity.model }), visible: session.isPresent(h) };
    }),
    player: { model: content.protagonist.model, at: state.at },
  };
}

/**
 * Plays the session in `container`: `renderer` draws it, the DOM UI (presentation/ui) lies over
 * it and the #game mirror follows it. The renderer is told what to draw from the session's
 * events, its canvas's clicks become commands through `renderer.pick`, and its frames tick the
 * walk. Resolves once the first room is shown.
 */
export async function playGame(
  container: HTMLElement,
  session: GameSession,
  renderer: Renderer,
  dialogue: DialogueBackend,
): Promise<void> {
  const mirror = createMirror(container, session);
  const ui = mountUi(container, session, renderer, mirror, dialogue);
  await renderer.mount(container);

  // Only the latest room drawn takes input: one asked for since replaces it.
  let latest = 0;
  const show = async () => {
    const showing = ++latest;
    await renderer.show(sceneView(session));
    if (showing !== latest) return;
    ui.shown();
    mirror.shown();
  };
  let last: FloorPoint = session.state.at;
  session.subscribe((event) => {
    if (event.type === 'moved') {
      renderer.setPlayer(event.at, event.at.x < last.x ? 'left' : 'right');
      last = event.at;
    } else if (event.type === 'roomChanged') {
      last = session.state.at;
      void show();
    } else if (event.type === 'hotspotShown' || event.type === 'hotspotHidden') {
      renderer.setVisible(event.hotspot, event.type === 'hotspotShown');
    }
  });

  const canvas = renderer.canvas();
  canvas.addEventListener('pointerdown', (event) => {
    const box = canvas.getBoundingClientRect();
    const pick = renderer.pick({
      x: ((event.clientX - box.left) * SCENE_WIDTH) / box.width,
      y: ((event.clientY - box.top) * (SCENE_HEIGHT + UI_BAR_HEIGHT)) / box.height,
    });
    if (pick.kind !== 'floor') return;
    session.dispatch({ type: 'walk', to: pick.at });
    ui.walked();
  });
  renderer.frame((dtMs) => {
    if (session.state.walk) session.dispatch({ type: 'tick', dtMs });
  });

  await show();
}
