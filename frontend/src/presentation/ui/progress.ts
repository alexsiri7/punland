import type { Content, GameState } from '../../domain';

export interface Progress {
  /** The career stats, on the UI bar. */
  readonly stats: HTMLElement;
  /** The current act and its goals, in the scene's corner. */
  readonly goals: HTMLElement;
  render(state: GameState): void;
}

/**
 * The player's progress (progress spec, "Career stats" and "Acts"): each stat with its value,
 * and the current act's goals as checkboxes, checked once reached. Only shown, never clicked.
 */
export function createProgress(doc: Document, content: Pick<Content, 'stats' | 'acts'>): Progress {
  const stats = doc.createElement('ul');
  stats.className = 'stats';
  stats.setAttribute('role', 'list');
  stats.setAttribute('aria-label', 'Career stats');

  const goals = doc.createElement('section');
  goals.className = 'goals';
  const actName = doc.createElement('h2');
  actName.className = 'goals-act';
  const list = doc.createElement('ul');
  list.className = 'goals-list';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Goals');
  goals.append(actName, list);

  return {
    stats,
    goals,
    render(state) {
      stats.replaceChildren(
        ...content.stats.map((stat) => {
          const name = doc.createElement('span');
          name.className = 'stats-name';
          name.textContent = stat.name;
          const value = doc.createElement('span');
          value.className = 'stats-value';
          value.textContent = String(state.stats[stat.id] ?? stat.start);
          const entry = doc.createElement('li');
          entry.append(name, ' ', value);
          return entry;
        }),
      );
      const act = content.acts.find((a) => a.id === state.act);
      actName.textContent = act?.name ?? '';
      list.replaceChildren(
        ...(act?.goals ?? []).map((goal) => {
          const box = doc.createElement('input');
          box.type = 'checkbox';
          box.disabled = true;
          box.checked = state.goals.includes(goal.id);
          const label = doc.createElement('label');
          label.append(box, ` ${goal.name}`);
          const entry = doc.createElement('li');
          entry.append(label);
          return entry;
        }),
      );
    },
  };
}
