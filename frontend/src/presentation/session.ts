import type { Command, Content, GameEvent, GameState, Hotspot } from '../domain';

/** The game session presentation plays (app/session.ts): it reads the state and sends commands. */
export interface Session {
  readonly content: Content;
  readonly state: GameState;
  dispatch(command: Command): void;
  subscribe(listener: (event: GameEvent) => void): () => void;
  isPresent(hotspot: Hotspot): boolean;
}
