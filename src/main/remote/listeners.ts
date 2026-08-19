import type { WebContents } from "electron";

/**
 * Everyone who asked to be told.
 *
 * More than one window watches the same server now: the main window and the floating panels the
 * operator pulled out of it. Keeping "the renderer that asked most recently" — which is what each
 * of these controllers used to do — meant the second window to ask silently switched the first
 * one off, and a file transfer or a log tail would appear to stop for whoever was not last.
 *
 * A window that goes away takes its entry with it, so nothing here holds a destroyed one.
 */
export class Listeners {
  private readonly contents = new Set<WebContents>();

  add(target: WebContents) {
    if (this.contents.has(target)) return;
    this.contents.add(target);
    target.once("destroyed", () => this.contents.delete(target));
  }

  send(channel: string, ...payload: unknown[]) {
    for (const target of this.contents) {
      if (target.isDestroyed()) this.contents.delete(target);
      else target.send(channel, ...payload);
    }
  }
}
