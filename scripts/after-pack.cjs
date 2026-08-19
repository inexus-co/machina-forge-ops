/*
 * An ad-hoc signature, so an unsigned build can still start.
 *
 * On Apple Silicon macOS refuses to run code with no signature at all — an unsigned `.app` opens
 * with "damaged and can't be opened", which reads as a broken download rather than as a missing
 * certificate. `codesign --sign -` is the same thing `bundle.sh` does to the FreeRDP libraries:
 * it says nothing about who made this, and it is what makes the binary loadable.
 *
 * It is not a substitute for Developer ID and notarisation. Gatekeeper still stops the first
 * launch on another Mac; opening it from the context menu once, or clearing the quarantine
 * attribute, is the way past that. When a Developer ID exists, this hook comes out and
 * `mac.identity` goes in.
 */

const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  console.log(`ad-hoc signature: ${app}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
