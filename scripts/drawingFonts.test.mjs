import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drawingFonts, fontDataUrl } from "./drawingFonts.mjs";

const bytes = Uint8Array.from({ length: 20_000 }, (_, index) => index % 256);
const url = await fontDataUrl(bytes.buffer);
assert.deepEqual(Buffer.from(url.split(",")[1], "base64"), Buffer.from(bytes));
const directory = new URL("../node_modules/@excalidraw/excalidraw/dist/prod/", import.meta.url);
assert.ok(readdirSync(directory).includes("subset-shared.chunk.js"), "Recheck the font integration after an Excalidraw upgrade");
const original = readFileSync(new URL("subset-shared.chunk.js", directory), "utf8");
const dependency = original.match(/from["'](\.\/[^"']+)["']/)?.[1];
assert.ok(dependency);
const source = drawingFonts().load(fileURLToPath(new URL(dependency, directory)));
const replacement = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
for (const [name, upstream] of [["a", "Commands"], ["b", "subsetToBase64"], ["c", "subsetToBinary"], ["d", "toBase64"]]) assert.ok(original.includes(`${name} as ${upstream}`) && name in replacement);
assert.equal(await replacement.c(bytes.buffer), bytes.buffer);
assert.equal(await replacement.b(bytes.buffer, new Set([65])), url);
console.log("CSP-safe drawing font exports preserve full font bytes and the upstream module contract.");
