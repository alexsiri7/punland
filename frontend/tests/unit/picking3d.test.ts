import { BoxGeometry, Group, Mesh, PerspectiveCamera, PlaneGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import type { ModelId } from '../../src/domain';
import type { SceneView } from '../../src/presentation/renderer';
import type { Models } from '../../src/presentation/three3d/models';
import { Room } from '../../src/presentation/three3d/room';

// Picking in 3D (models spec): the pointer hits what is drawn, nearest first, and a hotspot that
// is not in the room is not picked.

function sceneModel(): Group {
  const scene = new Group();
  const camera = new PerspectiveCamera(30);
  camera.name = 'cam_main';
  camera.position.set(0, 1.5, 6);
  camera.lookAt(0, 0.8, 0);
  const floor = new Mesh(new PlaneGeometry(20, 20));
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  const door = new Mesh(new BoxGeometry(1, 2, 0.1));
  door.name = 'hit_door';
  door.position.set(0, 1, -1);
  scene.add(camera, floor, door);
  return scene;
}

function flyerModel(): Group {
  const flyer = new Group();
  const sheet = new Mesh(new BoxGeometry(0.4, 1.2, 0.05));
  sheet.position.y = 0.6;
  flyer.add(sheet);
  return flyer;
}

const fakeModels = (models: Record<string, () => Group>) =>
  ({ instance: async (id: ModelId) => models[id]?.() ?? null }) as unknown as Models;

function room(): Promise<Room> {
  return Room.build(
    {
      room: 'opening',
      model: 'scene/opening',
      entities: [
        { hotspot: 'door', node: 'door', visible: true },
        // On the floor in front of the door, at the bottom middle of the scene.
        { hotspot: 'flyer', model: 'object/flyer', at: { x: 640, y: 560 }, visible: true },
      ],
      player: { model: 'character/protagonist', at: { x: 640, y: 600 } },
    } as SceneView,
    fakeModels({ 'scene/opening': sceneModel, 'object/flyer': flyerModel }),
  );
}

const centre = (r: { x: number; y: number; width: number; height: number }) => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

describe('the 3D renderer, picking', () => {
  it('picks the hotspot drawn nearest the camera, and nothing off the hotspots', async () => {
    const r = await room();
    const flyer = centre(r.hotspotBounds('flyer')!);
    const door = r.hotspotBounds('door')!;
    expect(r.hotspotAt(flyer)).toBe('flyer');
    expect(r.hotspotAt({ x: door.x + 4, y: door.y + 4 })).toBe('door');
    expect(r.hotspotAt({ x: 20, y: 620 })).toBeNull();
    expect(r.isFloor({ x: 20, y: 620 })).toBe(true);
  });

  it('does not pick a hotspot that is not in the room', async () => {
    const r = await room();
    const flyer = centre(r.hotspotBounds('flyer')!);
    r.setVisible('flyer', false);
    expect(r.hotspotAt(flyer)).toBe('door');
    r.setVisible('door', false);
    expect(r.hotspotAt(flyer)).toBeNull();
    r.setVisible('flyer', true);
    expect(r.hotspotAt(flyer)).toBe('flyer');
  });

  it("picks an entity by its model's hit proxy when it has one", async () => {
    const withProxy = () => {
      const flyer = flyerModel();
      const hit = new Mesh(new BoxGeometry(2, 0.2, 0.05));
      hit.name = 'hit';
      hit.visible = false;
      hit.position.y = 0.1;
      flyer.add(hit);
      return flyer;
    };
    const r = await Room.build(
      {
        room: 'opening',
        model: 'scene/opening',
        entities: [{ hotspot: 'flyer', model: 'object/flyer', at: { x: 640, y: 560 }, visible: true }],
        player: { model: 'character/protagonist', at: { x: 640, y: 600 } },
      } as SceneView,
      fakeModels({ 'scene/opening': sceneModel, 'object/flyer': withProxy }),
    );
    const bounds = r.hotspotBounds('flyer')!;
    // The proxy's ends reach past the sheet; the top of the sheet is above the proxy.
    expect(r.hotspotAt({ x: bounds.x + 0.1 * bounds.width, y: bounds.y + bounds.height - 10 })).toBe('flyer');
    expect(r.hotspotAt({ x: bounds.x + bounds.width / 2, y: bounds.y + 0.1 * bounds.height })).toBeNull();
  });
});
