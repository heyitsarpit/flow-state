// Shows the stress flag selects exactly the stress files: the default run lists every package test
// file but the `*.stress.test.ts` ones, FLOW_STRESS=1 lists exactly those, every stress file runs
// stress material, and no other file does.
//
//   node --experimental-strip-types tools/stress/select.test.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..", "..");
const pkg = "packages/flow-state-v3";
const skipped = new Set(["node_modules", "prototypes"]);

// What a stress run reads: a fixture's stress Story or one it builds on call (`stress<Name>`), the
// stress slice of the reload sweep and its rule checks, a saved seeded stress Story (a manifest's
// `savedStress`), or the generated stress seeds.
const stressMaterial = [
  /import \{[^}]*\bstress\b[^}]*\} from "[^"]*fixtures\//u,
  /import \{[^}]*\bstress[A-Z]\w*\b[^}]*\} from "[^"]*fixtures\//u,
  /\bslices\.stress\b/u,
  /\bseededStress\b/u,
  /\bsavedStress\b/u,
  /\bseededRuns\("stress"\)/u,
  /\bseeds\("stress"\)/u,
];

const testFiles = (dir: string): ReadonlyArray<string> =>
  readdirSync(join(repo, dir), { withFileTypes: true }).flatMap((entry) => {
    if (skipped.has(entry.name)) return [];
    const path = join(dir, entry.name);

    if (entry.isDirectory()) return testFiles(path);

    return entry.name.endsWith(".test.ts") ? [path] : [];
  });

const listed = (stress: boolean) =>
  execFileSync(resolve(repo, "node_modules/.bin/vp"), ["test", "list", "--filesOnly", pkg], {
    cwd: repo,
    encoding: "utf8",
    timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FLOW_STRESS: stress ? "1" : "" },
  })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".test.ts"))
    .map((line) => relative(repo, resolve(repo, line)))
    .toSorted();

const all = testFiles(pkg).toSorted();
const stressFiles = all.filter((file) => file.endsWith(".stress.test.ts"));
const usesStress = (file: string) => stressMaterial.some((re) => re.test(readFileSync(join(repo, file), "utf8")));

assert.ok(stressFiles.length > 0, "no stress files");
assert.deepEqual(listed(true), stressFiles, "FLOW_STRESS=1 runs exactly the stress files");
assert.deepEqual(listed(false), all.filter((file) => !stressFiles.includes(file)), "the default run leaves out only the stress files");
assert.deepEqual(stressFiles.filter((file) => !usesStress(file)), [], "a stress file that runs no stress material");
assert.deepEqual(all.filter((file) => !stressFiles.includes(file) && usesStress(file)), [], "a default file that runs stress material");

console.log(`stress selection: ${stressFiles.length} stress files, ${all.length - stressFiles.length} default files`);
