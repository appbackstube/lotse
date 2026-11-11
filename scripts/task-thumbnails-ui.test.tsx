// Open /scripts/task-thumbnails-ui.html through Vite. All asset paths use synthetic IPC.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { mockIPC } from "./mockTauri";
import { TaskAssetThumbnail } from "../src/components/TaskAssetThumbnail";
let fixtureRoot: ReturnType<typeof createRoot> | undefined;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const reads: string[] = [];
mockConvertFileSrc("macos");
mockIPC(async (command, args: any) => {
  if (command !== "task_asset_image_path") throw new Error(`Unexpected IPC: ${command}`);
  reads.push(args.assetId);
  return `/cache/thumbnails/${args.assetId}.png`;
});
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); }); };
const root = (fixtureRoot = createRoot(document.getElementById("root")!));
try {
  await act(async () => root.render(<div>{Array.from({ length: 20 }, (_, index) => <div key={index} id={`asset-${index}`} style={{ width: 150, height: 180 }}><TaskAssetThumbnail taskId="task" assetId={`image-${index}`} /></div>)}</div>));
  await settle(); await settle();
  check(reads.includes("image-0") && !reads.includes("image-19"), "Only assets near the viewport may resolve thumbnails");
  const image = document.querySelector<HTMLImageElement>('#asset-0 img')!;
  check(image && decodeURIComponent(image.src).includes("/cache/thumbnails/image-0.png"), "The thumbnail must use its cached path");
  check(image.loading === "lazy" && image.decoding === "async", "Thumbnails must defer image loading and decoding");
  const before = reads.length;
  await act(async () => document.getElementById("asset-19")!.scrollIntoView());
  await settle(); await settle();
  check(reads.includes("image-19") && reads.length > before && reads.length < 20, "Scrolling must load newly visible assets without loading the whole task");
  await act(async () => root.unmount());
  document.getElementById("result")!.textContent = "PASS: viewport-triggered thumbnail IPC, cached paths, lazy image loading, async decoding and incremental scrolling.";
} catch (error) {
  document.getElementById("result")!.textContent = `FAIL: ${error instanceof Error ? error.stack : String(error)}`;
  console.error(error);
} finally {
  if (!new URLSearchParams(location.search).has("preview")) await act(async () => fixtureRoot?.unmount());
}
