import assert from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import encode from "png-chunks-encode";
import extract from "png-chunks-extract";

const pixels = Uint8Array.of(0, 255, 0, 0, 255);
const header = Uint8Array.of(0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0);
const metadata = Uint8Array.from({ length: 20_000 }, (_, index) => 32 + index % 95);
const encoded = encode([
  { name: "IHDR", data: header },
  { name: "tEXt", data: metadata },
  { name: "IDAT", data: deflateSync(pixels) },
  { name: "IEND", data: new Uint8Array() },
]);
assert.deepEqual([...encoded.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
const chunks = extract(encoded); // Independent decoding also verifies every chunk's CRC.
assert.deepEqual(chunks.map((chunk) => chunk.name), ["IHDR", "tEXt", "IDAT", "IEND"]);
assert.deepEqual(chunks[0].data, header);
assert.deepEqual(chunks[1].data, metadata);
assert.deepEqual(inflateSync(chunks[2].data), Buffer.from(pixels));
assert.deepEqual(encode(chunks), encoded);
console.log("PNG export preserves image bytes, metadata, chunk order and CRCs without sliced.");
