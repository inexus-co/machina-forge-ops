import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { t } from "../../../shared/i18n";
import { z } from "zod";
import type { ResourceKind } from "../../../shared/remoteResources";
import type { RemoteCommandSet } from "../../../shared/remoteAgent";
import { catalogAllowedNames } from "./catalog";
import { inspect } from "./inspect";
import type { AuthEvent, AuthPrompt } from "./pi";
import { agentDirectory, listProviders, signIn, signOut, subscriptionStatus } from "./pi";
import { reviewResource } from "./review";
import { apiKeySecret, LEGACY_API_KEY_SECRET, MIGRATED_MODEL_ID, readSettings } from "./store";
import {
  listResources,
  readInstructions,
  readResource,
  importSkill,
  removeResource,
  resourcePath,
  writeInstructions,
  writeResource,
} from "./resources";

/**
 * IPC for the agent's own files.
 *
 * Plain file work, guarded in one place: the kind is one of three, the name has to be a name,
 * and the content has a ceiling. Everything else about what these files *mean* is Pi's business.
 */

const kindSchema = z.enum(["skill", "prompt", "extension"]);
const nameSchema = z.string().min(1).max(63);
/** Large enough for a real skill with examples, small enough that a paste cannot fill a disk. */
const contentSchema = z.string().max(200_000);

export function registerRemoteResourcesController(
  userDataRoot: string,
  /** Every model's key at once. Which name belongs to which model is decided here. */
  apiKeys: () => Promise<Map<string, string>>,
) {
  const kind = (raw: unknown): ResourceKind => kindSchema.parse(raw);

  /*
   * What "granted" means since the catalog: everything it knows that is not a shell. Shaped as
   * one command set because that is the shape `inspect` reads; a skill naming something outside
   * it is warned, not because it would be refused, but because it will stop for a person.
   */
  const catalogAsSet: RemoteCommandSet[] = [
    { id: "catalog", name: t("Catalogue"), allow: catalogAllowedNames(), allowSudo: false },
  ];

  ipcMain.handle("remote-resources:list", (_event, rawKind: unknown) =>
    listResources(userDataRoot, kind(rawKind)),
  );

  ipcMain.handle("remote-resources:read", (_event, rawKind: unknown, rawName: unknown) =>
    readResource(userDataRoot, kind(rawKind), nameSchema.parse(rawName)),
  );

  ipcMain.handle(
    "remote-resources:write",
    (_event, rawKind: unknown, rawName: unknown, rawContent: unknown) =>
      writeResource(
        userDataRoot,
        kind(rawKind),
        nameSchema.parse(rawName),
        contentSchema.parse(rawContent),
      ),
  );

  /* Read against the shipped catalog: "unlisted" means the catalog does not know it. */
  ipcMain.handle(
    "remote-resources:inspect",
    async (_event, rawKind: unknown, rawName: unknown) => {
      const which = kind(rawKind);
      const content = await readResource(userDataRoot, which, nameSchema.parse(rawName));
      return inspect(which, content, catalogAsSet);
    },
  );

  /*
   * The model's reading, when the operator asks for it.
   *
   * Not part of `inspect`: that one is free and local, this one sends the file to a model
   * provider. Two channels rather than a flag, so nothing sends a customer's skill anywhere by
   * being open on a screen.
   */
  ipcMain.handle(
    "remote-resources:review",
    async (_event, rawKind: unknown, rawName: unknown) => {
      const which = kind(rawKind);
      const [content, settings, keys] = await Promise.all([
        readResource(userDataRoot, which, nameSchema.parse(rawName)),
        readSettings(userDataRoot),
        apiKeys(),
      ]);
      const model =
        settings.models.find((each) => each.id === settings.defaultModelId) ?? settings.models[0];
      if (!model) {
        throw new Error(t("Not one model is registered. Register one first."));
      }
      const apiKey =
        keys.get(apiKeySecret(model.id)) ??
        (model.id === MIGRATED_MODEL_ID ? keys.get(LEGACY_API_KEY_SECRET) : undefined);
      return await reviewResource({
        userDataRoot,
        kind: which,
        content,
        sets: catalogAsSet,
        found: inspect(which, content, catalogAsSet),
        model,
        apiKey,
      });
    },
  );

  /*
   * A skill somebody already wrote, brought in from this machine.
   *
   * The operator picks the file or the folder, so nothing decides on its own what to read. What
   * comes back is the name it landed under, or nothing when they cancelled.
   */
  ipcMain.handle("remote-resources:import-skill", async (event): Promise<string | undefined> => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: t("Choose a SKILL.md, or the folder that holds one"),
      properties: ["openFile" as const, "openDirectory" as const],
      filters: [{ name: "Markdown", extensions: ["md"] }],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const from = result.canceled ? undefined : result.filePaths[0];
    if (!from) return undefined;
    return await importSkill(userDataRoot, from);
  });

  ipcMain.handle("remote-resources:remove", (_event, rawKind: unknown, rawName: unknown) =>
    removeResource(userDataRoot, kind(rawKind), nameSchema.parse(rawName)),
  );

  ipcMain.handle("remote-resources:read-instructions", () => readInstructions(userDataRoot));

  ipcMain.handle("remote-resources:write-instructions", (_event, rawContent: unknown) =>
    writeInstructions(userDataRoot, contentSchema.parse(rawContent)),
  );

  /* The file manager, for the editing a text box in a dialog is not the place for. */
  ipcMain.handle("remote-resources:reveal", (_event, rawKind: unknown, rawName: unknown) => {
    shell.showItemInFolder(resourcePath(userDataRoot, kind(rawKind), nameSchema.parse(rawName)));
  });

  ipcMain.handle("remote-resources:directory", () => agentDirectory(userDataRoot));

  /* What Pi can reach, and how each is paid for. The screen groups its choices by this. */
  ipcMain.handle("remote-resources:providers", () => listProviders(userDataRoot));

  /* Which login the subscription would use, and whether it is signed in. No token leaves here. */
  ipcMain.handle("remote-resources:subscription", (_event, rawProvider: unknown) =>
    subscriptionStatus(
      userDataRoot,
      rawProvider === undefined ? undefined : z.string().min(1).max(64).parse(rawProvider),
    ),
  );

  /*
   * Signing in, from the window rather than from a terminal.
   *
   * The provider decides what its flow needs — a browser page, a code, a key — and says so
   * through `notify`/`prompt`. A URL is opened here, because that is what an operator expects a
   * "log in" button to do; anything the provider wants typed goes to the window and comes back
   * through `remote-resources:answer-login`. One login at a time: the settings screen has one
   * button and the flow ends before another can start.
   */
  /*
   * The one login that may be in flight, and everything needed to end it.
   *
   * Ending it properly is not optional. The browser flow holds a socket on port 1455 for its
   * callback, and a flow that is merely forgotten keeps holding it: the next attempt then fails
   * to bind, its callback reaches the *old* listener, and the browser says "State mismatch" —
   * which is what a customer's engineer would see after closing this window once. Rejecting the
   * question the provider is waiting on unwinds it as far as its own `finally`, which closes the
   * socket; the signal covers the parts that are waiting on the network instead.
   */
  let current:
    | { providerId: string; abort: AbortController; refuse: (cause: Error) => void }
    | undefined;
  /** Rejecting a pending question, when the provider is waiting for one. */
  let answering: { resolve: (value: string) => void; reject: (cause: Error) => void } | undefined;

  class Abandoned extends Error {}

  const letGo = () => {
    const going = current;
    current = undefined;
    if (!going) return;
    answering?.reject(new Abandoned(t("Cancelled.")));
    answering = undefined;
    going.abort.abort();
    going.refuse(new Abandoned(t("Cancelled.")));
  };

  ipcMain.handle("remote-resources:login", async (event, rawProvider: unknown) => {
    const providerId = z.string().min(1).max(64).parse(rawProvider);
    const send = (channel: string, payload: unknown) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
    };
    /* Whatever was still running loses its socket before this one asks for it. */
    letGo();
    const abort = new AbortController();
    /* A flow left behind by a closed window is a flow nobody can answer. */
    event.sender.once("destroyed", letGo);
    try {
      await new Promise<void>((resolve, reject) => {
        current = { providerId, abort, refuse: reject };
        signIn(
          userDataRoot,
          providerId,
          (prompt: AuthPrompt) =>
            new Promise<string>((answer, refuse) => {
              answering = { resolve: answer, reject: refuse };
              send("remote-resources:login-prompt", prompt);
              /*
               * Taken back by the provider: the browser answered first.
               *
               * The question goes away and the flow is left to finish — storing the credential
               * and re-reading the catalogue takes a moment, and during that moment the window
               * should say what it is doing rather than still be asking for a code. The promise
               * is deliberately left pending: `loginOpenAICodex` still awaits it on the path
               * where the callback brought nothing, and there somebody really is still typing.
               */
              prompt.signal?.addEventListener(
                "abort",
                () => {
                  send("remote-resources:login-prompt", undefined);
                  send("remote-resources:login-note", {
                    type: "info",
                    message: t("Permission received. Finishing up…"),
                  });
                },
                { once: true },
              );
            }),
          (note: AuthEvent) => {
            if (note.type === "auth_url" && typeof note["url"] === "string") {
              void shell.openExternal(note["url"]);
            }
            if (note.type === "device_code" && typeof note["verificationUri"] === "string") {
              void shell.openExternal(note["verificationUri"]);
            }
            send("remote-resources:login-note", note);
          },
          abort.signal,
        ).then(
          () => resolve(),
          (cause: unknown) => reject(cause instanceof Error ? cause : new Error(String(cause))),
        );
      });
    } catch (cause) {
      /* Somebody pressing cancel is not a failure to report; the window already moved on. */
      if (cause instanceof Abandoned) return;
      throw cause;
    } finally {
      if (current?.abort === abort) current = undefined;
      answering = undefined;
      event.sender.off("destroyed", letGo);
      send("remote-resources:login-prompt", undefined);
    }
  });

  ipcMain.handle("remote-resources:answer-login", (_event, rawValue: unknown) => {
    const value = z.string().max(4000).parse(rawValue);
    answering?.resolve(value);
    answering = undefined;
  });

  /* Cancel: end the flow — the provider's question, its socket and its waiting, all of it. */
  ipcMain.handle("remote-resources:cancel-login", () => {
    letGo();
  });

  ipcMain.handle("remote-resources:logout", (_event, rawProvider: unknown) =>
    signOut(userDataRoot, z.string().min(1).max(64).parse(rawProvider)),
  );

}
