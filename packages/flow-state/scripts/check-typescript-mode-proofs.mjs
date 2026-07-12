import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");

const typecheckConfigs = [
  {
    label: "strict baseline",
    packageDir: resolve(repoRoot, "examples", "typescript-proof-strict"),
  },
  {
    label: "strict + isolatedModules",
    packageDir: resolve(repoRoot, "examples", "typescript-proof-isolated-modules"),
  },
  {
    label: "strict + isolatedDeclarations",
    packageDir: resolve(repoRoot, "examples", "typescript-proof-isolated-declarations"),
  },
  {
    label: "multi-entry declaration emit",
    packageDir: resolve(repoRoot, "examples", "typescript-proof-multi-entry"),
  },
  {
    label: "packed React 18 declaration emit",
    packageDir: resolve(repoRoot, "examples", "typescript-proof-packed-react-18"),
  },
  {
    label: "packed React 19 declaration emit",
    packageDir: resolve(repoRoot, "examples", "typescript-proof-packed-react-19"),
  },
];

function runTypecheck(packageDir) {
  return spawnSync(
    "pnpm",
    ["exec", "tsc", "--pretty", "false", "-p", resolve(packageDir, "tsconfig.json")],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
}

for (const config of typecheckConfigs) {
  const result = runTypecheck(config.packageDir);

  if (result.status !== 0) {
    throw new Error(
      [
        `TypeScript mode proof failed for ${config.label}.`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter((part) => part.length > 0)
        .join("\n\n"),
    );
  }
}

console.log("TypeScript mode proofs ok.");
