import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

if (typeof window !== "undefined") Object.assign(window, { EXCALIDRAW_ASSET_PATH: "/excalidraw/" });

export function readTaskDrawing(value: string | undefined): ExcalidrawInitialDataState | null {
  if (!value) return null;
  try {
    const scene = JSON.parse(value);
    if (scene?.type !== "excalidraw" || !Array.isArray(scene.elements)
      || !scene.elements.every((element: Record<string, unknown>) => element && typeof element.id === "string" && typeof element.type === "string"
        && [element.x, element.y, element.width, element.height].every((number) => typeof number === "number" && Number.isFinite(number)))
      || !scene.appState || typeof scene.appState !== "object" || Array.isArray(scene.appState)
      || !scene.files || typeof scene.files !== "object" || Array.isArray(scene.files)) return null;
    return scene;
  } catch { return null; }
}
