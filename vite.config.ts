import { defineConfig, type Plugin } from "vite";
import { fileURLToPath, URL } from "node:url";
import { cpSync } from "node:fs";
import { env } from "node:process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { drawingFonts } from "./scripts/drawingFonts.mjs";

const host = env.TAURI_DEV_HOST;

const checkBundleSizes: Plugin = {
  name: "check-bundle-sizes",
  apply: "build",
  generateBundle: {
    order: "post",
    handler(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk" && Buffer.byteLength(output.code) > 500_000) {
          this.error(`${output.fileName} exceeds the 500 kB JavaScript budget`);
        }
      }
    },
  },
};

// Bundle Excalidraw fonts so drawing and image export also work offline in Tauri.
cpSync(new URL("./node_modules/@excalidraw/excalidraw/dist/prod/fonts", import.meta.url), new URL("./public/excalidraw/fonts", import.meta.url), { recursive: true });

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), drawingFonts(), checkBundleSizes],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id, { getModuleInfo }) {
          if (getModuleInfo(id)?.isIncluded === false) return;
          const dependency = id.split("/node_modules/").at(-1);
          if (!id.includes("/node_modules/") || !dependency) return;
          const parts = dependency.split("/");
          const name = parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
          if (name === "pele") return;
          if (name === "@excalidraw/excalidraw") return `drawing-${parts.at(-1)?.replace(/\.js$/, "")}`;
          return `vendor-${name.replace(/[@/]/g, "-")}`;
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1431,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
