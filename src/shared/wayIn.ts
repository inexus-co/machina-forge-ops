/**
 * Reaching a machine by asking its provider for a shell on it.
 *
 * A cloud instance is increasingly run with no public address and no listening 22 — and no SSH
 * account either, which is the point: nobody wants to distribute keys to machines that come and go.
 * Every provider answers this the same way. Their own tool proves who you are with the credentials
 * you already have with them, and hands back a shell on the instance:
 *
 *     aws ssm start-session --target i-…
 *     gcloud compute ssh my-vm --zone … --tunnel-through-iap
 *     az ssh vm --name … --resource-group …
 *
 * **The table is the whole of it.** A provider is a row: its name, the two or three things it needs
 * asked for, and the line to run. There is no screen per provider and no branch per provider
 * anywhere else in the application; the form draws itself from these rows, and the runner
 * (`main/remote/shellHost.ts`) takes the argv this hands it.
 *
 * **Not a tunnel to port 22.** Forwarding a port would work, but then it is SSH again and the
 * operator is back to an account and a key on the instance — which is the thing they chose this
 * to avoid. What is given up instead is written down where it is felt: no SFTP.
 *
 * **Nothing of the provider\'s is stored.** The command runs on the operator\'s machine, as them,
 * with the credentials they already use there — the same decision as the Pi login
 * (`main/remote/agent/pi.ts`): a thing not to own when something else already owns it correctly.
 *
 * **No shell of ours in between.** The argv is built here and handed straight to the process, so
 * `;` and `|` in a field are characters rather than commands.
 *
 * The field labels are English here and translated where they are drawn; `i18n.test.ts` reads this
 * table so a row added without translations fails the build rather than a Japanese screen.
 */

/** One thing a provider needs asked for. */
export type WayInFieldSpec = {
  key: string;
  /** The operator\'s word for it. Translated where it is drawn. */
  label: string;
  /** A real example, not a description: what this looks like when it is right. */
  placeholder: string;
  /** Whether the connection works without it. */
  optional?: boolean;
};

/** What to run, and what it needs in its environment. */
export type WayInLine = { argv: string[]; env?: Record<string, string> };

export type WayInProvider = {
  id: string;
  /** The provider\'s own name for it. Not translated — it is what their documentation says. */
  name: string;
  /** Set where the name is ours rather than theirs, and so has to be translated. */
  ourWords?: boolean;
  fields: WayInFieldSpec[];
  /** Anything worth saying beside the fields. Translated where it is drawn. */
  note?: string;
  line: (values: Record<string, string>) => WayInLine;
};

/** Only what was filled in, trimmed. Empty is the same as absent. */
const said = (values: Record<string, string>, key: string): string | undefined => {
  const value = values[key]?.trim();
  return value ? value : undefined;
};

/**
 * One line, split the way a person reading it would.
 *
 * For the last row only, where the operator writes the command themselves. Quotes group, and
 * nothing else means anything: no variables, no globs, no `;`. A command that needs those is a
 * script, and a script is not what goes in a field.
 */
export function argvOf(line: string): string[] {
  const argv: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let started = false;
  for (const character of line.trim()) {
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      started = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (started || current) argv.push(current);
      current = "";
      started = false;
      continue;
    }
    current += character;
  }
  if (started || current) argv.push(current);
  return argv;
}

export const WAY_IN_PROVIDERS: WayInProvider[] = [
  {
    id: "aws",
    name: "AWS Systems Manager",
    fields: [
      { key: "target", label: "Instance ID", placeholder: "i-0a1b2c3d4e5f6a7b8" },
      { key: "region", label: "Region", placeholder: "ap-northeast-1", optional: true },
      { key: "profile", label: "Profile", placeholder: "default", optional: true },
    ],
    line: (values) => ({
      argv: [
        "aws",
        "ssm",
        "start-session",
        "--target",
        values.target?.trim() ?? "",
        ...(said(values, "region") ? ["--region", said(values, "region") as string] : []),
      ],
      /* Their own way of saying which account. Left to the environment when it is not said. */
      env: said(values, "profile") ? { AWS_PROFILE: said(values, "profile") as string } : undefined,
    }),
  },
  {
    id: "gcp",
    name: "Google Cloud IAP",
    fields: [
      { key: "instance", label: "Instance name", placeholder: "my-instance" },
      { key: "zone", label: "Zone", placeholder: "asia-northeast1-b" },
      { key: "project", label: "Project", placeholder: "my-project", optional: true },
    ],
    line: (values) => ({
      argv: [
        "gcloud",
        "compute",
        "ssh",
        values.instance?.trim() ?? "",
        "--tunnel-through-iap",
        ...(said(values, "zone") ? ["--zone", said(values, "zone") as string] : []),
        ...(said(values, "project") ? ["--project", said(values, "project") as string] : []),
      ],
    }),
  },
  {
    id: "azure",
    name: "Azure",
    fields: [
      { key: "name", label: "Machine name", placeholder: "my-vm" },
      { key: "group", label: "Resource group", placeholder: "my-group" },
    ],
    line: (values) => ({
      argv: [
        "az",
        "ssh",
        "vm",
        "--name",
        values.name?.trim() ?? "",
        "--resource-group",
        values.group?.trim() ?? "",
      ],
    }),
  },
  {
    /*
     * The last row, and the reason a provider nobody here has heard of is not a dead end.
     *
     * Teleport, Boundary, a company\'s own script, `docker exec` on a machine in the next room —
     * all of them are a line that ends in a shell, which is the only thing this side needs.
     */
    id: "other",
    name: "Something else",
    ourWords: true,
    fields: [
      {
        key: "command",
        label: "A command that ends in a shell",
        placeholder: "tsh ssh me@my-node",
      },
    ],
    note: "It runs on this machine, as you. What comes back has to be a shell — the command is not given one, so a pipe or a semicolon here is a character, not a second command.",
    line: (values) => ({ argv: argvOf(values.command ?? "") }),
  },
];

/**
 * What to call this machine, since it has no address.
 *
 * It is written down in the logbook, in the run records and in the sidebar, and those have to go
 * on meaning the same machine tomorrow. The instance id does; a session id would not.
 */
export function identityFor(wayIn: { provider: string; values: Record<string, string> }): string {
  const first = providerFor(wayIn.provider)?.fields[0];
  const value = first ? said(wayIn.values ?? {}, first.key) : undefined;
  return value ? `${wayIn.provider}:${value.slice(0, 80)}` : wayIn.provider;
}

export function providerFor(id: string | undefined): WayInProvider | undefined {
  return WAY_IN_PROVIDERS.find((each) => each.id === id);
}

/** What to run for this way in, or nothing if the row is not one this version knows. */
export function lineFor(wayIn: {
  provider: string;
  values: Record<string, string>;
}): WayInLine | undefined {
  const provider = providerFor(wayIn.provider);
  if (!provider) return undefined;
  const line = provider.line(wayIn.values ?? {});
  return line.argv.length > 0 && line.argv.every(Boolean) ? line : undefined;
}

/** Which of a provider\'s fields have not been filled in. The form asks; nothing else does. */
export function missingFieldsFor(wayIn: {
  provider: string;
  values: Record<string, string>;
}): WayInFieldSpec[] {
  const provider = providerFor(wayIn.provider);
  if (!provider) return [];
  return provider.fields.filter((field) => !field.optional && !said(wayIn.values ?? {}, field.key));
}
