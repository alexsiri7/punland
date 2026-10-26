import { describe, expect, it } from 'vitest';
import { createOverlay } from '../../src/presentation/ui/overlay';

// The overlay lines the DOM UI up with the canvas, wherever the scale manager puts it and at
// whatever size, so the controls sit over what they belong to.

function canvasAt(box: { left: number; top: number; width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'offsetLeft', { get: () => box.left });
  Object.defineProperty(canvas, 'offsetTop', { get: () => box.top });
  Object.defineProperty(canvas, 'clientWidth', { get: () => box.width });
  Object.defineProperty(canvas, 'clientHeight', { get: () => box.height });
  return canvas;
}

describe('the UI overlay', () => {
  it('covers the canvas and scales with it, now and on every resize', () => {
    const container = document.createElement('div');
    const box = { left: 40, top: 10, width: 960, height: 600 };
    let resized = () => {};
    const overlay = createOverlay(container);
    expect(overlay.root.hidden).toBe(true);

    overlay.follow({
      canvas: canvasAt(box),
      head: () => ({ x: 0, y: 0 }),
      onResize: (layout) => {
        resized = layout;
        return () => {};
      },
    });
    const { style } = overlay.root;
    expect(overlay.root.hidden).toBe(false);
    expect([style.left, style.top, style.width, style.height]).toEqual(['40px', '10px', '960px', '600px']);
    expect(style.getPropertyValue('--s')).toBe('0.75');
    expect(style.getPropertyValue('--scene-height')).toBe('640px');
    expect(style.getPropertyValue('--ui-bar-height')).toBe('160px');

    Object.assign(box, { left: 0, top: 0, width: 1280, height: 800 });
    resized();
    expect([style.left, style.top, style.width, style.height]).toEqual(['0px', '0px', '1280px', '800px']);
    expect(style.getPropertyValue('--s')).toBe('1');
  });

  it('stops following the previous room once it follows the next', () => {
    const overlay = createOverlay(document.createElement('div'));
    let unfollowed = 0;
    const room = {
      canvas: canvasAt({ left: 0, top: 0, width: 1280, height: 800 }),
      head: () => ({ x: 0, y: 0 }),
      onResize: () => () => unfollowed++,
    };
    overlay.follow(room);
    overlay.follow(room);
    expect(unfollowed).toBe(1);
  });
});
