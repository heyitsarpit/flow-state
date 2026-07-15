import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptRoot, "..");
const repositoryRoot = resolve(packageRoot, "../..");
const artifactRoot = resolve(repositoryRoot, "artifacts");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const licensePath = resolve(packageRoot, "LICENSE");
const releaseNotesPath = resolve(packageRoot, "RELEASE_NOTES.md");

const fail = (message) => {
  throw new Error(message);
};

if (manifest.private === true) fail("The release package must not be private.");
if (typeof manifest.license !== "string" || manifest.license.length === 0) {
  fail("package.json must declare the user-approved license before release preparation.");
}
if (!existsSync(licensePath)) fail("The package LICENSE file is missing.");
if (!existsSync(releaseNotesPath)) fail("The alpha release notes are missing.");

mkdirSync(artifactRoot, { recursive: true });
for (const entry of readdirSync(artifactRoot)) {
  if (entry.startsWith(`flow-state-${manifest.version}.tgz`)) {
    rmSync(resolve(artifactRoot, entry), { force: true });
  }
}

execFileSync("pnpm", ["pack", "--pack-destination", artifactRoot], {
  cwd: packageRoot,
  stdio: "inherit",
});

const candidates = readdirSync(artifactRoot).filter(
  (entry) => entry === `flow-state-${manifest.version}.tgz`,
);
if (candidates.length !== 1) {
  fail(`Expected one alpha tarball, found ${candidates.length}.`);
}

const tarball = resolve(artifactRoot, candidates[0]);
const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n");
for (const required of [
  "package/package.json",
  "package/README.md",
  "package/LICENSE",
  "package/dist/index.mjs",
  "package/dist/index.d.mts",
  "package/dist/react-entry.mjs",
  "package/dist/testing.mjs",
  "package/dist/server.mjs",
  "package/dist/inspect.mjs",
  "package/dist/cli/index.mjs",
]) {
  if (!entries.includes(required)) fail(`Tarball is missing ${required}.`);
}
for (const entry of entries) {
  if (
    entry.includes("/src/") ||
    entry.includes("/examples/") ||
    entry.includes("/apps/") ||
    entry.startsWith("/")
  ) {
    fail(`Tarball contains a private workspace path: ${entry}`);
  }
}

const packedManifest = JSON.parse(
  execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }),
);
for (const field of ["name", "version", "license", "engines", "repository", "exports"]) {
  if (packedManifest[field] === undefined) fail(`Packed manifest is missing ${field}.`);
}
if (packedManifest.name !== "flow-state" || packedManifest.version !== manifest.version) {
  fail("Packed manifest identity does not match the release package.");
}
if (packedManifest.license !== manifest.license) {
  fail("Packed manifest license does not match the source manifest.");
}

execFileSync(process.execPath, [resolve(scriptRoot, "check-packed-consumers.mjs"), tarball], {
  cwd: packageRoot,
  stdio: "inherit",
});

const checksum = createHash("sha256").update(readFileSync(tarball)).digest("hex");
const checksumPath = `${tarball}.sha256`;
writeFileSync(checksumPath, `${checksum}  ${basename(tarball)}\n`);

process.stdout.write(
  [
    `artifact: ${tarball}`,
    `sha256: ${checksum}`,
    `install: pnpm add ./${join("artifacts", basename(tarball))}`,
    `publish: pnpm publish ./${join("artifacts", basename(tarball))} --tag alpha --access public`,
    "publish command was printed only; no external release was created.",
  ].join("\n") + "\n",
);
