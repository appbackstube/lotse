import { convertToExcalidrawElements, restoreElements, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { readTaskDrawing } from "./taskDrawing";

export type TaskDrawingUpdate = { elements?: (Record<string, unknown> & { id: string })[]; deleteElementIds?: string[] };
const elementTypes = ["rectangle", "ellipse", "diamond", "text", "arrow", "line", "freedraw"];
const numericFields = ["x", "y", "width", "height", "angle", "strokeWidth", "roughness", "opacity", "fontSize"];
const stringFields = ["text", "strokeColor", "backgroundColor"];
const fields = ["id", "type", ...numericFields, ...stringFields, "points", "startArrowhead", "endArrowhead"];
const arrowheads = [null, "arrow", "bar", "dot", "triangle", "circle", "circle_outline", "triangle_outline", "diamond", "diamond_outline", "crowfoot_one", "crowfoot_many", "crowfoot_one_or_many"];

export function applyTaskDrawingUpdate(value: string | undefined, input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !["elements", "deleteElementIds"].includes(key))) throw new Error("Invalid drawing update.");
  const { elements = [], deleteElementIds = [] } = input as TaskDrawingUpdate;
  if (!Array.isArray(elements) || !Array.isArray(deleteElementIds) || elements.length + deleteElementIds.length === 0
    || elements.length + deleteElementIds.length > 500) throw new Error("Provide between 1 and 500 element changes.");
  const ids = new Set<string>();
  for (const element of elements) {
    if (!element || typeof element !== "object" || Array.isArray(element) || Object.keys(element).some((key) => !fields.includes(key))
      || typeof element.id !== "string" || !element.id.trim() || element.id.length > 200 || ids.has(element.id)
      || (element.type !== undefined && !elementTypes.includes(element.type as string))
      || numericFields.some((key) => key in element && (typeof element[key] !== "number" || !Number.isFinite(element[key]) || Math.abs(element[key] as number) > 1_000_000))
      || ["width", "height", "strokeWidth", "roughness"].some((key) => key in element && (element[key] as number) < 0)
      || (element.fontSize !== undefined && ((element.fontSize as number) <= 0 || (element.fontSize as number) > 1000))
      || (element.opacity !== undefined && ((element.opacity as number) < 0 || (element.opacity as number) > 100))
      || stringFields.some((key) => key in element && (typeof element[key] !== "string" || (element[key] as string).length > 20_000))
      || ["startArrowhead", "endArrowhead"].some((key) => key in element && !arrowheads.includes(element[key] as string | null))
      || (element.points !== undefined && (!Array.isArray(element.points) || element.points.length < 2 || element.points.length > 10_000
        || element.points.some((point) => !Array.isArray(point) || point.length !== 2 || point.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate) || Math.abs(coordinate) > 1_000_000))))) {
      throw new Error("Invalid drawing element. Use unique IDs, supported types, finite coordinates, and valid styles.");
    }
    ids.add(element.id);
  }
  for (const id of deleteElementIds) {
    if (typeof id !== "string" || !id.trim() || id.length > 200 || ids.has(id)) throw new Error("Element IDs must be unique across updates and deletions.");
    ids.add(id);
  }
  const scene = readTaskDrawing(value);
  if (value && !scene) throw new Error("The saved drawing is invalid. Repair it before editing.");
  const existing = new Map((scene?.elements ?? []).map((element) => [element.id, element]));
  for (const id of deleteElementIds) if (!existing.has(id)) throw new Error(`Drawing element not found: ${id}`);
  const patches = new Map(elements.map((element) => [element.id, element]));
  const merged = (scene?.elements ?? []).map((element) => {
    const patch = patches.get(element.id);
    if (patch?.type && patch.type !== element.type) throw new Error("An existing element's type cannot change. Add a new element instead.");
    return { ...element, ...patch, ...(patch?.text !== undefined ? { originalText: patch.text } : {}),
      ...(deleteElementIds.includes(element.id) ? { isDeleted: true } : {}) };
  });
  const added = elements.filter((element) => !existing.has(element.id));
  for (const element of added) {
    if (!element.type || typeof element.x !== "number" || typeof element.y !== "number"
      || (element.type === "text" && typeof element.text !== "string")
      || (element.type !== "text" && (typeof element.width !== "number" || typeof element.height !== "number"))
      || (["arrow", "line", "freedraw"].includes(element.type as string) && !element.points)) {
      throw new Error("New elements need type, x, y, and dimensions; text needs text, and lines/strokes need points.");
    }
  }
  const created = convertToExcalidrawElements(added.map((element) => element.type === "freedraw"
    ? { ...element, simulatePressure: true, pressures: [] } : element) as ExcalidrawElementSkeleton[], { regenerateIds: false });
  const restored = restoreElements([...merged, ...created] as ExcalidrawInitialDataState["elements"], scene?.elements, { refreshDimensions: true, repairBindings: true });
  return serializeAsJSON(restored, scene?.appState ?? {}, scene?.files ?? {}, "local");
}
