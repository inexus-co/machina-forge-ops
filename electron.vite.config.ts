import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        /*
         * Two programs, one build.
         *
         * `bridge` is the process tmux keeps alive around one SSH terminal. It runs as plain
         * Node (`ELECTRON_RUN_AS_NODE`), so no Chromium is loaded for a terminal, and it is
         * built here so it uses the same `ssh2` and the same rules as everything else.
         */
        input: {
          index: "src/main/index.ts",
          bridge: "src/main/remote/tmux/bridge.ts",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    server: {
      /* 5195 is forge-kvm. Both are sometimes up at once to compare them, so they must not
         collide. */
      port: 5196,
      strictPort: true,
    },
  },
});
