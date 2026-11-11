import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function fontDataUrl(buffer) {
  const bytes = new Uint8Array(buffer);
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return `data:font/woff2;base64,${btoa(parts.join(""))}`;
}

export function drawingFonts() {
  const shared = new URL("../node_modules/@excalidraw/excalidraw/dist/prod/subset-shared.chunk.js", import.meta.url);
  const source = readFileSync(shared, "utf8");
  const dependency = source.match(/from["'](\.\/[^"']+)["']/)?.[1];
  if (!dependency) throw new Error("Excalidraw font module changed; recheck the CSP-safe loader.");
  const fontChunk = fileURLToPath(new URL(dependency, shared));
  return {
    name: "csp-safe-drawing-fonts",
    apply: "build",
    load(id) {
      if (id !== fontChunk) return;
      // shortcut: embed full fonts under CSP; restore subsetting when upstream no longer needs JavaScript eval.
      return `export const a={Subset:"SUBSET"};export const d=${fontDataUrl.toString()};export const b=d;export const c=async buffer=>buffer;`;
    },
  };
}

