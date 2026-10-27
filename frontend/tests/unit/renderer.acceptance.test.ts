import { afterEach, describe, expect, it, vi } from 'vitest';
import { playGame } from '../../src/app/game';
import { GameSession } from '../../src/app/session';
import { loadContent } from '../../src/content';
import { newGame } from '../../src/domain';
import type { Pick, ScenePoint } from '../../src/presentation/renderer';
import { FakeRenderer } from './fakes/renderer';

// Acceptance tests for openspec/specs/architecture/spec.md, requirement "Replaceable renderer".
// The game ships one renderer (docs/ARCHITECTURE.md, section 5), so the swap is between two
// renderers behind the interface: one whose hotspot buttons take the pointer, and one that
// picks hotspots on its canvas, as the 3D renderer does.

const content = loadContent();

/** A renderer that picks the hotspots in its room by their bounds, and lets the pointer through the buttons. */
class PickingRenderer extends FakeRenderer {
  override readonly picksHotspots = true;
  private readonly hidden = new Set<string>();

  override setVisible(hotspot: string, visible: boolean): void {
    super.setVisible(hotspot, visible);
    if (visible) this.hidden.delete(hotspot);
    else this.hidden.add(hotspot);
  }

  override pick(screen: ScenePoint): Pick {
    const hit = this.view?.entities.find(({ hotspot, visible }) => {
      const bounds = this.hotspotBounds(hotspot);
      if (!visible || this.hidden.has(hotspot) || !bounds) return false;
      const { x, y, width, height } = bounds;
      return screen.x >= x && screen.x <= x + width && screen.y >= y && screen.y <= y + height;
    });
    return hit ? { kind: 'hotspot', hotspot: hit.hotspot } : super.pick(screen);
  }
}

/** What the player sees and can do at each stop of the opening -> pub -> opening route. */
async function playRoute(renderer: FakeRenderer): Promise<unknown[]> {
  const container = document.createElement('div');
  document.body.append(container);
  const game = new GameSession(content, newGame(content), { save: async () => {} });
  await playGame(container, game, renderer, { turn: async () => null });

  const canvas = renderer.canvas();
  const press = (at: ScenePoint) =>
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: at.x, clientY: at.y }));
  const walk = async () => {
    while (game.state.walk) renderer.step(100);
    await vi.advanceTimersByTimeAsync(0);
  };
  /** Clicks a hotspot where it is drawn: its button, or the canvas under it when the button lets the pointer through. */
  const clickHotspot = (name: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[aria-label="Hotspots"] button[aria-label="${name}"]`)!;
    if (!renderer.picksHotspots) return button.click();
    const bounds = renderer.hotspotBounds(content.rooms[game.state.room]!.hotspots.find((h) => h.name === name)!.id)!;
    press({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  };
  const stops: unknown[] = [];
  const stop = () =>
    stops.push({
      ...container.dataset,
      controls: [...container.querySelectorAll('button, [role], [aria-label]')].map((element) => ({
        tag: element.tagName,
        role: element.getAttribute('role'),
        name: element.getAttribute('aria-label') ?? element.textContent,
        hidden: (element as HTMLElement).hidden,
      })),
    });

  stop();
  press({ x: 900, y: 585 });
  await walk();
  stop();
  clickHotspot('Pub door');
  await walk();
  stop();
  clickHotspot('Street door');
  await walk();
  stop();
  container.remove();
  return stops;
}

describe('Replaceable renderer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Swapping the renderer', async () => {
    // Requirement: Replaceable renderer. Whatever the renderer, the same content plays the same,
    // with the same #game data attributes and DOM controls.
    vi.useFakeTimers();
    const withButtons = await playRoute(new FakeRenderer());
    const withPicking = await playRoute(new PickingRenderer());
    expect(withPicking).toEqual(withButtons);
    expect(withButtons.map((at) => (at as DOMStringMap).scene)).toEqual(['opening', 'opening', 'pub', 'opening']);
  });
});
