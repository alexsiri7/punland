import { describe, expect, it } from 'vitest';
import { models } from '../../src/assets/registry';
import { modelFiles } from './support/files';

// scripts/make-placeholders.mjs writes the placeholder models (docs/ARCHITECTURE.md, section 8):
// re-running it must reproduce the committed files the registry marks `placeholder` byte for
// byte. A designer's file at the same path, with the flag off, is the contract's to check.

const SCRIPT = '../../scripts/make-placeholders.mjs';

describe('the placeholder models', () => {
  it('are what scripts/make-placeholders.mjs writes, byte for byte', async () => {
    const { placeholders }: { placeholders(): Record<string, Uint8Array> } = await import(/* @vite-ignore */ SCRIPT);
    const written = placeholders();
    const flagged = Object.values(models).flatMap(({ model3d }) => (model3d?.placeholder ? [model3d.file] : []));
    expect(flagged).not.toEqual([]);
    for (const path of flagged) expect(modelFiles[path], path).toEqual(written[path]);
  });
});
