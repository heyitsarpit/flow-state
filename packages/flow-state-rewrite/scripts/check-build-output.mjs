import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const manifestPath = resolve(packageRoot, "package.json");
const buildScript = resolve(scriptDir, "build.mjs");
const distRoot = resolve(packageRoot, "dist");

const expectedSurface = new Map([
  [
    ".",
    {
      basename: "index",
      runtimeExports: [
        "Diagnostic",
        "Implementation",
        "actorRef",
        "app",
        "definition",
        "machine",
        "module",
        "resource",
        "runtimeSetup",
        "stream",
        "transaction",
      ],
    },
  ],
  ["./react", { basename: "react-entry", runtimeExports: [] }],
  ["./testing", { basename: "testing", runtimeExports: [] }],
  ["./inspect", { basename: "inspect", runtimeExports: [] }],
]);
const expectedManifestExportKeys = [".", "./inspect", "./package.json", "./react", "./testing"];

const fail = (message) => {
  throw new Error(message);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const hashFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const relativePath = (path) => relative(packageRoot, path).replaceAll("\\", "/");

const targetPath = (target) => {
  assert(
    target?.startsWith?.("./") === true,
    `export target must be package-relative: ${String(target)}`,
  );
  const path = resolve(packageRoot, target);
  assert(
    path === packageRoot || path.startsWith(`${packageRoot}/`),
    `export target escapes package: ${target}`,
  );
  return path;
};

const exportTargets = (manifest) => {
  const targets = [];

  for (const [route, value] of Object.entries(manifest.exports)) {
    const conditional =
      value !== null &&
      value !== undefined &&
      (Object.hasOwn(value, "import") || Object.hasOwn(value, "types"));
    if (!conditional) {
      targets.push({ kind: "asset", route, path: targetPath(value) });
      continue;
    }

    for (const kind of ["import", "types"]) {
      const target = value[kind];
      if (target !== undefined) {
        targets.push({ kind, route, path: targetPath(target) });
      }
    }
  }

  return targets;
};

const assertManifestSurface = (manifest, targets) => {
  const actualExportKeys = Object.keys(manifest.exports).sort((left, right) =>
    left.localeCompare(right),
  );
  assert(
    actualExportKeys.length === expectedManifestExportKeys.length &&
      actualExportKeys.every((key, index) => key === expectedManifestExportKeys[index]),
    `public export keys differ: ${actualExportKeys.join(",")}`,
  );

  const artifactTargets = targets.filter(({ kind }) => kind !== "asset");
  assert(
    artifactTargets.length === 8,
    `expected 8 runtime/type targets, got ${artifactTargets.length}`,
  );
  for (const [route, expected] of expectedSurface) {
    const routeValue = manifest.exports[route];
    assert(
      routeValue !== null &&
        routeValue !== undefined &&
        Object.hasOwn(routeValue, "import") &&
        Object.hasOwn(routeValue, "types"),
      `route ${route} must define import and types targets`,
    );

    const routeTargets = artifactTargets.filter((target) => target.route === route);
    assert(routeTargets.length === 2, `route ${route} must have exactly 2 targets`);
    for (const kind of ["import", "types"]) {
      const matchingTargets = routeTargets.filter((target) => target.kind === kind);
      assert(matchingTargets.length === 1, `route ${route} must have exactly one ${kind} target`);
      const suffix = kind === "import" ? ".mjs" : ".d.mts";
      const expectedPath = resolve(distRoot, `${expected.basename}${suffix}`);
      assert(
        matchingTargets[0].path === expectedPath,
        `${route} ${kind} target must be ${relativePath(expectedPath)}`,
      );
    }
  }

  const assetTargets = targets.filter(({ kind }) => kind === "asset");
  assert(
    assetTargets.length === 1 &&
      assetTargets[0].route === "./package.json" &&
      assetTargets[0].path === manifestPath,
    "package.json must remain the only non-code export",
  );
};

const assertTargetFiles = (targets) => {
  for (const target of targets) {
    assert(existsSync(target.path), `missing ${target.kind} target: ${relativePath(target.path)}`);
    assert(
      statSync(target.path).isFile(),
      `export target is not a file: ${relativePath(target.path)}`,
    );
    if (target.kind === "import") {
      assert(
        target.path.endsWith(".mjs"),
        `runtime target must be .mjs: ${relativePath(target.path)}`,
      );
    }
    if (target.kind === "types") {
      assert(
        target.path.endsWith(".d.mts"),
        `type target must be .d.mts: ${relativePath(target.path)}`,
      );
    }
  }
};

const declarationSpecifiers = (declaration) => {
  const specifiers = [];
  const pattern = /(?:from\s+|import\(\s*)["']([^"']+)["']/g;
  for (const match of declaration.matchAll(pattern)) {
    specifiers.push(match[1]);
  }
  return specifiers;
};

const assertDeclarationReferences = (targets) => {
  for (const target of targets.filter(({ kind }) => kind === "types")) {
    const declaration = readFileSync(target.path, "utf8");
    assert(
      !declaration.includes(`${packageRoot}/`),
      `${relativePath(target.path)} references the package filesystem`,
    );
    assert(
      !/(?:^|["'/(])(?:\.\.?\/)*src\//u.test(declaration),
      `${relativePath(target.path)} references repo source`,
    );
    assert(
      !/\bflow-state-rewrite\/src(?:\/|$)/u.test(declaration),
      `${relativePath(target.path)} references a private source alias`,
    );

    for (const specifier of declarationSpecifiers(declaration)) {
      assert(
        !specifier.includes("/src/"),
        `${relativePath(target.path)} references source specifier ${specifier}`,
      );
      if (!specifier.endsWith(".js") && !specifier.endsWith(".d.ts")) continue;
      if (!specifier.startsWith(".")) continue;
      const referenced = resolve(dirname(target.path), specifier);
      assert(
        existsSync(referenced),
        `${relativePath(target.path)} references nonexistent ${specifier}`,
      );
    }
  }
};

const runtimeTargets = (targets) => targets.filter(({ kind }) => kind === "import");

const inventory = (targets) =>
  targets
    .filter(({ kind }) => kind !== "asset")
    .map(({ kind, route, path }) => `${kind}\t${route}\t${relativePath(path)}\t${hashFile(path)}`)
    .sort((left, right) => left.localeCompare(right));

const importRuntimeTargets = async (targets) => {
  const imported = [];
  for (const target of targets) {
    const module = await import(pathToFileURL(target.path).href);
    const keys = Object.keys(module).sort((left, right) => left.localeCompare(right));
    const expected = expectedSurface.get(target.route);
    assert(expected !== undefined, `unexpected runtime route: ${target.route}`);
    const expectedExports = [...expected.runtimeExports].sort((left, right) =>
      left.localeCompare(right),
    );
    assert(
      keys.length === expectedExports.length &&
        keys.every((key, index) => key === expectedExports[index]),
      `${target.route} runtime exports differ: ${keys.join(",")}`,
    );
    imported.push({ keys, target });
    console.log(`smoke-import\t${target.route}\t${relativePath(target.path)}\t${keys.join(",")}`);
  }
  for (const { keys, target } of imported) {
    if (keys.length === 0) continue;
    const runtime = readFileSync(target.path, "utf8");
    assert(
      /(?:from|import)\s*["']effect(?:\/|["'])/u.test(runtime),
      `${relativePath(target.path)} must externalize Effect`,
    );
    assert(
      !runtime.includes("node_modules/effect"),
      `${relativePath(target.path)} bundles an Effect path`,
    );
  }

  const rootRuntime = readFileSync(resolve(distRoot, "index.mjs"), "utf8");
  const effectImports = rootRuntime.match(/(?:from|import)\s*["']effect(?:\/|["'])/gu) ?? [];
  assert(
    effectImports.length === 1,
    `expected one external Effect import, got ${effectImports.length}`,
  );
  for (const owner of ["Diagnostic", "Implementation"]) {
    const ownerDefinitions = rootRuntime.match(new RegExp(`\\bconst ${owner} =`, "gu")) ?? [];
    assert(
      ownerDefinitions.length === 1,
      `expected one emitted ${owner} owner, got ${ownerDefinitions.length}`,
    );
  }
};

const assertGeneratedOutput = (targets) => {
  const actual = readdirSync(distRoot, { recursive: true })
    .filter((path) => path.endsWith(".mjs") || path.endsWith(".d.mts"))
    .map((path) => relativePath(resolve(distRoot, path)))
    .sort((left, right) => left.localeCompare(right));
  const expected = targets
    .filter(({ kind }) => kind !== "asset")
    .map(({ path }) => relativePath(path))
    .sort((left, right) => left.localeCompare(right));
  assert(
    actual.length === expected.length && actual.every((path, index) => path === expected[index]),
    `generated runtime/type inventory differs: ${actual.join(",")}`,
  );
};

const runBuild = () => {
  execFileSync(process.execPath, [buildScript], { cwd: packageRoot, stdio: "inherit" });
};

runBuild();
const manifest = readJson(manifestPath);
const targets = exportTargets(manifest);
assertManifestSurface(manifest, targets);
assertTargetFiles(targets);
assertGeneratedOutput(targets);
assertDeclarationReferences(targets);
await importRuntimeTargets(runtimeTargets(targets));

for (const target of targets) {
  console.log(
    `hash\t${target.kind}\t${target.route}\t${relativePath(target.path)}\t${hashFile(target.path)}`,
  );
}
const sourceEntrypoints = new Set();
for (const target of targets) {
  if (target.kind === "asset") continue;
  const sourceName = relativePath(target.path)
    .replace(/^dist\//u, "src/")
    .replace(/\.d\.mts$|\.mjs$/u, ".ts");
  sourceEntrypoints.add(sourceName);
}
for (const sourceName of [...sourceEntrypoints].sort((left, right) => left.localeCompare(right))) {
  const sourcePath = resolve(packageRoot, sourceName);
  assert(existsSync(sourcePath), `missing source entrypoint: ${sourceName}`);
  console.log(`source-hash\t${sourceName}\t${hashFile(sourcePath)}`);
}

const firstInventory = inventory(targets);
runBuild();
assertManifestSurface(manifest, targets);
assertTargetFiles(targets);
assertGeneratedOutput(targets);
assertDeclarationReferences(targets);
const secondInventory = inventory(targets);
assert(
  firstInventory.length === secondInventory.length &&
    firstInventory.every((entry, index) => entry === secondInventory[index]),
  `repeated build export inventory differs:\n${firstInventory.join("\n")}\n---\n${secondInventory.join("\n")}`,
);
console.log(`deterministic-inventory\t${secondInventory.length} targets`);
