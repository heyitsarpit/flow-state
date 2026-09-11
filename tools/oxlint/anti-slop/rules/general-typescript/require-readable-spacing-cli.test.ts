import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const probeRoot = mkdtempSync(join(tmpdir(), "anti-slop-spacing-"));
const config = join(probeRoot, "oxlint.json");
const cleanCases = [
  {
    name: "clean-import-export.ts",
    source: 'import { a } from "a";\n\nexport const b = a;\n',
  },
  {
    name: "clean-function.ts",
    source: "function f() {\n  const a = 1;\n\n  return a;\n}\n",
  },
  {
    name: "clean-overloads.ts",
    source: "function f(x: string): string;\nfunction f(x: number): number;\nfunction f(x: string | number) { return x; }\n",
  },
  {
    name: "clean-imports.ts",
    source: 'import { a } from "a";\nimport { b } from "b";\n\nexport const c = a + b;\n',
  },
  { name: "clean-single.ts", source: "function f() { return 1; }\n" },
];
const violatingCases = [
  {
    name: "violating-declarations.ts",
    source: "export const a = 1;\nexport const b = 2;\n",
    fixed: "export const a = 1;\n\nexport const b = 2;\n",
  },
  {
    name: "violating-return.ts",
    source: "function f() {\n  const a = 1;\n  return a;\n}\n",
    fixed: "function f() {\n  const a = 1;\n\n  return a;\n}\n",
  },
  {
    name: "violating-import.ts",
    source: 'import { a } from "a";\nconst b = a;\n',
    fixed: 'import { a } from "a";\n\nconst b = a;\n',
  },
  {
    name: "violating-types.ts",
    source: "export interface A {}\nexport class B {}\n",
    fixed: "export interface A {}\n\nexport class B {}\n",
  },
  {
    name: "violating-multiline.ts",
    source: "const f = Effect.gen(function* () {\n  const a = yield* A;\n  return a;\n});\nconst g = 1;\n",
    fixed: "const f = Effect.gen(function* () {\n  const a = yield* A;\n\n  return a;\n});\n\nconst g = 1;\n",
  },
];
const cleanPaths = cleanCases.map(({ name }) => join(probeRoot, name));
const violatingPaths = violatingCases.map(({ name }) => join(probeRoot, name));

function resolveOxlintCli(): string {
  const root = process.cwd();
  const directCli = join(root, "node_modules/oxlint/bin/oxlint");
  const expectedVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).devDependencies.oxlint as string;
  const directPackage = join(root, "node_modules/oxlint/package.json");
  if (existsSync(directPackage) && JSON.parse(readFileSync(directPackage, "utf8")).version === expectedVersion) {
    return directCli;
  }
  const storeRoot = join(root, "node_modules/.store");
  const storeEntry = readdirSync(storeRoot).find((entry) => entry.startsWith(`oxlint@${expectedVersion}_`));
  if (storeEntry !== undefined) return join(storeRoot, storeEntry, "node_modules/oxlint/bin/oxlint");
  throw new Error(`Cannot resolve Oxlint ${expectedVersion} installed alongside Vite Plus`);
}

const oxlintCli = resolveOxlintCli();

function runSpacingLint(...args: string[]) {
  const result = spawnSync(process.execPath, [oxlintCli, "--config", config, ...args], {
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

try {
  writeFileSync(
    config,
    JSON.stringify({
      jsPlugins: [
        { name: "anti-slop", specifier: fileURLToPath(new URL("../../index.ts", import.meta.url)) },
      ],
      rules: { "anti-slop/require-readable-spacing": "error" },
    }),
  );
  for (const testCase of cleanCases) writeFileSync(join(probeRoot, testCase.name), testCase.source);
  for (const testCase of violatingCases) writeFileSync(join(probeRoot, testCase.name), testCase.source);

  const rejected = runSpacingLint(...cleanPaths, ...violatingPaths);
  assert.equal(rejected.status, 1, rejected.output);
  assert.match(rejected.output, /require-readable-spacing/);

  const fixed = runSpacingLint("--fix", ...cleanPaths, ...violatingPaths);
  assert.equal(fixed.status, 0, fixed.output);
  for (const testCase of cleanCases) {
    assert.equal(readFileSync(join(probeRoot, testCase.name), "utf8"), testCase.source);
  }
  for (const testCase of violatingCases) {
    assert.equal(readFileSync(join(probeRoot, testCase.name), "utf8"), testCase.fixed);
  }

  const stable = [...cleanPaths, ...violatingPaths].map((path) => readFileSync(path, "utf8"));
  const clean = runSpacingLint(...cleanPaths, ...violatingPaths);
  assert.equal(clean.status, 0, clean.output);
  const repeated = runSpacingLint("--fix", ...cleanPaths, ...violatingPaths);
  assert.equal(repeated.status, 0, repeated.output);
  assert.deepEqual([...cleanPaths, ...violatingPaths].map((path) => readFileSync(path, "utf8")), stable);
} finally {
  rmSync(probeRoot, { recursive: true, force: true });
}
