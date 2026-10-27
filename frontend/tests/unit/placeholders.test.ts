import { describe, expect, it } from 'vitest';
import { type Model3d, models } from '../../src/assets/registry';
import { modelFiles } from './support/files';

// scripts/make-placeholders.mjs writes the placeholder models (docs/ARCHITECTURE.md, section 8):
// re-running it must reproduce the committed files the registry marks `placeholder` byte for
// byte. A designer's file at the same path, with the flag off, is the contract's to check.

const SCRIPT = '../../scripts/make-placeholders.mjs';
interface Script {
  placeholders(): Record<string, Uint8Array>;
  placeholdersToWrite(models: { model3d?: Model3d }[]): Record<string, Uint8Array>;
}

describe('the placeholder models', () => {
  it('are what scripts/make-placeholders.mjs writes, byte for byte', async () => {
    const { placeholders }: Script = await import(/* @vite-ignore */ SCRIPT);
    const written = placeholders();
    const flagged = Object.values(models).flatMap(({ model3d }) => (model3d?.placeholder ? [model3d.file] : []));
    expect(flagged).not.toEqual([]);
    for (const path of flagged) expect(modelFiles[path], path).toEqual(written[path]);
  });

  it("leave a model the registry marks a designer's alone", async () => {
    const { placeholders, placeholdersToWrite }: Script = await import(/* @vite-ignore */ SCRIPT);
    const all = Object.keys(placeholders());
    const [designed, ...rest] = all;
    const entries = all.map((file) => ({ model3d: { file, placeholder: file !== designed } }));
    expect(Object.keys(placeholdersToWrite(entries))).toEqual(rest);
  });
});
