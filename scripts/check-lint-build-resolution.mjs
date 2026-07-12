import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const rootPackage = readJson("package.json");
const flowPackage = readJson("packages/flow-state/package.json");
const launchPackage = readJson("examples/launch-workspace/package.json");

const failures = [];

const expectEqual = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

expectEqual("root lint script", rootPackage.scripts?.lint, "pnpm lint:prepare && vp lint");
expectEqual(
  "root lint:prepare script",
  rootPackage.scripts?.["lint:prepare"],
  "pnpm --filter flow-state build",
);
expectEqual(
  "flow-state build script",
  flowPackage.scripts?.build,
  "pnpm check:cli-source-types && vp pack src/index.ts src/react-entry.ts src/testing.ts src/server.ts src/inspect.ts && pnpm prepare:build-output && pnpm check:build-output",
);
expectEqual("flow-state esbuild devDependency", flowPackage.devDependencies?.esbuild, "0.28.1");
expectEqual(
  "launch workspace flow-state dependency",
  launchPackage.dependencies?.["flow-state"],
  "workspace:*",
);

for (const [subpath, exportConfig] of Object.entries(flowPackage.exports ?? {})) {
  if (subpath === "./package.json") {
    continue;
  }

  if (
    typeof exportConfig !== "object" ||
    exportConfig === null ||
    typeof exportConfig.types !== "string"
  ) {
    failures.push(`flow-state export ${subpath}: missing string types condition`);
    continue;
  }

  if (!exportConfig.types.startsWith("./dist/")) {
    failures.push(
      `flow-state export ${subpath}: types condition must resolve through dist, got ${exportConfig.types}`,
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
