/**
 * What the agent is made of, as files.
 *
 * Skills, prompt templates, always-on instructions and extensions are not Forge's inventions —
 * they are `pi-coding-agent`'s, in its own layout under the directory Forge hands it. This
 * module's whole job is to let a person see and edit those files without leaving the
 * application; Pi is what reads them.
 *
 * That is also why there is no "MCP server" here. Pi has none. The same job — giving the agent
 * more to work with — is done by extensions (which hook events and can register tools) and by
 * the instructions that are always in force.
 */

export type ResourceKind = "skill" | "prompt" | "extension";

/** One file, as the list shows it. */
export type ResourceFinding = {
  kind: "command" | "unlisted-command" | "import" | "url" | "tool";
  what: string;
  line?: number;
  note?: string;
};

export type ResourceInspection = {
  /** Commands the text asks for, declared or read out of its code blocks. */
  commands: string[];
  /** Of those, the ones no allowlist grants. They would be refused at execution time. */
  unlisted: string[];
  /** For an extension: the tools it says it registers. */
  tools: string[];
  findings: ResourceFinding[];
};

export type AgentResource = {
  kind: ResourceKind;
  /** The name Pi knows it by: the directory for a skill, the filename for the rest. */
  name: string;
  /** From the frontmatter, or the first line. What the agent is told about it. */
  description: string;
  /**
   * For a skill: the line put into the message box when it is picked from the ＋ menu.
   *
   * From `goal:` in the frontmatter. Absent on a skill that is knowledge only, and on everything
   * that is not a skill.
   */
  goal?: string;
  /** Absolute, for the button that opens it in the operator's own editor. */
  path: string;
  /** Bytes, so a skill that grew a reference folder is visible as one. */
  size: number;
  updatedAt: string;
  /**
   * For an extension: the tools it says it registers, from its `@tools` line.
   *
   * Declared rather than discovered. Finding out by loading the extension would mean running
   * somebody's code to learn what it wants permission for.
   */
  tools?: string[];
};


export type MachinaRemoteResourcesApi = {
  list(kind: ResourceKind): Promise<AgentResource[]>;
  /**
   * Bring in a skill that already exists on this machine.
   *
   * Asks for a `SKILL.md` or the folder around one, copies it in, and returns the name it landed
   * under — or nothing when the operator cancelled.
   */
  importSkill(): Promise<string | undefined>;
  /** The file's text. Skills return their `SKILL.md`. */
  read(kind: ResourceKind, name: string): Promise<string>;
  /**
   * What this text would bring, read before it is trusted.
   *
   * A pair of eyes in front of the walls, not a wall — the walls are the allowlist, the
   * approval and the record, at execution time. See ADR 0002.
   */
  inspect(kind: ResourceKind, name: string): Promise<ResourceInspection>;
  /**
   * The same file, read by a model.
   *
   * Asked for by the operator, never automatic: the text goes to whichever model provider is
   * configured, and a skill is full of the customer's own vocabulary. See ADR 0002 — this layer
   * is help, and the card says so.
   */
  review(kind: ResourceKind, name: string): Promise<ResourceReview>;
  /** Writes it, creating it if it is new. Returns the list again. */
  write(kind: ResourceKind, name: string, content: string): Promise<AgentResource[]>;
  remove(kind: ResourceKind, name: string): Promise<AgentResource[]>;
  /** The always-on instruction — one file, so it has no name. */
  readInstructions(): Promise<string>;
  writeInstructions(content: string): Promise<void>;
  /** Show it in the file manager, for the editing this window is not meant for. */
  reveal(kind: ResourceKind, name: string): Promise<void>;
  /** Where all of it lives, for the line that says so. */
  directory(): Promise<string>;
  /**
   * Whether the ChatGPT subscription is signed in, and whose login would be used.
   *
   * `operator` means the login they already did in a terminal (`~/.pi/agent/auth.json`); `forge`
   * means this application's own file, used only when there is no such login. No token crosses
   * this boundary — only whether there is one.
   */
  /**
   * The services Pi can reach, read from Pi.
   *
   * `subscription` means it has a login of its own (ChatGPT, Claude). The screen offers those,
   * and nothing else: a service reached with a key is an address and a key typed into the
   * model's own fields, which is the other half of the same dialog.
   */
  providers(): Promise<Array<{ id: string; name: string; subscription: boolean; apiKey: boolean }>>;
  /** What the provider asks for while signing in: a code, a key, or a choice. */
  login(providerId: string): Promise<void>;
  answerLogin(value: string): Promise<void>;
  /** Let go of a flow half-way through. Nothing is stored and no error is reported. */
  cancelLogin(): Promise<void>;
  logout(providerId: string): Promise<void>;
  onLoginPrompt(listener: (prompt?: AuthPromptView) => void): () => void;
  onLoginNote(
    listener: (note: {
      type: string;
      message?: string;
      url?: string;
      userCode?: string;
      verificationUri?: string;
    }) => void,
  ): () => void;
  subscription(providerId?: string): Promise<{ signedIn: boolean; path: string; from: "operator" | "forge" }>;
};

/** What a model made of a file that is about to be installed. Helpful, and fallible. */
export type ResourceReview = {
  summary: string;
  concerns: Array<{ what: string; why: string }>;
  /** Which model read it. */
  by: string;
  at: string;
};


/** One question from a provider's login flow, as the window has to render it. */
export type AuthPromptView = {
  type: "text" | "secret" | "select" | "manual_code";
  message: string;
  placeholder?: string;
  options?: ReadonlyArray<{ id: string; label: string; description?: string }>;
};

/**
 * What the reader says about what it found.
 *
 * Sentences, not codes — the same keying as every other message here (`shared/i18n.ts`), and the
 * window puts each through `t()` as it draws them, so a language change reaches a card that is
 * already open. `i18n.test.ts` walks this list and fails on one added without a translation.
 */
export const INSPECTION_NOTES = {
  startsProcesses: "It starts processes on this machine",
  readsFiles: "It reads and writes this machine's files",
  network: "It goes out to the network",
  networkFetch: "It goes out to the network (fetch)",
  readsMachine: "It reads this machine's details",
  declared: "Declared",
  unlisted: "A command the catalogue does not have, or of a kind that is not run. At run time it goes to you, or is refused",
  addsTool: "It gives the agent this tool",
  outboundUrl: "This may be somewhere it sends to",
  referencedUrl: "Written down as a reference",
} as const;
