import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Miro builds three independent windows from one React codebase:
//   index.html    -> settings window
//   overlay.html  -> floating dictation overlay
//   splash.html   -> launch greeting popup
// The dev server is pinned to 1420 with strictPort because `tauri.conf.json`
// points its devUrl at it, and a silent port hop would break the dev loop.
const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "chrome110",
    sourcemap: false,
    rollupOptions: {
      input: {
        settings: entry("index.html"),
        overlay: entry("overlay.html"),
        splash: entry("splash.html"),
        island: entry("island.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Threads rather than forked processes: the suite is tiny, and forks are
    // fragile when a Rust build is saturating the machine at the same time.
    pool: "threads",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
