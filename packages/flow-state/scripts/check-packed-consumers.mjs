import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");
const workspace = mkdtempSync(join(tmpdir(), "flow-state-packed-consumers-"));
const packDir = join(workspace, "pack");
let tarball;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? workspace,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed in ${options.cwd ?? workspace}.`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  return result.stdout;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createConsumer(name, dependencies, devDependencies = {}) {
  const root = join(workspace, name);
  mkdirSync(join(root, "src"), { recursive: true });
  writeJson(join(root, "package.json"), {
    name: `@flow-state/packed-proof-${name}`,
    private: true,
    type: "module",
    dependencies,
    devDependencies,
  });
  return root;
}

function linkPackage(root, name, source) {
  const target = join(root, "node_modules", ...name.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(realpathSync(source), target, "dir");
}

function install(root, links) {
  const nodeModules = join(root, "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", nodeModules], { cwd: root });
  renameSync(join(nodeModules, "package"), join(nodeModules, "flow-state"));
  for (const [name, source] of Object.entries(links)) linkPackage(root, name, source);
}

function typecheck(root) {
  run(
    resolve(repoRoot, "node_modules", ".bin", "tsc"),
    ["--pretty", "false", "-p", "tsconfig.json"],
    { cwd: root },
  );
}

function writeTypeScriptConfig(root, overrides = {}) {
  writeJson(join(root, "tsconfig.json"), {
    compilerOptions: {
      declaration: true,
      emitDeclarationOnly: true,
      exactOptionalPropertyTypes: true,
      forceConsistentCasingInFileNames: true,
      isolatedModules: true,
      jsx: "react-jsx",
      lib: ["DOM", "DOM.Iterable", "ES2024"],
      module: "ESNext",
      moduleDetection: "force",
      moduleResolution: "Bundler",
      noUncheckedIndexedAccess: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      outDir: "dist",
      rootDir: "src",
      skipLibCheck: true,
      strict: true,
      target: "ES2024",
      verbatimModuleSyntax: true,
      ...overrides,
    },
    include: ["src/**/*.ts", "src/**/*.tsx"],
  });
}

try {
  mkdirSync(packDir, { recursive: true });
  run("pnpm", ["pack", "--pack-destination", packDir], { cwd: packageRoot });
  const tarballName =
    readFileSync(join(packDir, "flow-state-0.0.0.tgz")).length > 0
      ? "flow-state-0.0.0.tgz"
      : undefined;
  if (tarballName === undefined) throw new Error("pnpm pack did not produce a non-empty tarball.");
  tarball = join(packDir, tarballName);
  const tarballSpec = `file:${tarball}`;

  const coreRoot = createConsumer("core", {
    effect: "4.0.0-beta.86",
    "flow-state": tarballSpec,
  });
  writeTypeScriptConfig(coreRoot, { noEmit: true, declaration: false, emitDeclarationOnly: false });
  writeFileSync(
    join(coreRoot, "src", "index.ts"),
    `import { Effect } from "effect";
import * as flow from "flow-state";
import { captureTrace, graphOf } from "flow-state/inspect";
import { withRequestRuntime } from "flow-state/server";
import { test } from "flow-state/testing";

const project = flow.resource({
  id: "packed.project",
  key: (id: string) => flow.createKey("packed-project", id),
  lookup: (id: string) => Effect.succeed({ id }),
});
const machine = flow.machine({
  id: "packed.machine",
  initial: "idle",
  context: () => ({}),
  states: { idle: {} },
});
const module = flow.module("Packed", { resources: { project }, machines: { machine } });
const app = flow.app({ modules: [module] });
const layer = app.layer({ store: flow.store.test(), orchestrators: flow.orchestrators.test() });
const runtime = flow.runtime(layer);
const actor = runtime.createActor(machine);
if (actor.getSnapshot().value !== "idle") throw new Error("packed actor did not execute");
if (graphOf(machine).nodes.length !== 1) throw new Error("packed inspect entry did not execute");
captureTrace(actor.getSnapshot());
test(machine).run();
await withRequestRuntime(layer, async (requestRuntime) => {
  await requestRuntime.runPromise(Effect.void);
});
await runtime.dispose();

let deepImportRejected = false;
try {
  const privatePath = "flow-state/core/api/types";
  await import(privatePath);
} catch (error) {
  deepImportRejected = error instanceof Error && "code" in error && error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED";
}
if (!deepImportRejected) throw new Error("private deep import was not rejected by package exports");
`,
  );
  install(coreRoot, {
    "@effect/platform-node": join(packageRoot, "node_modules", "@effect", "platform-node"),
    "@tanstack/store": join(packageRoot, "node_modules", "@tanstack", "store"),
    effect: join(packageRoot, "node_modules", "effect"),
  });
  typecheck(coreRoot);
  run("node", ["src/index.ts"], { cwd: coreRoot });
  const installedManifest = JSON.parse(
    readFileSync(join(coreRoot, "node_modules", "flow-state", "package.json"), "utf8"),
  );
  if (installedManifest.type !== "module") throw new Error("packed package is not ESM.");
  if (installedManifest.peerDependenciesMeta?.react?.optional !== true) {
    throw new Error("React must be an optional peer for core-only consumers.");
  }
  if (installedManifest.peerDependencies?.effect !== "4.0.0-beta.86") {
    throw new Error("Packed consumers must share the package's exact Effect peer.");
  }
  if (installedManifest.peerDependencies?.react !== "^18.0.0 || ^19.0.0") {
    throw new Error("Packed React peer range must support React 18 and React 19 only.");
  }
  const expectedExports = [".", "./react", "./testing", "./server", "./inspect", "./package.json"];
  if (JSON.stringify(Object.keys(installedManifest.exports)) !== JSON.stringify(expectedExports)) {
    throw new Error("Packed exports differ from the supported public entrypoints.");
  }
  for (const [entry, conditions] of Object.entries(installedManifest.exports)) {
    if (entry === "./package.json") continue;
    if (Object.keys(conditions).join(",") !== "types,import") {
      throw new Error(`Packed export '${entry}' must expose only types and import conditions.`);
    }
  }
  if (existsSync(join(coreRoot, "node_modules", "react"))) {
    throw new Error("Core-only installation unexpectedly installed React.");
  }

  const foreignPackage = join(coreRoot, "foreign", "node_modules", "flow-state");
  cpSync(join(coreRoot, "node_modules", "flow-state"), foreignPackage, { recursive: true });
  writeFileSync(
    join(coreRoot, "src", "duplicate-owner.mjs"),
    `import { Effect } from "effect";
import * as local from "flow-state";
import * as foreign from ${JSON.stringify(pathToFileURL(join(foreignPackage, "dist", "index.mjs")).href)};
const localResource = local.resource({ id: "duplicate.project", key: () => local.createKey("duplicate-project"), lookup: () => Effect.succeed(1) });
const foreignResource = foreign.resource({ id: localResource.id, key: () => foreign.createKey("duplicate-project"), lookup: () => Effect.succeed(1) });
const app = local.app({ modules: [local.module("Duplicate", { resources: { localResource } })] });
const runtime = local.runtime(app.layer({ store: local.store.test(), orchestrators: local.orchestrators.test() }));
let rejected = false;
try { runtime.resources.seedResources([{ ref: foreignResource.ref(), value: 1 }]); }
catch (error) { rejected = error?.code === "FLOW-STORE-001"; }
await runtime.dispose();
if (!rejected) throw new Error("duplicate package resource identity crossed app ownership");
`,
  );
  run("node", ["src/duplicate-owner.mjs"], { cwd: coreRoot });

  const multiRoot = createConsumer(
    "multi-entry",
    { effect: "4.0.0-beta.86", "flow-state": tarballSpec, react: "19.2.7" },
    { "@types/react": "19.2.17" },
  );
  cpSync(
    resolve(packageRoot, "typecheck", "multi-entry-declarations.ts"),
    join(multiRoot, "src", "index.ts"),
  );
  writeTypeScriptConfig(multiRoot);
  install(multiRoot, {
    "@effect/platform-node": join(packageRoot, "node_modules", "@effect", "platform-node"),
    "@tanstack/store": join(packageRoot, "node_modules", "@tanstack", "store"),
    "@types/react": join(packageRoot, "node_modules", "@types", "react"),
    effect: join(packageRoot, "node_modules", "effect"),
    react: join(packageRoot, "node_modules", "react"),
  });
  typecheck(multiRoot);

  for (const major of [18, 19]) {
    const versions =
      major === 18 ? { react: "18.3.1", types: "18.3.31" } : { react: "19.2.7", types: "19.2.17" };
    const reactRoot = createConsumer(
      `react-${major}`,
      { effect: "4.0.0-beta.86", "flow-state": tarballSpec, react: versions.react },
      { "@types/react": versions.types },
    );
    cpSync(
      resolve(repoRoot, "examples", `typescript-proof-packed-react-${major}`, "src", "index.ts"),
      join(reactRoot, "src", "index.ts"),
    );
    writeTypeScriptConfig(reactRoot);
    const reactProofRoot = resolve(repoRoot, "examples", `typescript-proof-packed-react-${major}`);
    install(reactRoot, {
      "@effect/platform-node": join(packageRoot, "node_modules", "@effect", "platform-node"),
      "@tanstack/store": join(packageRoot, "node_modules", "@tanstack", "store"),
      "@types/react": join(reactProofRoot, "node_modules", "@types", "react"),
      effect: join(packageRoot, "node_modules", "effect"),
      react: join(reactProofRoot, "node_modules", "react"),
    });
    typecheck(reactRoot);
  }

  const launchRoot = createConsumer(
    "launch-workspace",
    {
      effect: "4.0.0-beta.86",
      "flow-state": tarballSpec,
      next: "16.2.9",
      react: "19.2.7",
      "react-dom": "19.2.7",
    },
    { "@types/react": "19.2.17", "@types/react-dom": "19.2.3" },
  );
  cpSync(resolve(repoRoot, "examples", "launch-workspace", "src"), join(launchRoot, "src"), {
    recursive: true,
  });
  cpSync(resolve(repoRoot, "examples", "launch-workspace", "app"), join(launchRoot, "app"), {
    recursive: true,
  });
  cpSync(
    resolve(repoRoot, "examples", "launch-workspace", "next-env.d.ts"),
    join(launchRoot, "next-env.d.ts"),
  );
  writeJson(join(launchRoot, "tsconfig.json"), {
    compilerOptions: {
      allowSyntheticDefaultImports: true,
      exactOptionalPropertyTypes: true,
      forceConsistentCasingInFileNames: true,
      jsx: "react-jsx",
      lib: ["DOM", "DOM.Iterable", "ES2024"],
      module: "ESNext",
      moduleResolution: "Bundler",
      noEmit: true,
      noUncheckedIndexedAccess: true,
      skipLibCheck: true,
      strict: true,
      target: "ES2024",
      verbatimModuleSyntax: true,
    },
    include: ["next-env.d.ts", "app/**/*.ts", "app/**/*.tsx", "src/**/*.ts", "src/**/*.tsx"],
    exclude: ["**/*.test.ts", "**/*.test.tsx"],
  });
  const launchWorkspaceRoot = resolve(repoRoot, "examples", "launch-workspace");
  install(launchRoot, {
    "@effect/platform-node": join(packageRoot, "node_modules", "@effect", "platform-node"),
    "@tanstack/store": join(packageRoot, "node_modules", "@tanstack", "store"),
    "@types/react": join(launchWorkspaceRoot, "node_modules", "@types", "react"),
    "@types/react-dom": join(launchWorkspaceRoot, "node_modules", "@types", "react-dom"),
    effect: join(launchWorkspaceRoot, "node_modules", "effect"),
    next: join(launchWorkspaceRoot, "node_modules", "next"),
    react: join(launchWorkspaceRoot, "node_modules", "react"),
    "react-dom": join(launchWorkspaceRoot, "node_modules", "react-dom"),
  });
  typecheck(launchRoot);

  console.log(`Packed consumer proofs ok for ${basename(tarball)}.`);
} finally {
  rmSync(workspace, { force: true, recursive: true });
}
