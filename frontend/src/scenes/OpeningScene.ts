import Phaser from 'phaser';

/**
 * Placeholder for the opening scene: outside the pub (The Root Note) where the
 * bus has dropped the cat off. Drawn with shapes only; issue #4 replaces it with
 * the content-driven room engine (art files, walking, hotspots, exits).
 */
export class OpeningScene extends Phaser.Scene {
  static readonly KEY = 'opening';

  constructor() {
    super(OpeningScene.KEY);
  }

  create(): void {
    const { width, height } = this.scale;
    const floorY = height * 0.72;

    // Sky and street.
    this.add.rectangle(0, 0, width, floorY, 0x2b1b3d).setOrigin(0);
    this.add.rectangle(0, floorY, width, height - floorY, 0x3d3a4b).setOrigin(0);

    // The Root Note pub.
    this.add.rectangle(width * 0.55, floorY, 340, 260, 0x6b3e26).setOrigin(0, 1);
    this.add.rectangle(width * 0.55 + 140, floorY, 60, 110, 0x2a160c).setOrigin(0, 1);
    this.add
      .text(width * 0.55 + 170, floorY - 225, 'THE ROOT NOTE', {
        fontFamily: 'Georgia, serif',
        fontSize: '28px',
        color: '#f2c14e',
      })
      .setOrigin(0.5);

    // Bus stop.
    this.add.rectangle(width * 0.15, floorY, 8, 150, 0xb8b8c8).setOrigin(0.5, 1);
    this.add.rectangle(width * 0.15, floorY - 150, 60, 40, 0x4e9fd1).setOrigin(0.5, 1);
    this.add
      .text(width * 0.15, floorY - 170, 'BUS', { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff' })
      .setOrigin(0.5);

    // The cat (placeholder).
    this.add.ellipse(width * 0.3, floorY + 20, 50, 70, 0xe8a24a);

    this.add
      .text(width / 2, height - 24, 'Outside The Root Note', {
        fontFamily: 'Georgia, serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const container = this.game.canvas.parentElement;
    if (container) container.dataset.scene = OpeningScene.KEY;
  }
}
