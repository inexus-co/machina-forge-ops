import type { MachinaOpsApi } from "../../shared/api";

/**
 * What the dev server adds to a module.
 *
 * Only `on` is used, and only to repair the language after a hot reload; declaring the whole of
 * Vite's client types here would pull in a library this build does not otherwise need.
 */
declare global {
  interface ImportMeta {
    hot?: { on(event: string, handler: () => void): void };
  }
}

declare global {
  interface Window {
    machina: MachinaOpsApi;
    /**
     * Document Picture-in-Picture.
     *
     * A real floating window the operating system keeps above everything, with a live document
     * inside it rather than a video. Chromium has it and Electron inherits it; TypeScript's DOM
     * library has not caught up, so the shape is declared here.
     */
    documentPictureInPicture?: {
      requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
      window: Window | null;
    };
  }
}
