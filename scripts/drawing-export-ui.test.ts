import "../src/taskDrawing";
import { convertToExcalidrawElements, exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import extract from "png-chunks-extract";

async function runProductionChecks() {
  const warnings: string[] = [];
  for (const level of ["warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args) => { warnings.push(args.map(String).join(" ")); original(...args); };
  }
  let result;
  try {
    const elements = convertToExcalidrawElements([{ type: "text", x: 0, y: 0, text: "Offline drawing export" }]);
    const svg = await exportToSvg({ elements, appState: { viewBackgroundColor: "#ffffff", exportBackground: false }, files: null });
    if (!svg.textContent?.includes("Offline drawing export") || !svg.outerHTML.includes("data:font/woff2;base64,")) throw new Error("SVG export lost its text or embedded fonts");
    const png = await exportToBlob({ elements, appState: { viewBackgroundColor: "#ffffff", exportEmbedScene: true }, files: null });
    const chunks = extract(new Uint8Array(await png.arrayBuffer()));
    if (png.type !== "image/png" || !chunks.some((chunk: { name: string }) => chunk.name === "tEXt")) throw new Error("PNG export lost its embedded scene metadata");
    result = warnings.length ? `FAIL: ${warnings.join("\n")}` : "PASS: offline SVG fonts and PNG scene metadata export under the native CSP.";
  } catch (error) { result = `FAIL: ${error instanceof Error ? error.stack : error}`; }
  document.getElementById("result")!.textContent = result;
  await fetch("/__lotse_qa_report", { method: "POST", body: JSON.stringify({ phase: "drawing-export-ui", result, warnings }) });
  Object.assign(window, { lotseProductionResult: { result, warnings } });

}

void runProductionChecks();
