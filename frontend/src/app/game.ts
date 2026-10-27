import type { FloorPoint } from '../domain';
import type { Renderer, SceneEntity, SceneView } from '../presentation/renderer';
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
    entities: current.hotspots.map((h): SceneEntity => {
      const { target } = h;
      const visible = session.isPresent(h);
      if (!('entity' in target)) return { hotspot: h.id, node: target.node, visible };
      const entity = content.characters[target.entity] ?? content.objects[target.entity];
      if (!entity) throw new Error(`entity "${target.entity}" is not in the content`);
      return { hotspot: h.id, model: entity.model, at: target.at, visible };
    }),
    player: { model: content.protagonist.model, at: state.at },
  };
}

/**
 * Plays the session in `container`: `renderer` draws it, the DOM UI (presentation/ui) lies over
 * it and the #game mirror follows it. The renderer is told what to draw from the session's
 * events, its canvas's clicks become commands and its pointer the hovered hotspot through
 * `renderer.pick`, and its frames tick the walk. Resolves once the first room is shown.
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
  const pick = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    return renderer.pick({
      x: ((event.clientX - box.left) * SCENE_WIDTH) / box.width,
      y: ((event.clientY - box.top) * (SCENE_HEIGHT + UI_BAR_HEIGHT)) / box.height,
    });
  };
  canvas.addEventListener('pointerdown', (event) => {
    const picked = pick(event);
    if (picked.kind === 'hotspot') {
      session.dispatch({ type: 'activate', hotspot: picked.hotspot });
    } else if (picked.kind === 'floor') {
      session.dispatch({ type: 'walk', to: picked.at });
      ui.walked();
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    const picked = pick(event);
    ui.pointed(picked.kind === 'hotspot' ? picked.hotspot : null);
    canvas.style.cursor = picked.kind === 'hotspot' ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => ui.pointed(null));
  renderer.frame((dtMs) => {
    if (session.state.walk) session.dispatch({ type: 'tick', dtMs });
  });

  await show();
}
