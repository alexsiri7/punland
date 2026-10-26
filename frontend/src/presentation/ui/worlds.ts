import type { World } from '../../domain';

export interface WorldSwitcher {
  readonly element: HTMLElement;
  destroy(): void;
}

/**
 * The street / online / dream switcher in the UI bar (worlds spec, "Switching worlds"): a
 * button per world. A locked world's button is disabled and says why in its description.
 */
export function createWorldSwitcher(
  doc: Document,
  worlds: readonly World[],
  current: string,
  on: { enter(world: World): void },
): WorldSwitcher {
  const nav = doc.createElement('nav');
  nav.className = 'worlds';
  nav.setAttribute('aria-label', 'Worlds');
  const listening = new AbortController();
  for (const world of worlds) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = world.name;
    if (world.id === current) button.setAttribute('aria-current', 'true');
    if (world.locked !== undefined) {
      button.disabled = true;
      const why = doc.createElement('span');
      why.id = `world-locked-${world.id}`;
      why.hidden = true;
      why.textContent = `Locked: ${world.locked}`;
      button.setAttribute('aria-describedby', why.id);
      nav.append(why);
    }
    button.addEventListener(
      'click',
      () => {
        if (world.id !== current) on.enter(world);
      },
      { signal: listening.signal },
    );
    nav.append(button);
  }
  return {
    element: nav,
    destroy() {
      listening.abort();
      nav.remove();
    },
  };
}
