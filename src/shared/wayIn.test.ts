import { describe, expect, it } from "vitest";
import { WAY_IN_PROVIDERS, argvOf, identityFor, lineFor, missingFieldsFor, providerFor } from "./wayIn";

/**
 * The table, checked as a table.
 *
 * What can be established without a provider is: that each row builds the line its own
 * documentation describes, that what was not filled in adds no arguments, and that a half-filled
 * row is caught before anything is spawned. Whether a shell actually comes back — and how their
 * tools behave when the login has expired — can only be established against a real account, and
 * is listed as such rather than mocked into looking true here.
 */

const line = (id: string, values: Record<string, string>) => lineFor({ provider: id, values });

describe("each provider's own spelling", () => {
  it("AWS asks Systems Manager for a session, which is a shell and not a port", () => {
    expect(line("aws", { target: "i-0a1b2c3d4e5f6a7b8" })?.argv).toEqual([
      "aws",
      "ssm",
      "start-session",
      "--target",
      "i-0a1b2c3d4e5f6a7b8",
    ]);
  });

  it("what was not filled in adds no arguments", () => {
    const filled = line("aws", { target: "i-1", region: "ap-northeast-1", profile: "work" });
    expect(filled?.argv).toContain("--region");
    expect(filled?.argv).toContain("ap-northeast-1");
    /* Their own way of saying which account, and not a flag. */
    expect(filled?.env).toEqual({ AWS_PROFILE: "work" });
    expect(line("aws", { target: "i-1", region: "  " })?.argv).not.toContain("--region");
    expect(line("aws", { target: "i-1" })?.env).toBeUndefined();
  });

  it("Google goes in through IAP", () => {
    expect(line("gcp", { instance: "web-1", zone: "asia-northeast1-b" })?.argv).toEqual([
      "gcloud",
      "compute",
      "ssh",
      "web-1",
      "--tunnel-through-iap",
      "--zone",
      "asia-northeast1-b",
    ]);
  });

  it("Azure names the machine and its group", () => {
    expect(line("azure", { name: "vm-1", group: "g" })?.argv).toEqual([
      "az",
      "ssh",
      "vm",
      "--name",
      "vm-1",
      "--resource-group",
      "g",
    ]);
  });

  it("nobody is asked for a port, because nothing here opens one", () => {
    for (const provider of WAY_IN_PROVIDERS) {
      const values = Object.fromEntries(provider.fields.map((field) => [field.key, "x"]));
      const argv = lineFor({ provider: provider.id, values })?.argv ?? [];
      expect(argv.join(" "), provider.id).not.toMatch(/portNumber|--port\b|local-host-port/);
    }
  });

  it("a row this version does not have is no way in at all", () => {
    expect(line("something-newer", { target: "x" })).toBeUndefined();
    expect(providerFor("something-newer")).toBeUndefined();
  });
});

describe("the row where the operator writes the line", () => {
  it("is taken as written", () => {
    expect(line("other", { command: "tsh ssh me@my-node" })?.argv).toEqual([
      "tsh",
      "ssh",
      "me@my-node",
    ]);
  });

  it("quotes hold a value together", () => {
    expect(argvOf(`docker exec -i "my box" sh`)).toEqual(["docker", "exec", "-i", "my box", "sh"]);
  });

  // An empty argument is a real argument, and dropping it silently changes the command.
  it("an empty quoted argument survives", () => {
    expect(argvOf(`tool --flag "" --other`)).toEqual(["tool", "--flag", "", "--other"]);
  });

  /*
   * Nothing else means anything.
   *
   * There is no shell between the field and the process, so a semicolon is a semicolon — one
   * argument containing a character, not a second command. This is the assertion that says so.
   */
  it("a metacharacter is just a character", () => {
    expect(argvOf("tool arg;rm -rf /")).toEqual(["tool", "arg;rm", "-rf", "/"]);
    expect(argvOf("tool $HOME")).toEqual(["tool", "$HOME"]);
  });

  it("nothing is nothing", () => {
    expect(argvOf("   ")).toEqual([]);
    expect(line("other", { command: "   " })).toBeUndefined();
  });
});

describe("what has not been filled in", () => {
  it("is named, so nobody has to hunt for it", () => {
    expect(missingFieldsFor({ provider: "azure", values: { name: "b" } }).map((f) => f.key)).toEqual(
      ["group"],
    );
  });

  it("does not include the ones that are allowed to be empty", () => {
    expect(missingFieldsFor({ provider: "aws", values: { target: "i-1" } })).toEqual([]);
    expect(WAY_IN_PROVIDERS.find((p) => p.id === "aws")?.fields.map((f) => f.optional)).toEqual([
      undefined,
      true,
      true,
    ]);
  });

  it("a half-filled row does not become a command", () => {
    expect(line("azure", { name: "b" })).toBeUndefined();
  });
});

/*
 * What the machine is called when it has no address.
 *
 * It goes in the sidebar, the logbook and every run record, so it has to mean the same machine
 * next week. The instance id does; the session the provider opens today does not.
 */
describe("what to call it", () => {
  it("is the provider and the thing that does not change", () => {
    expect(identityFor({ provider: "aws", values: { target: "i-0a1b", region: "ap-northeast-1" } })).toBe(
      "aws:i-0a1b",
    );
    expect(identityFor({ provider: "gcp", values: { instance: "web-1", zone: "z" } })).toBe("gcp:web-1");
  });

  it("falls back to the provider rather than to nothing", () => {
    expect(identityFor({ provider: "aws", values: {} })).toBe("aws");
  });
});

describe("the table itself", () => {
  it("every row can be told apart and asks for something", () => {
    const ids = WAY_IN_PROVIDERS.map((each) => each.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const provider of WAY_IN_PROVIDERS) {
      expect(provider.fields.length, provider.id).toBeGreaterThan(0);
      expect(new Set(provider.fields.map((f) => f.key)).size).toBe(provider.fields.length);
    }
  });

  /* The form lays every row's fields in one cell and the tallest sets the height. Rows are added
     here rather than in the screen, so this is where a row too tall for that cell is noticed. */
  it("no row asks for more than the form has room for", () => {
    for (const provider of WAY_IN_PROVIDERS) {
      expect(provider.fields.length, provider.id).toBeLessThanOrEqual(3);
    }
  });
});
