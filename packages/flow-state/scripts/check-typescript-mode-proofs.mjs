import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const typecheckRoot = resolve(packageRoot, "typecheck");

const typecheckConfigs = [
  {
    label: "strict baseline",
    tsconfigPath: resolve(typecheckRoot, "tsconfig.strict.json"),
  },
  {
    label: "strict + isolatedModules",
    tsconfigPath: resolve(typecheckRoot, "tsconfig.isolated-modules.json"),
  },
  {
    label: "strict + isolatedDeclarations",
    tsconfigPath: resolve(typecheckRoot, "tsconfig.isolated-declarations.json"),
    needsOutDir: true,
  },
];

function runTypecheck(tsconfigPath, outDir) {
  const args = ["exec", "tsc", "--pretty", "false", "-p", tsconfigPath];

  if (outDir !== undefined) {
    args.push("--outDir", outDir);
  }

  return spawnSync("pnpm", args, {
    cwd: packageRoot,
    encoding: "utf8",
  });
}

for (const config of typecheckConfigs) {
  const outDir = config.needsOutDir
    ? mkdtempSync(resolve(tmpdir(), "flow-state-typescript-proof-"))
    : undefined;
  const result = runTypecheck(config.tsconfigPath, outDir);

  if (outDir !== undefined) {
    rmSync(outDir, { force: true, recursive: true });
  }

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
