/* oxlint-disable anti-slop/no-runtime-typeof -- parsed package JSON is validated at this I/O boundary. */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");
const workspace = mkdtempSync(join(tmpdir(), "flow-state-rewrite-packed-"));
const packRoot = join(workspace, "pack");
const runtimeFixture = resolve(packageRoot, "test/packed/runtime.mjs");
const typesFixture = resolve(packageRoot, "test/packed/types.ts");
const quickstartFixture = resolve(packageRoot, "test/packed/quickstart.ts");
const reactFixture = resolve(packageRoot, "test/packed/react.tsx");
const negativeFixture = resolve(packageRoot, "test/packed/negative-control.mjs");
const reactProofs = [
  {
    label: "react-18",
    manifestPath: resolve(repoRoot, "examples/typescript-proof-packed-react-18/package.json"),
  },
  {
    label: "react-19",
    manifestPath: resolve(repoRoot, "examples/typescript-proof-packed-react-19/package.json"),
  },
];
const expectedManifestExportKeys = [".", "./inspect", "./package.json", "./react", "./testing"];
const expectedTargetBasenames = new Map([
  [".", "index"],
  ["./react", "react-entry"],
  ["./testing", "testing"],
  ["./inspect", "inspect"],
]);

const hashFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const run = (command, args, options = {}) => {
  const cwd = options.cwd ?? workspace;
  const commandLine = [command, ...args].join(" ");
  console.log(`command\t${commandLine}\tcwd=${cwd}`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, CI: "true" },
    stdio: "inherit",
  });
  const status = result.status ?? 1;
  console.log(`exit\t${status}\t${commandLine}`);
  if (status !== 0) throw new Error(`${commandLine} failed in ${cwd}`);
  return status;
};

const runCaptured = (command, args, cwd) =>
  spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    stdio: "pipe",
  });

const packageOverride = (name) => `link:${join(repoRoot, "node_modules", ...name.split("/"))}`;

const createConsumer = (name, tarball, dependencies = {}, devDependencies = {}, overrides = {}) => {
  const root = join(workspace, name);
  mkdirSync(join(root, "src"), { recursive: true });
  writeJson(join(root, "package.json"), {
    name: `flow-state-rewrite-packed-${name}`,
    private: true,
    type: "module",
    dependencies: {
      effect: "4.0.0-rc.112",
      "flow-state-rewrite": `file:${tarball}`,
      ...dependencies,
    },
    devDependencies: { typescript: "7.0.2", ...devDependencies },
    overrides: {
      effect: packageOverride("effect"),
      typescript: packageOverride("typescript"),
      ...overrides,
    },
  });
  return root;
};

const writeTypeScriptConfig = (
  root,
  name,
  module,
  moduleResolution,
  { include = ["src/types.ts"], ...overrides } = {},
) => {
  writeJson(join(root, `tsconfig.${name}.json`), {
    compilerOptions: {
      exactOptionalPropertyTypes: true,
      forceConsistentCasingInFileNames: true,
      isolatedModules: true,
      lib: ["DOM", "DOM.Iterable", "ES2024"],
      module,
      moduleDetection: "force",
      moduleResolution,
      noEmit: true,
      noUncheckedIndexedAccess: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      skipLibCheck: true,
      strict: true,
      target: "ES2024",
      verbatimModuleSyntax: true,
      ...overrides,
    },
    include,
  });
};

const readPackageJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const localPackageOverride = (root, name) =>
  `link:${join(root, "node_modules", ...name.split("/"))}`;

const readLocalPackageVersion = (root, name) => {
  const packagePath = join(root, "node_modules", ...name.split("/"), "package.json");
  if (!existsSync(packagePath)) throw new Error(`missing local ${name} package manifest`);
  const packageJson = readPackageJson(packagePath);
  if (typeof packageJson.version !== "string")
    throw new Error(`local ${name} package manifest has no version`);
  return packageJson.version;
};

const createReactConsumer = (label, tarball, manifestPath) => {
  const manifest = readPackageJson(manifestPath);
  const exampleRoot = dirname(manifestPath);
  const pinnedPackageNames = ["react", "react-dom", "@types/react", "@types/react-dom"];
  const packageNames = [...pinnedPackageNames, "scheduler"];
  const overrides = {
    effect: packageOverride("effect"),
    typescript: packageOverride("typescript"),
    "@types/prop-types": packageOverride("@types/prop-types"),
    csstype: packageOverride("csstype"),
  };
  for (const name of packageNames) {
    const examplePath = join(exampleRoot, "node_modules", ...name.split("/"));
    const sourceRoot = existsSync(examplePath) ? exampleRoot : repoRoot;
    if (pinnedPackageNames.includes(name)) {
      const declaredVersion = manifest.dependencies[name] ?? manifest.devDependencies[name];
      if (typeof declaredVersion !== "string")
        throw new Error(`${label} manifest does not declare ${name}`);
      const actualVersion = readLocalPackageVersion(sourceRoot, name);
      if (actualVersion !== declaredVersion) {
        throw new Error(
          `${label} ${name} version mismatch: declared ${declaredVersion}, linked ${actualVersion}`,
        );
      }
      console.log(`react-package\t${label}\t${name}\t${actualVersion}`);
    }
    overrides[name] = localPackageOverride(sourceRoot, name);
  }
  const dependencies = Object.fromEntries(
    Object.entries(manifest.dependencies).filter(([name]) => name !== "flow-state"),
  );
  const devDependencies = Object.fromEntries(
    Object.entries(manifest.devDependencies).filter(([name]) => name.startsWith("@types/")),
  );
  return createConsumer(label, tarball, dependencies, devDependencies, overrides);
};

const readManifest = (root) => JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const exportTargets = (manifest) => {
  const targets = [];
  for (const [route, value] of Object.entries(manifest.exports)) {
    if (
      value !== null &&
      typeof value === "object" &&
      (Object.hasOwn(value, "import") || Object.hasOwn(value, "types"))
    ) {
      for (const kind of ["import", "types"]) {
        if (value[kind] !== undefined) targets.push({ kind, route, target: value[kind] });
      }
    } else {
      targets.push({ kind: "asset", route, target: value });
    }
  }
  return targets;
};

const assertTargetPath = (root, target) => {
  if (typeof target !== "string" || !target.startsWith("./")) {
    throw new Error(`invalid package-relative target ${String(target)}`);
  }
  const path = resolve(root, target);
  if (path !== root && !path.startsWith(`${root}/`)) {
    throw new Error(`export target escapes package: ${target}`);
  }
  return path;
};

const assertInstalledManifest = (root, manifest) => {
  if (manifest.private !== true) throw new Error("packed rewrite package lost private:true");
  const actualKeys = Object.keys(manifest.exports).sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedManifestExportKeys)) {
    throw new Error(`manifest routes differ: ${actualKeys.join(",")}`);
  }

  const targets = exportTargets(manifest);
  if (targets.filter(({ kind }) => kind !== "asset").length !== 8) {
    throw new Error("packed manifest must contain four runtime/type route pairs");
  }
  for (const [route, basenameValue] of expectedTargetBasenames) {
    const routeTargets = targets.filter((target) => target.route === route);
    if (routeTargets.length !== 2) throw new Error(`route ${route} has the wrong target count`);
    for (const kind of ["import", "types"]) {
      const target = routeTargets.find((candidate) => candidate.kind === kind);
      if (target === undefined) throw new Error(`route ${route} lacks ${kind} target`);
      const suffix = kind === "import" ? ".mjs" : ".d.mts";
      const expected = `./dist/${basenameValue}${suffix}`;
      if (target.target !== expected) {
        throw new Error(`${route} ${kind} target is ${target.target}, expected ${expected}`);
      }
      const path = assertTargetPath(root, target.target);
      if (!existsSync(path)) throw new Error(`missing packed ${kind} target ${target.target}`);
      console.log(`packed-output-hash\t${kind}\t${route}\t${target.target}\t${hashFile(path)}`);
    }
  }

  const packageJsonTarget = targets.find(
    ({ kind, route, target }) =>
      kind === "asset" && route === "./package.json" && target === "./package.json",
  );
  if (packageJsonTarget === undefined) throw new Error("package.json export target changed");
  console.log(
    `packed-output-hash\tasset\t./package.json\t./package.json\t${hashFile(join(root, "package.json"))}`,
  );
  return targets;
};

const readTarballManifest = (tarball) => {
  const result = runCaptured("tar", ["-tzf", tarball], packRoot);
  if (result.status !== 0) {
    throw new Error(`tar listing failed:\n${result.stderr.trim()}`);
  }
  const entries = result.stdout.trim().split("\n").filter(Boolean).sort();
  if (!entries.some((entry) => entry.endsWith("package/package.json"))) {
    throw new Error("tarball has no package manifest");
  }
  if (entries.some((entry) => entry.includes("/src/") || entry.includes("/test/"))) {
    throw new Error("tarball contains source or proof fixtures");
  }
  for (const entry of entries) console.log(`tarball-entry\t${entry}`);
  return entries;
};

const assertNegativeControl = (installedRoot, label, target) => {
  const originalRoot = realpathSync(installedRoot);
  const copyRoot = join(workspace, `negative-${label}`);
  cpSync(originalRoot, copyRoot, { recursive: true });
  const originalTarget = join(originalRoot, target);
  const originalHash = hashFile(originalTarget);
  rmSync(join(copyRoot, target));
  if (hashFile(originalTarget) !== originalHash)
    throw new Error("negative control mutated original package");

  const result = runCaptured(process.execPath, [negativeFixture, copyRoot], workspace);
  if (result.status === 0) throw new Error(`negative ${label} control unexpectedly passed`);
  const message =
    `${result.stdout}${result.stderr}`
      .trim()
      .split("\n")
      .find((line) => line.startsWith("Error:")) ?? "no diagnostic";
  console.log(`negative-control\tmissing-${label}\tstatus=${result.status}\t${message}`);
};

try {
  run("nub", ["run", "--filter", "flow-state-rewrite", "build"], { cwd: repoRoot });
  run("nub", ["run", "--filter", "flow-state-rewrite", "check:build-output"], { cwd: repoRoot });

  mkdirSync(packRoot, { recursive: true });
  run("nub", ["pack", "--pack-destination", packRoot], { cwd: packageRoot });
  const tarballs = readdirSync(packRoot).filter((entry) => entry.endsWith(".tgz"));
  if (tarballs.length !== 1) throw new Error(`nub pack produced ${tarballs.length} tarballs`);
  const tarball = join(packRoot, tarballs[0]);
  const tarballHash = hashFile(tarball);
  console.log(`tarball\t${basename(tarball)}\t${tarballHash}`);
  readTarballManifest(tarball);

  const consumerRoot = createConsumer("consumer", tarball);
  cpSync(runtimeFixture, join(consumerRoot, "src/runtime.mjs"));
  cpSync(typesFixture, join(consumerRoot, "src/types.ts"));
  cpSync(quickstartFixture, join(consumerRoot, "src/quickstart.ts"));
  writeTypeScriptConfig(consumerRoot, "nodenext", "NodeNext", "NodeNext");
  writeTypeScriptConfig(consumerRoot, "bundler", "ESNext", "Bundler");
  writeTypeScriptConfig(consumerRoot, "isolated-modules", "ESNext", "Bundler", {
    include: ["src/quickstart.ts"],
  });
  writeTypeScriptConfig(consumerRoot, "isolated-declarations", "NodeNext", "NodeNext", {
    declaration: true,
    include: ["src/quickstart.ts"],
    isolatedDeclarations: true,
    noEmit: false,
    outDir: "generated",
    rootDir: "src",
  });
  run("nub", ["install", "--offline", "--ignore-scripts", "--no-frozen-lockfile"], {
    cwd: consumerRoot,
  });

  const installedRoot = resolve(consumerRoot, "node_modules/flow-state-rewrite");
  if (!existsSync(installedRoot)) throw new Error("tarball package was not installed");
  const installedRealpath = realpathSync(installedRoot);
  const sourceRealpath = realpathSync(packageRoot);
  if (installedRealpath === sourceRealpath || installedRealpath.startsWith(`${sourceRealpath}/`)) {
    throw new Error("consumer resolved flow-state-rewrite from the workspace source");
  }
  console.log(`install-provenance\ttarball=${tarball}\tinstalled=${installedRealpath}`);

  const installedManifest = readManifest(installedRoot);
  const installedTargets = assertInstalledManifest(installedRoot, installedManifest);
  console.log(`manifest-routes\t${Object.keys(installedManifest.exports).join(",")}`);
  console.log(`manifest-target-count\t${installedTargets.length}`);

  run(
    resolve(consumerRoot, "node_modules/.bin/tsc"),
    ["--pretty", "false", "-p", "tsconfig.nodenext.json"],
    { cwd: consumerRoot },
  );
  console.log(
    "compiler-mode\tNodeNext\tstrict,exactOptionalPropertyTypes,noUncheckedIndexedAccess",
  );
  run(
    resolve(consumerRoot, "node_modules/.bin/tsc"),
    ["--pretty", "false", "-p", "tsconfig.bundler.json"],
    { cwd: consumerRoot },
  );
  console.log("compiler-mode\tBundler\tstrict,exactOptionalPropertyTypes,noUncheckedIndexedAccess");
  run(
    resolve(consumerRoot, "node_modules/.bin/tsc"),
    ["--pretty", "false", "-p", "tsconfig.isolated-modules.json"],
    { cwd: consumerRoot },
  );
  console.log("compiler-mode\tisolatedModules\tquickstart");
  run(
    resolve(consumerRoot, "node_modules/.bin/tsc"),
    ["--pretty", "false", "-p", "tsconfig.isolated-declarations.json"],
    { cwd: consumerRoot },
  );
  console.log("compiler-mode\tisolatedDeclarations\tquickstart");
  run("node", ["src/runtime.mjs"], { cwd: consumerRoot });

  assertNegativeControl(installedRoot, "runtime", "dist/index.mjs");
  assertNegativeControl(installedRoot, "declaration", "dist/index.d.mts");

  for (const { label, manifestPath } of reactProofs) {
    const reactConsumerRoot = createReactConsumer(label, tarball, manifestPath);
    cpSync(reactFixture, join(reactConsumerRoot, "src/react.tsx"));
    writeTypeScriptConfig(reactConsumerRoot, "react", "NodeNext", "NodeNext", {
      include: ["src/react.tsx"],
      jsx: "react-jsx",
    });
    run("nub", ["install", "--offline", "--ignore-scripts", "--no-frozen-lockfile"], {
      cwd: reactConsumerRoot,
    });
    run(
      resolve(reactConsumerRoot, "node_modules/.bin/tsc"),
      ["--pretty", "false", "-p", "tsconfig.react.json"],
      { cwd: reactConsumerRoot },
    );
    console.log(`compiler-mode\t${label}\troot-and-empty-react-route`);
  }

  console.log(`packed-consumer\tPASS\t${basename(tarball)}`);
} finally {
  rmSync(workspace, { force: true, recursive: true });
  console.log(`cleanup\t${existsSync(workspace) ? "FAIL" : "PASS"}`);
}
