/* oxlint-disable anti-slop/no-runtime-typeof -- parsed package JSON is validated at this I/O boundary. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageRoot = process.argv[2];
if (packageRoot === undefined) throw new Error("package root argument is required");

const manifestPath = resolve(packageRoot, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const [route, value] of Object.entries(manifest.exports)) {
  const targets =
    value !== null &&
    typeof value === "object" &&
    (Object.hasOwn(value, "import") || Object.hasOwn(value, "types"))
      ? Object.values(value)
      : [value];
  for (const target of targets) {
    if (typeof target !== "string" || !target.startsWith("./")) {
      throw new Error(`invalid ${route} export target`);
    }
    const targetPath = resolve(packageRoot, target);
    if (!existsSync(targetPath)) throw new Error(`missing ${route} target ${target}`);
    if (dirname(targetPath) === packageRoot && target !== "./package.json") {
      throw new Error(`unexpected root target ${target}`);
    }
  }
}

console.log("artifact-check\tPASS");
