import { type Command, type Content, type GameEvent, type GameState, type Hotspot, toSave } from '../domain';
import { apply, isPresent } from '../rules';
import type { SaveStore } from '../services/save';

export type Listener = (event: GameEvent) => void;

/**
 * The one stateful object (docs/ARCHITECTURE.md, section 4): it holds the game state, which
 * only the rules change, one command at a time. Each event goes to every listener once the
 * command is applied, so `state` is already the new state; a `saved` event also saves it.
 */
export class GameSession {
  private readonly listeners = new Set<Listener>();

  constructor(
    readonly content: Content,
    private current: GameState,
    private readonly store: Pick<SaveStore, 'save'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get state(): GameState {
    return this.current;
  }

  dispatch(command: Command): void {
    const { state, events } = apply(this.content, this.current, command);
    this.current = state;
    for (const event of events) {
      if (event.type === 'saved') this.save();
      for (const listener of this.listeners) listener(event);
    }
  }

  /** Returns the unsubscribe. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isPresent(hotspot: Hotspot): boolean {
    return isPresent(this.current, hotspot);
  }

  /** Saves the state now, stamped with the time: the rules read no clock. */
  save(): void {
    void this.store.save({ ...toSave(this.current), savedAt: this.now().toISOString() });
  }
}
