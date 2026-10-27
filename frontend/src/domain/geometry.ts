/**
 * Coordinates on a room's floor: the scene-pixel position (1280 x 640) where that spot of floor
 * appears on screen (docs/ARCHITECTURE.md, section 3).
 */
export interface FloorPoint {
  x: number;
  y: number;
}

/** The scene in scene pixels: room art, floors and hotspot rects are laid out on it. */
export const SCENE = { width: 1280, height: 640 } as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Whether `p` is inside the polygon or on its edge. */
export function insidePolygon(p: FloorPoint, poly: readonly FloorPoint[]): boolean {
  let inside = false;
  for (const [a, b] of edges(poly)) {
    if (distance(p, nearestOnSegment(p, a, b)) < 1e-9) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether the polygon is convex: walking in straight lines only stays on a convex floor. */
export function isConvex(poly: readonly FloorPoint[]): boolean {
  if (poly.length < 3) return false;
  let sign = 0;
  for (const [i, a] of poly.entries()) {
    const b = poly[(i + 1) % poly.length];
    const c = poly[(i + 2) % poly.length];
    if (!b || !c) return false;
    const cross = Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
    if (cross === 0) continue;
    if (sign !== 0 && cross !== sign) return false;
    sign = cross;
  }
  return true;
}

/**
 * Where the player should walk to for a click at `p`: `p` itself, or the nearest point of the
 * floor. With no floor there is nothing to clamp to, so `p` itself.
 */
export function nearestWalkable(p: FloorPoint, poly: readonly FloorPoint[]): FloorPoint {
  if (insidePolygon(p, poly)) return p;
  let best = p;
  let bestDistance = Infinity;
  for (const [a, b] of edges(poly)) {
    const q = nearestOnSegment(p, a, b);
    const d = distance(p, q);
    if (d < bestDistance) [best, bestDistance] = [q, d];
  }
  return best;
}

/** Each side of the polygon, from the previous corner to the next, closing the last one. */
function* edges(poly: readonly FloorPoint[]): Generator<[FloorPoint, FloorPoint]> {
  let previous = poly.at(-1);
  if (!previous) return;
  for (const corner of poly) {
    yield [previous, corner];
    previous = corner;
  }
}

function nearestOnSegment(p: FloorPoint, a: FloorPoint, b: FloorPoint): FloorPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function distance(a: FloorPoint, b: FloorPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
