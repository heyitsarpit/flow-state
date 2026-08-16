import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptRoot, "..");

function readJson(...parts) {
  return JSON.parse(readFileSync(join(root, ...parts), "utf8"));
}

function installedVersion(packageName) {
  return JSON.parse(
    readFileSync(join(root, "node_modules", ...packageName.split("/"), "package.json"), "utf8"),
  ).version;
}

const rootPackage = readJson("package.json");
const flowPackage = readJson("packages", "flow-state", "package.json");
const baseTsconfig = readJson("tsconfig.base.json");
const expected = {
  typescript: rootPackage.devDependencies.typescript,
  nodeTypes: rootPackage.devDependencies["@types/node"],
  effect: flowPackage.devDependencies.effect,
  languageService: rootPackage.devDependencies["@effect/language-service"],
};

const failures = [];
const checkVersion = (label, packageName, expectedVersion) => {
  let actualVersion;
  try {
    actualVersion = installedVersion(packageName);
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
    `@effect/language-service ${expected.languageService}`,
  ].join(" | "),
);
