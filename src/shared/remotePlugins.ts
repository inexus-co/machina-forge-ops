/**
 * Ready-made plugins for common server stacks.
 *
 * A plugin is a set of skills, bundled for a shape of server the operator meets again and again —
 * a LAMP box, an Nginx front, a Docker host. It ships with the build (like the command catalog),
 * so nothing is downloaded: installing one writes its skills into the agent's own `skills/`
 * folder, through the same path a hand-written skill takes. That is all a plugin is — a way to
 * put several skills in at once.
 *
 * It is deliberately not a sub-agent and carries no permissions: what an agent may run is the
 * installation's decision, the same for every server. A plugin only teaches.
 */

/**
 * One skill a plugin installs: written to `skills/<name>/SKILL.md`.
 *
 * A skill with a `goal` is also a command — picking it in the ＋ menu puts that line in the
 * message box. That is the whole of what used to be a separate "starter": one kind of thing,
 * whether the operator wrote it or a plugin brought it.
 */
export type PluginSkill = {
  /** The on-disk name. ASCII only — it becomes a directory name (`checkName` in resources.ts). */
  name: string;
  /** The frontmatter description: when to use it. Shown in the gallery before install. */
  description: string;
  /** The frontmatter goal, when it is a command: what asking for it looks like. */
  goal?: string;
  /** The whole SKILL.md, frontmatter and all. */
  body: string;
};

/** A plugin as it ships: the definition compiled into the build. */
export type BuiltinPlugin = {
  id: string;
  /** The display name, in the operator's words. */
  name: string;
  /** One line: when this plugin is the one to reach for. */
  summary: string;
  /**
   * Words that, if seen in a server's collected facts, mean this plugin fits it.
   *
   * Lower-cased and matched against the facts summary — service names, container images, package
   * names. Used only to suggest; nothing is installed without the operator pressing install.
   */
  stack: string[];
  skills: PluginSkill[];
};

/** A plugin as the window sees it: no skill bodies, plus what this install and server make of it. */
export type PluginView = {
  id: string;
  name: string;
  summary: string;
  /** The skills it would install: what they are, and which of them are commands. */
  skills: Array<{ name: string; description: string; goal?: string }>;
  /** Every one of its skills is present on disk. */
  installed: boolean;
  /** This server's collected facts match its stack. False when there are no facts to match. */
  suggested: boolean;
  /** Added from a folder rather than shipped: it can be forgotten as well as uninstalled. */
  added?: boolean;
};

export type MachinaRemotePluginsApi = {
  /**
   * The plugins, with `installed` for this machine and `suggested` for this server.
   *
   * `hostId` decides `suggested` from that server's last-collected facts; omit it (the settings
   * gallery) and nothing is suggested.
   */
  list(hostId?: string): Promise<PluginView[]>;
  /** Write the plugin's skills. Returns the list again. */
  install(id: string): Promise<PluginView[]>;
  /** Remove the plugin's skills — only the ones it owns. Returns the list again. */
  remove(id: string): Promise<PluginView[]>;
  /**
   * Ask for a folder and read it as a plugin, without writing anything.
   *
   * Nothing until the operator has seen what is in it: this returns what was found, or nothing
   * when they cancelled. `add` is what keeps it.
   */
  readFolder(): Promise<BuiltinPlugin | undefined>;
  /** Keep what `readFolder` found. Its skills are installed separately, as any plugin's are. */
  add(plugin: BuiltinPlugin): Promise<PluginView[]>;
  /** Forget one that was added: its skills go with it. Refuses for the ones that ship. */
  forget(id: string): Promise<PluginView[]>;
  /**
   * Told when a plugin was installed or removed in any window.
   *
   * So the chat's ＋ menu lights up the moment a plugin is installed from the settings gallery, and
   * the gallery's own count follows an install made from the chat's suggestion.
   */
  onChanged(listener: () => void): () => void;
};
