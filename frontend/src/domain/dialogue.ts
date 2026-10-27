/** One turn of a conversation, as the backend's POST /dialogue/turn answers it (#6). */
export interface DialogueTurn {
  /** What the character says. */
  line: string;
  /** The suggested replies, in the order they are offered. */
  options: { text: string; reaches_goal: boolean }[];
  goal_reached: boolean;
  /** The conversation is over: no more replies. */
  ended: boolean;
}
