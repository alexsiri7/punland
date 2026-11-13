import { type ContentFiles, type ContentResult, contentWithLayouts } from '../content';
import {
  type Content,
  type Handle,
  handlesOf,
  layoutOf,
  type PublishResult,
  type RoomLayout,
  sameLayout,
} from '../domain';
import type { Renderer } from '../presentation/renderer';
import type { EditIssue, EditorHost } from '../presentation/ui';
import { type Draft, type Drafts, loadDrafts, publishRoom, saveDrafts } from '../services/editor';
import type { GameSession } from './session';

export interface EditorOptions {
  session: GameSession;
  renderer: Pick<Renderer, 'place' | 'onFloor'>;
  /** Pauses the game while the owner edits, and plays on after. */
  editing(on: boolean): void;
  /** The content files the session's content was read from; the real ones by default. */
  files?: ContentFiles;
  drafts?: { load(): Drafts; save(drafts: Drafts): void };
  publish?: typeof publishRoom;
}

/**
 * The owner's edits (editor spec): each room's draft layout, kept in this browser, checked by the
 * content validator and on the drawn room's floor, and played at once when it holds together.
 * The session's content as it is now is the deployed content; the drafts kept from an earlier
 * visit are played from the start, except those whose room has changed since they began.
 */
export function createEditorHost(options: EditorOptions): EditorHost {
  const { session, renderer, files } = options;
  const store = options.drafts ?? { load: () => loadDrafts(), save: (d: Drafts) => saveDrafts(d) };
  const publish = options.publish ?? publishRoom;
  const deployed: Content = session.content;
  const base = (room: string): RoomLayout => {
    const current = deployed.rooms[room];
    if (!current) throw new Error(`room "${room}" is not in the content`);
    return layoutOf(current);
  };
  const upToDate = ([room, draft]: [string, Draft]) =>
    Object.hasOwn(deployed.rooms, room) && sameLayout(draft.base, base(room)) && !sameLayout(draft.layout, draft.base);
  const drafts: Drafts = Object.fromEntries(Object.entries(store.load()).filter(upToDate));
  store.save(drafts);

  const layouts = () => Object.fromEntries(Object.entries(drafts).map(([room, draft]) => [room, draft.layout]));
  /** The content with every draft in it, and the problems keeping it from being played. */
  const check = (room: string): { content: Content | null; issues: EditIssue[] } => {
    const read: ContentResult =
      Object.keys(drafts).length > 0 ? contentWithLayouts(layouts(), files) : { content: deployed, issues: [] };
    const issues: EditIssue[] = [...read.issues, ...offFloor(room)];
    return { content: issues.length === 0 ? read.content : null, issues };
  };
  /** The drawn room's points the renderer finds off its floor. */
  const offFloor = (room: string): EditIssue[] => {
    const draft = drafts[room];
    if (!draft || room !== session.state.room) return [];
    const file = `content/rooms/${room}.json`;
    return handlesOf(draft.layout)
      .filter(({ at }) => !renderer.onFloor(at))
      .map(({ handle, at }) => ({ file, field: fieldOf(handle), message: `(${at.x}, ${at.y}) is not on the floor` }));
  };
  const place = (layout: RoomLayout) => {
    for (const [hotspot, { at }] of Object.entries(layout.hotspots)) if (at) renderer.place(hotspot, at);
  };
  const play = (room: string): EditIssue[] => {
    const { content, issues } = check(room);
    if (content) session.useContent(content);
    return issues;
  };
  const keep = (room: string, layout: RoomLayout) => {
    if (sameLayout(layout, base(room))) delete drafts[room];
    else drafts[room] = { base: base(room), layout };
    store.save(drafts);
  };

  // Before any room is drawn, so only the content validator checks them.
  if (Object.keys(drafts).length > 0) {
    const kept = contentWithLayouts(layouts(), files);
    if (kept.content) session.useContent(kept.content);
  }

  return {
    layout: (room) => drafts[room]?.layout ?? base(room),
    base,
    onFloor: (at) => renderer.onFloor(at),
    change(room, layout) {
      keep(room, layout);
      place(layout);
      return play(room);
    },
    discard(room) {
      keep(room, base(room));
      place(base(room));
      play(room);
    },
    editing(on) {
      options.editing(on);
      const played = session.content.rooms[session.state.room];
      if (!on && played) place(layoutOf(played));
    },
    preview: (_room, layout) => place(layout),
    async publish(room, layout, shots): Promise<PublishResult> {
      const { issues } = check(room);
      if (issues.length > 0) return { ok: false, message: "Can't publish: the room doesn't hold together." };
      const result = await publish(room, layout, shots);
      if (!result.ok) return result;
      // The edit lives in the pull request now: play the deployed room until it is merged.
      keep(room, base(room));
      place(base(room));
      play(room);
      return result;
    },
  };
}

/** A point's field in its room file, as the content and asset validators name it. */
function fieldOf(handle: Handle): string {
  switch (handle.kind) {
    case 'start':
      return 'start';
    case 'corner':
      return `walkable[${handle.index}]`;
    case 'walkTo':
      return `hotspots[id=${handle.hotspot}].walkTo`;
    case 'spot':
      return `hotspots[id=${handle.hotspot}].target.at`;
  }
}
