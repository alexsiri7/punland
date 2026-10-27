import { describe, expect, it } from 'vitest';
import { modelFiles } from './support/files';

// scripts/make-placeholders.mjs writes the committed placeholder models (docs/ARCHITECTURE.md,
// section 8): re-running it must reproduce them byte for byte.

const SCRIPT = '../../scripts/make-placeholders.mjs';

describe('the placeholder models', () => {
  it('are what scripts/make-placeholders.mjs writes, byte for byte', async () => {
    const { placeholders }: { placeholders(): Record<string, Uint8Array> } = await import(/* @vite-ignore */ SCRIPT);
    const written = placeholders();
    expect(Object.keys(modelFiles).sort()).toEqual(Object.keys(written).sort());
    for (const [path, bytes] of Object.entries(written)) expect(modelFiles[path], path).toEqual(bytes);
  });
});
