import type { Room } from './content';
import type { FloorPoint } from './geometry';

/** The points of one hotspot the editor moves: its walk-to point and, for a placed entity, its spot. */
export interface HotspotLayout {
  readonly walkTo: FloorPoint;
  readonly at?: FloorPoint;
}

/**
 * A room's layout: every point of its file the owner's editor moves (editor spec, "Edit mode"),
 * and nothing else. Drafts, live edits and publishing all carry it.
 */
export interface RoomLayout {
  readonly start: FloorPoint;
  /** The floor's corners, in order. */
  readonly walkable: readonly FloorPoint[];
  /** By hotspot id. */
  readonly hotspots: Readonly<Record<string, HotspotLayout>>;
}

/** One point of a layout. */
export type Handle =
  | { kind: 'start' }
  | { kind: 'corner'; index: number }
  | { kind: 'walkTo'; hotspot: string }
  | { kind: 'spot'; hotspot: string };

/** A floor has at least this many corners. */
export const MIN_CORNERS = 3;

export function layoutOf(room: Room): RoomLayout {
  return {
    start: room.start,
    walkable: room.walkable,
    hotspots: Object.fromEntries(
      room.hotspots.map((h) => [h.id, 'at' in h.target ? { walkTo: h.walkTo, at: h.target.at } : { walkTo: h.walkTo }]),
    ),
  };
}

/** Every point of the layout, with its handle. */
export function handlesOf(layout: RoomLayout): { handle: Handle; at: FloorPoint }[] {
  return [
    { handle: { kind: 'start' }, at: layout.start },
    ...layout.walkable.map((at, index) => ({ handle: { kind: 'corner', index } as const, at })),
    ...Object.entries(layout.hotspots).flatMap(([hotspot, { walkTo, at }]) => [
      { handle: { kind: 'walkTo', hotspot } as const, at: walkTo },
      ...(at ? [{ handle: { kind: 'spot', hotspot } as const, at }] : []),
    ]),
  ];
}

/** The point a handle stands for, or null if the layout has none there. */
export function pointAt(layout: RoomLayout, handle: Handle): FloorPoint | null {
  switch (handle.kind) {
    case 'start':
      return layout.start;
    case 'corner':
      return layout.walkable[handle.index] ?? null;
    case 'walkTo':
      return layout.hotspots[handle.hotspot]?.walkTo ?? null;
    case 'spot':
      return layout.hotspots[handle.hotspot]?.at ?? null;
  }
}

/** The layout with a handle's point at `to`, in whole scene pixels; unchanged if it has no such point. */
export function moveHandle(layout: RoomLayout, handle: Handle, to: FloorPoint): RoomLayout {
  if (pointAt(layout, handle) === null) return layout;
  const at = { x: Math.round(to.x), y: Math.round(to.y) };
  switch (handle.kind) {
    case 'start':
      return { ...layout, start: at };
    case 'corner':
      return { ...layout, walkable: layout.walkable.map((p, i) => (i === handle.index ? at : p)) };
    case 'walkTo':
    case 'spot': {
      const before = layout.hotspots[handle.hotspot];
      if (!before) return layout;
      const after: HotspotLayout = handle.kind === 'walkTo' ? { ...before, walkTo: at } : { ...before, at };
      return { ...layout, hotspots: { ...layout.hotspots, [handle.hotspot]: after } };
    }
  }
}

/** The layout with a corner halfway along the floor's edge from corner `after` to the next. */
export function addCorner(layout: RoomLayout, after: number): RoomLayout {
  const a = layout.walkable[after];
  const b = layout.walkable[(after + 1) % layout.walkable.length];
  if (!a || !b) return layout;
  const middle = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
  return { ...layout, walkable: [...layout.walkable.slice(0, after + 1), middle, ...layout.walkable.slice(after + 1)] };
}

/** The layout without a floor corner; unchanged when the floor would have fewer than MIN_CORNERS. */
export function removeCorner(layout: RoomLayout, index: number): RoomLayout {
  if (layout.walkable.length <= MIN_CORNERS || !layout.walkable[index]) return layout;
  return { ...layout, walkable: layout.walkable.filter((_, i) => i !== index) };
}

export function sameLayout(a: RoomLayout, b: RoomLayout): boolean {
  const points = (layout: RoomLayout) =>
    JSON.stringify(handlesOf(layout).map(({ handle, at }) => [handle, at.x, at.y]));
  return points(a) === points(b);
}

/** What publishing a room's layout came to: the pull request it opened, or why it didn't. */
export type PublishResult = { ok: true; url: string } | { ok: false; message: string };
