import type { FloorPoint } from './geometry';

export interface Place {
  room: string;
  at?: FloorPoint;
}

/** A journey as it is saved: where each world was left, by world id, and the material gathered. */
export interface JourneyState {
  left: Record<string, Place>;
  gathered: string[];
}
