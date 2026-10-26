/** How long a spoken line stays up, in ms: longer lines for longer. */
export function speechMs(line: string): number {
  return Math.max(3000, 60 * line.length);
}
