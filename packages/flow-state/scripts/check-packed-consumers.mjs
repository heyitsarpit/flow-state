import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
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
const requestedTarball =
  process.argv[2] === undefined ? undefined : resolve(process.cwd(), process.argv[2]);
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

const packageOverride = (name) => `link:${join(repoRoot, "node_modules", ...name.split("/"))}`;

function createConsumer(name, dependencies, devDependencies = {}, overrides = {}) {
  const root = join(workspace, name);
  mkdirSync(join(root, "src"), { recursive: true });
  writeJson(join(root, "package.json"), {
    name: `@flow-state/packed-proof-${name}`,
    private: true,
    type: "module",
    dependencies,
    devDependencies,
    overrides: {
      "@effect/platform-node": packageOverride("@effect/platform-node"),
      "@tanstack/store": packageOverride("@tanstack/store"),
      effect: packageOverride("effect"),
      esbuild: packageOverride("esbuild"),
      ...overrides,
    },
  });
  return root;
}

function install(root) {
  run("nub", ["install", "--offline", "--ignore-scripts", "--no-frozen-lockfile"], { cwd: root });
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
  if (requestedTarball === undefined) {
    mkdirSync(packDir, { recursive: true });
    run("nub", ["pack", "--pack-destination", packDir], { cwd: packageRoot });
    const tarballs = readdirSync(packDir).filter((entry) => entry.endsWith(".tgz"));
    if (tarballs.length !== 1) {
      throw new Error(`nub pack produced ${tarballs.length} tarballs instead of one.`);
    }
    tarball = join(packDir, tarballs[0]);
  } else {
    if (!existsSync(requestedTarball)) {
      throw new Error(`Requested tarball does not exist: ${requestedTarball}`);
    }
    tarball = requestedTarball;
  }
  if (readFileSync(tarball).length === 0) {
    throw new Error("nub pack produced an empty tarball.");
  }
  const tarballSpec = `file:${tarball}`;

  const coreRoot = createConsumer("core", {
    effect: "4.0.0-rc.112",
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
type PackedMachineEvent = Readonly<{ readonly type: "SAVE" }>;
type PackedForeignEvent = Readonly<{ readonly type: "FOREIGN" }>;
const routeFreeTransaction = flow.transaction({
  id: "packed.route-free-transaction",
  commit: () => Effect.succeed("saved"),
});
const foreignTransaction = flow.transaction<void, string, never, never, PackedForeignEvent>({
  id: "packed.foreign-transaction",
  commit: () => Effect.succeed("saved"),
  routes: { success: () => ({ type: "FOREIGN" }) },
});
const borrowedBrandTransaction = { ...routeFreeTransaction, ...foreignTransaction };
flow.machine<{}, PackedMachineEvent, "idle">({
  id: "packed.borrowed-brand-machine",
  initial: "idle",
  context: () => ({}),
  states: {
    idle: {
      // @ts-expect-error route-free transactions cannot lend compatibility to foreign routes
      invoke: flow.run(borrowedBrandTransaction),
    },
  },
});
const machine = flow.machine({
  id: "packed.machine",
  initial: "idle",
  context: () => ({}),
  states: { idle: {} },
});
type SelectedContext = Readonly<{ readonly projectId: string }>;
type SelectedEvent = Readonly<{ readonly type: "RELOAD" }>;
const selectedMachine = flow.machine<SelectedContext, SelectedEvent>()({
  id: "packed.selected-machine",
  initial: "ready",
  context: () => ({ projectId: "packed" }),
  states: {
    ready: {
      invoke: flow.ensure(project, {
        params: ({ context }: flow.ResourceParams<SelectedContext>) => [context.projectId],
      }),
      on: { RELOAD: { target: "ready", reenter: true } },
    },
  },
});
flow.ensure(project, {
  // @ts-expect-error packed declarations preserve the resource parameter tuple
  params: () => [123],
});
// @ts-expect-error packed declarations check initial against inferred state keys
flow.machine<SelectedContext, SelectedEvent>()({
  id: "packed.invalid-initial",
  initial: "missing",
  context: () => ({ projectId: "packed" }),
  states: { ready: {} },
});
const module = flow.module("Packed", {
  resources: { project },
  machines: { machine, selectedMachine },
});
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
  install(coreRoot);
  typecheck(coreRoot);
  run("node", ["src/index.ts"], { cwd: coreRoot });
  const installedManifest = JSON.parse(
    readFileSync(join(coreRoot, "node_modules", "flow-state", "package.json"), "utf8"),
  );
  if (installedManifest.type !== "module") throw new Error("packed package is not ESM.");
  if (installedManifest.peerDependenciesMeta?.react?.optional !== true) {
    throw new Error("React must be an optional peer for core-only consumers.");
  }
  if (installedManifest.peerDependencies?.effect !== "4.0.0-rc.112") {
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

  const testingRoot = createConsumer("testing", {
    effect: "4.0.0-rc.112",
    "flow-state": tarballSpec,
  });
  writeFileSync(
    join(testingRoot, "src", "index.mjs"),
    `import * as flow from "flow-state";
import { test } from "flow-state/testing";
const machine = flow.machine({ id: "packed.testing", initial: "idle", context: () => ({}), states: { idle: { on: { START: { target: "running" } } }, running: {} } });
const harness = test(machine).run().send({ type: "START" });
if (harness.state() !== "running") throw new Error("testing entrypoint did not execute");
if (harness.pendingWork().activeFibers !== 0) throw new Error("testing entrypoint leaked work");
`,
  );
  install(testingRoot);
  run("node", ["src/index.mjs"], { cwd: testingRoot });

  const serverRoot = createConsumer("server", {
    effect: "4.0.0-rc.112",
    "flow-state": tarballSpec,
  });
  writeFileSync(
    join(serverRoot, "src", "index.mjs"),
    `import { Effect } from "effect";
import * as flow from "flow-state";
import { withRequestRuntime } from "flow-state/server";
const resource = flow.resource({ id: "packed.server.resource", key: () => flow.createKey("packed-server"), lookup: () => Effect.succeed("ready") });
const module = flow.module("PackedServer", { resources: { resource } });
const app = flow.app({ modules: [module] });
const layer = app.layer({ store: flow.store.test(), orchestrators: flow.orchestrators.test() });
await withRequestRuntime(layer, async (runtime) => {
  runtime.resources.seedResources([{ ref: resource.ref(), value: "ready" }]);
  if (runtime.dehydrateBoot().resources[0]?.snapshot.value !== "ready") throw new Error("server entrypoint did not execute");
});
`,
  );
  install(serverRoot);
  run("node", ["src/index.mjs"], { cwd: serverRoot });

  const inspectRoot = createConsumer("inspect", {
    effect: "4.0.0-rc.112",
    "flow-state": tarballSpec,
  });
  writeFileSync(
    join(inspectRoot, "src", "index.mjs"),
    `import * as flow from "flow-state";
import { captureTrace, graphOf } from "flow-state/inspect";
const machine = flow.machine({ id: "packed.inspect", initial: "idle", context: () => ({}), states: { idle: {} } });
const graph = graphOf(machine);
if (graph.nodes.length !== 1) throw new Error("inspect graph did not execute");
const module = flow.module("PackedInspect", { machines: { machine } });
const app = flow.app({ modules: [module] });
const runtime = flow.runtime(app.layer({ store: flow.store.test(), orchestrators: flow.orchestrators.test() }));
const actor = runtime.orchestrators.start(machine);
const trace = captureTrace(actor.getSnapshot());
if (trace.snapshot.machine.id !== machine.id) throw new Error("inspect trace did not execute");
await runtime.dispose();
`,
  );
  install(inspectRoot);
  run("node", ["src/index.mjs"], { cwd: inspectRoot });

  const cliRoot = createConsumer("cli", {
    effect: "4.0.0-rc.112",
    "flow-state": tarballSpec,
  });
  install(cliRoot);
  const cliHelp = run(join(cliRoot, "node_modules", ".bin", "flow-state"), ["--help"], {
    cwd: cliRoot,
  });
  for (const family of ["behavior", "story", "trace"]) {
    if (!cliHelp.includes(family)) throw new Error(`packed CLI help omitted ${family}`);
  }

  const multiRoot = createConsumer(
    "multi-entry",
    { effect: "4.0.0-rc.112", "flow-state": tarballSpec, react: packageOverride("react") },
    { "@types/react": packageOverride("@types/react") },
    { react: packageOverride("react") },
  );
  cpSync(
    resolve(packageRoot, "typecheck", "multi-entry-declarations.ts"),
    join(multiRoot, "src", "index.ts"),
  );
  writeTypeScriptConfig(multiRoot);
  install(multiRoot);
  typecheck(multiRoot);

  for (const major of [18, 19]) {
    const reactRoot = createConsumer(
      `react-${major}`,
      {
        effect: "4.0.0-rc.112",
        "flow-state": tarballSpec,
        react: major === 18 ? "18.3.1" : packageOverride("react"),
      },
      {
        "@types/react": major === 18 ? "18.3.31" : packageOverride("@types/react"),
      },
      major === 18 ? {} : { react: packageOverride("react") },
    );
    cpSync(
      resolve(repoRoot, "examples", `typescript-proof-packed-react-${major}`, "src", "index.ts"),
      join(reactRoot, "src", "index.ts"),
    );
    writeTypeScriptConfig(reactRoot);
    install(reactRoot);
    typecheck(reactRoot);
  }

  const incidentSourceRoot = resolve(repoRoot, "examples", "incident-console");
  const incidentDependency = packageOverride;
  const flagshipRoot = createConsumer(
    "incident-console",
    {
      clsx: incidentDependency("clsx"),
      effect: "4.0.0-rc.112",
      "flow-state": tarballSpec,
      next: incidentDependency("next"),
      react: incidentDependency("react"),
      "react-dom": incidentDependency("react-dom"),
      "tailwind-merge": incidentDependency("tailwind-merge"),
      "tw-animate-css": incidentDependency("tw-animate-css"),
    },
    {
      "@types/node": `link:${join(repoRoot, "node_modules/@types/node")}`,
      "@types/react": incidentDependency("@types/react"),
      "@types/react-dom": incidentDependency("@types/react-dom"),
    },
    {
      next: incidentDependency("next"),
      react: incidentDependency("react"),
      "react-dom": incidentDependency("react-dom"),
    },
  );
  for (const directory of ["app", "components", "lib", "server", "src"]) {
    cpSync(resolve(incidentSourceRoot, directory), join(flagshipRoot, directory), {
      recursive: true,
      filter: (source) => !source.endsWith(".test.ts") && !source.endsWith(".test.tsx"),
    });
  }
  cpSync(resolve(incidentSourceRoot, "next-env.d.ts"), join(flagshipRoot, "next-env.d.ts"));
  writeJson(join(flagshipRoot, "tsconfig.json"), {
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
      paths: { "@/*": ["./*"] },
      skipLibCheck: true,
      strict: true,
      target: "ES2024",
      types: ["node"],
      verbatimModuleSyntax: true,
    },
    include: [
      "next-env.d.ts",
      "app/**/*.ts",
      "app/**/*.tsx",
      "components/**/*.ts",
      "components/**/*.tsx",
      "lib/**/*.ts",
      "server/**/*.ts",
      "src/**/*.ts",
      "src/**/*.tsx",
    ],
  });
  install(flagshipRoot);
  typecheck(flagshipRoot);

  const recipeRoot = createConsumer(
    "basic-cached-posts",
    {
      effect: "4.0.0-rc.112",
      "flow-state": tarballSpec,
      next: packageOverride("next"),
      react: packageOverride("react"),
      "react-dom": packageOverride("react-dom"),
    },
    {
      "@types/react": `link:${join(repoRoot, "node_modules/@types/react")}`,
      "@types/react-dom": `link:${join(repoRoot, "node_modules/@types/react-dom")}`,
    },
    {
      next: packageOverride("next"),
      react: packageOverride("react"),
      "react-dom": packageOverride("react-dom"),
    },
  );
  cpSync(resolve(repoRoot, "examples", "basic-cached-posts", "src"), join(recipeRoot, "src"), {
    recursive: true,
  });
  cpSync(resolve(repoRoot, "examples", "basic-cached-posts", "app"), join(recipeRoot, "app"), {
    recursive: true,
  });
  cpSync(
    resolve(repoRoot, "examples", "basic-cached-posts", "next-env.d.ts"),
    join(recipeRoot, "next-env.d.ts"),
  );
  writeJson(join(recipeRoot, "tsconfig.json"), {
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
  install(recipeRoot);
  typecheck(recipeRoot);

  console.log(`Packed consumer proofs ok for ${basename(tarball)}.`);
} finally {
  rmSync(workspace, { force: true, recursive: true });
}
