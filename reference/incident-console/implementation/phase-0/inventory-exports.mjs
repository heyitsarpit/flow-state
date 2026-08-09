import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const packageRoot = resolve(root, "packages/flow-state");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const typescriptStore = readdirSync(resolve(root, "node_modules/.pnpm")).find((entry) =>
  entry.startsWith("typescript@"),
);
if (!typescriptStore) throw new Error("TypeScript is not installed in the workspace pnpm store");
const ts = (
  await import(
    pathToFileURL(
      resolve(
        root,
        "node_modules/.pnpm",
        typescriptStore,
        "node_modules/typescript/lib/typescript.js",
      ),
    ).href
  )
).default;

const routeFiles = {
  ".": "src/index.ts",
  "./react": "src/react-entry.ts",
  "./testing": "src/testing.ts",
  "./server": "src/server.ts",
  "./inspect": "src/inspect.ts",
};

const cliFiles = [
  "src/cli/behavior-contract.ts",
  "src/cli/gateway.ts",
  "src/cli/index.ts",
  "src/cli/output-projections.ts",
  "src/cli/shared.ts",
  "src/cli/story-paths.ts",
  "src/cli/story-read.ts",
  "src/cli/story-registry.ts",
  "src/cli/story-run.ts",
  "src/cli/trace-diff.ts",
  "src/cli/trace-input.ts",
];

const sourcePaths = [...Object.values(routeFiles), ...cliFiles].map((path) =>
  resolve(packageRoot, path),
);
const program = ts.createProgram(sourcePaths, {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
});
const checker = program.getTypeChecker();

function exportsOf(relativePath) {
  const source = program.getSourceFile(resolve(packageRoot, relativePath));
  if (!source) throw new Error(`missing source: ${relativePath}`);
  const symbol = checker.getSymbolAtLocation(source);
  if (!symbol) throw new Error(`missing module symbol: ${relativePath}`);
  const values = [];
  const types = [];
  for (const exported of checker.getExportsOfModule(symbol)) {
    const resolved =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const hasValue = (resolved.flags & ts.SymbolFlags.Value) !== 0;
    const hasType = (resolved.flags & ts.SymbolFlags.Type) !== 0;
    if (hasValue) values.push(exported.name);
    if (hasType) types.push(exported.name);
  }
  return { values: values.sort(), types: types.sort() };
}

const routes = Object.fromEntries(
  Object.entries(routeFiles).map(([route, file]) => [route, { file, ...exportsOf(file) }]),
);
const cliModules = Object.fromEntries(cliFiles.map((file) => [file, exportsOf(file)]));

process.stdout.write(
  `${JSON.stringify(
    {
      head: process.env.FLOW_STATE_BASELINE_HEAD ?? null,
      package: "flow-state",
      packageVersion: manifest.version,
      exports: manifest.exports,
      bin: manifest.bin,
      routeDispositions: {
        ".": "change",
        "./react": "change",
        "./testing": "change",
        "./server": "change",
        "./inspect": "change",
        "./package.json": "keep",
      },
      routes,
      cliModules,
    },
    null,
    2,
  )}\n`,
);
