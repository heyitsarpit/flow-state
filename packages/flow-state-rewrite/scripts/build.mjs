import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");
const distRoot = resolve(packageRoot, "dist");
const vitePlusBin = resolve(repoRoot, "node_modules/.bin/vp");

rmSync(distRoot, { force: true, recursive: true });
execFileSync(vitePlusBin, ["pack", "--no-report"], { cwd: packageRoot, stdio: "inherit" });
