import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptRoot, "..");

function readJson(...parts) {
  return JSON.parse(readFileSync(join(root, ...parts), "utf8"));
}

function installedVersion(packageName, owner = root) {
  const require = createRequire(join(owner, "package.json"));
  return JSON.parse(readFileSync(require.resolve(`${packageName}/package.json`), "utf8")).version;
}

const rootPackage = readJson("package.json");
const flowPackage = readJson("packages", "flow-state", "package.json");
const rewritePackage = readJson("packages", "flow-state-rewrite", "package.json");
const flowRoot = join(root, "packages", "flow-state");
const rewriteRoot = join(root, "packages", "flow-state-rewrite");
const rootRequire = createRequire(join(root, "package.json"));
const baseTsconfig = readJson("tsconfig.base.json");
const expected = {
  typescript: rootPackage.devDependencies.typescript,
  nodeTypes: rootPackage.devDependencies["@types/node"],
  effect: rootPackage.devDependencies.effect,
  legacyEffect: flowPackage.devDependencies.effect,
  rewriteEffect: rewritePackage.dependencies.effect,
  languageService: rootPackage.devDependencies["@effect/language-service"],
};

const failures = [];
const checkVersion = (label, packageName, expectedVersion, owner = root) => {
  let actualVersion;
  try {
    actualVersion = installedVersion(packageName, owner);
  } catch {
    failures.push(`${label} is not installed: ${packageName}`);
    return;
  }
  if (actualVersion !== expectedVersion) {
    failures.push(`${label} is ${actualVersion}; package.json requires ${expectedVersion}`);
  }
};

if (rootPackage.packageManager !== "nub@0.7.5") {
  failures.push(`packageManager must be nub@0.7.5, found ${rootPackage.packageManager}`);
}
if (rootPackage.engines.node !== ">=22.18.0") {
  failures.push(`Node engine must remain >=22.18.0, found ${rootPackage.engines.node}`);
}

checkVersion("TypeScript", "typescript", expected.typescript);
checkVersion("Node types", "@types/node", expected.nodeTypes);
checkVersion("Effect", "effect", expected.effect);
checkVersion("Frozen package Effect", "effect", expected.legacyEffect, flowRoot);
checkVersion("Rewrite Effect", "effect", expected.rewriteEffect, rewriteRoot);
checkVersion(
  "Frozen Node platform",
  "@effect/platform-node",
  flowPackage.dependencies["@effect/platform-node"],
  flowRoot,
);
checkVersion(
  "Rewrite test adapter",
  "@effect/vitest",
  rewritePackage.devDependencies["@effect/vitest"],
  rewriteRoot,
);
for (const packageName of ["@effect/platform-node", "@effect/platform-node-shared"]) {
  const owner = dirname(rootRequire.resolve(`${packageName}/package.json`));
  checkVersion(`${packageName} Effect`, "effect", expected.legacyEffect, owner);
}
checkVersion(
  "Frozen shared Node platform",
  "@effect/platform-node-shared",
  flowPackage.dependencies["@effect/platform-node"],
  flowRoot,
);
const vitePlusRequire = createRequire(rootRequire.resolve("vite-plus/package.json"));
const effectVitestRequire = createRequire(rootRequire.resolve("@effect/vitest/package.json"));
if (
  vitePlusRequire.resolve("vitest/package.json") !==
  effectVitestRequire.resolve("vitest/package.json")
) {
  failures.push("Vite Plus and @effect/vitest must resolve the same Vitest instance");
}
if (expected.rewriteEffect !== expected.effect) {
  failures.push("Workspace and rewrite must use the same Effect version");
}
checkVersion("Effect language service", "@effect/language-service", expected.languageService);

const plugins = baseTsconfig.compilerOptions?.plugins ?? [];
const effectLanguageService = plugins.find((plugin) => plugin?.name === "@effect/language-service");
if (effectLanguageService?.transform !== "@effect/language-service/transform") {
  failures.push("tsconfig.base.json must configure the Effect language-service transform");
}

const sourcePackagePath = join(
  root,
  "codebases",
  "effect-v4",
  "packages",
  "effect",
  "package.json",
);
try {
  const sourceVersion = JSON.parse(readFileSync(sourcePackagePath, "utf8")).version;
  if (sourceVersion !== expected.effect) {
    console.warn(
      `Effect source mirror is ${sourceVersion}; installed workspace runtime is ${expected.effect}. ` +
        "Treat the installed package as runtime authority until the mirror is intentionally aligned.",
    );
  }
} catch {
  console.warn(
    "Effect source mirror not found at codebases/effect-v4; installed package remains runtime authority.",
  );
}

if (failures.length > 0) {
  throw new Error(
    ["Toolchain check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"),
  );
}

console.log(
  [
    `nub ${rootPackage.packageManager.slice("nub@".length)}`,
    `TypeScript ${expected.typescript}`,
    `@types/node ${expected.nodeTypes}`,
    `Effect ${expected.effect}`,
    `frozen Effect ${expected.legacyEffect}`,
    `@effect/language-service ${expected.languageService}`,
  ].join(" | "),
);
