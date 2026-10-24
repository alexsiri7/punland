// Self-hosted fonts (OFL, via @fontsource). The CSP allows fonts from 'self' only,
// so Google Fonts links are not an option. Latin subsets only, to keep the build small.
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';

/**
 * Canvas text does not trigger web-font loading, so Phaser scenes must wait for the
 * fonts before drawing text. Resolves even if a font fails (falls back to system fonts).
 */
export async function loadFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  await Promise.allSettled(
    ['400 16px "Bebas Neue"', '400 16px Inter', '500 16px Inter', '600 16px Inter'].map((f) => document.fonts.load(f)),
  );
}
