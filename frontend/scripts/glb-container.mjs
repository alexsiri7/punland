// The glb container (glTF 2.0, section 4.4) and the colour conversion its materials need, shared
// by scripts/make-placeholders.mjs and the test fixtures (tests/fixtures/models/glb.ts), so the
// format has one writer. No dependency.

/** A base colour channel from sRGB, as STYLE.md gives it, to glTF's linear. */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** `bytes` padded with `fill` to a multiple of 4, as glb chunks must be. */
export function pad(bytes, fill) {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(fill);
  padded.set(bytes);
  return padded;
}

export function concat(parts) {
  const all = new Uint8Array(parts.reduce((n, part) => n + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.byteLength;
  }
  return all;
}

/** The glb file of a glTF JSON object and its binary chunk, which must already be padded. */
export function container(gltf, bin) {
  const json = pad(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  return concat([
    words(0x46546c67, 2, 12 + 8 + json.byteLength + 8 + bin.byteLength),
    words(json.byteLength, 0x4e4f534a),
    json,
    words(bin.byteLength, 0x004e4942),
    bin,
  ]);
}

function words(...values) {
  return new Uint8Array(Uint32Array.from(values).buffer);
}
