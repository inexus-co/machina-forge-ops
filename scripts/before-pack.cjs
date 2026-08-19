/*
 * The RDP helper, put where the packager can pick it up.
 *
 * The application looks for `Resources/rdp/machina-rdp` (see `rdpSession.ts`), and what has to
 * arrive there is not just the binary: `bundle.sh` produces the helper plus a `lib/` of FreeRDP
 * libraries whose install names point at `@loader_path`, so nothing outside the app is needed at
 * run time. This copies that directory to a fixed place the config can name.
 *
 * It is deliberately not fatal when the helper cannot be produced. A Mac cannot build the Linux
 * helper and nobody has written the Windows one, so those packages ship without a screen — and
 * the application says so in words rather than failing to start (`missingHelper()`). Everything
 * else in it reaches the customer's server through `ssh2` and needs nothing built.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
/** Where `extraResources` reads from. Rebuilt each pack so a stale helper cannot travel. */
const staging = path.join(root, "build", "rdp");

/** `uname -m` names differ from Node's; the build scripts already speak Node's. */
function helperDirectory(platform, arch) {
  return path.join(root, "native", "rdp", "bin", `${platform}-${arch}`);
}

/** Whether this machine can produce the helper for the platform being packed. */
function canBuildHere(platform) {
  if (platform === "darwin") return process.platform === "darwin";
  if (platform === "linux") return process.platform === "linux";
  return false;
}

/*
 * A copy of the icon for the packager to chew on.
 *
 * electron-builder re-encodes whatever file it is given as the icon, in place. Pointed at
 * `assets/icon.png` it rewrote a tracked source file on every package — a diff nobody asked for,
 * in a binary. It gets its own copy.
 */
function stageIcon() {
  const from = path.join(root, "assets", "icon.png");
  const to = path.join(root, "build", "packager", "icon.png");
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

exports.default = async function beforePack(context) {
  stageIcon();
  const platform = context.electronPlatformName;
  const arch = context.arch === 1 ? "x64" : context.arch === 3 ? "arm64" : String(context.arch);

  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  const from = helperDirectory(platform, arch);
  if (canBuildHere(platform)) {
    /*
     * Always, not only when the directory is missing.
     *
     * A developer's `build.sh` leaves a helper that points at their Homebrew, and it sits in the
     * same directory a packaged one would. Packing that copies a binary which starts here and
     * nowhere else. macOS gets `bundle.sh`, which relinks and then makes the result
     * self-contained; Linux gets `build.sh`, which links against the machine's own FreeRDP — a
     * Linux package therefore still expects FreeRDP 3 on the far end. Making that self-contained
     * is a job of its own.
     */
    const script = platform === "darwin" ? "bundle.sh" : "build.sh";
    console.log(`Building the RDP helper (${script})…`);
    try {
      execFileSync(path.join(root, "native", "rdp", script), { stdio: "inherit" });
    } catch {
      console.warn("The RDP helper could not be built.");
    }
  }

  if (!fs.existsSync(from)) {
    console.warn(`There is no RDP helper for ${platform}-${arch}. This will be an application with no screen.`);
    return;
  }

  /*
   * Ship a self-contained helper or none at all.
   *
   * A binary that still names `/opt/homebrew` works on the machine that built it and fails
   * everywhere else — and it fails at the moment somebody opens a customer's screen, which is
   * the worst moment for it. Better to hand over an application that says it has no screen.
   */
  if (platform === "darwin") {
    const external = execFileSync("otool", ["-L", path.join(from, "machina-rdp")])
      .toString()
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(" ")[0])
      .filter((each) => /^(\/opt\/homebrew|\/usr\/local|@rpath)/.test(each));
    if (external.length > 0) {
      console.warn("The RDP helper still points at libraries outside it. Not bundling it:");
      for (const each of external) console.warn(`  ${each}`);
      return;
    }
  }

  fs.cpSync(from, staging, { recursive: true });
  console.log(`Bundling the RDP helper: ${from}`);
};
