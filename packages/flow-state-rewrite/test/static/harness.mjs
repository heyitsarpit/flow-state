/* oxlint-disable anti-slop/no-runtime-typeof -- JSON baseline validation is an I/O boundary check. */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const staticRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const packageRoot = resolve(staticRoot, "../..");
const baselinePath = join(staticRoot, "diagnostics-baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

const assertRecord = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
};

const assertNonNegativeNumber = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
};

const assertNonNegativeInteger = (value, label) => {
  assertNonNegativeNumber(value, label);
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
};

assertRecord(baseline, "diagnostics baseline");
if (baseline.typescriptVersion !== "7.0.2") {
  throw new Error("diagnostics baseline must pin TypeScript 7.0.2");
}
if (baseline.fixture !== "medium.ts") {
  throw new Error("diagnostics baseline must identify medium.ts");
}
assertRecord(baseline.baseline, "diagnostics baseline.baseline");
assertRecord(baseline.ceilings, "diagnostics baseline.ceilings");
for (const metric of ["instantiations", "types", "memoryKilobytes"]) {
  assertNonNegativeInteger(baseline.baseline[metric], `baseline.${metric}`);
}
assertNonNegativeNumber(baseline.baseline.totalSeconds, "baseline.totalSeconds");
for (const metric of ["instantiations", "types"]) {
  assertNonNegativeInteger(baseline.ceilings[metric], `ceilings.${metric}`);
  if (baseline.ceilings[metric] < baseline.baseline[metric]) {
    throw new Error(`ceilings.${metric} must not be below baseline.${metric}`);
  }
}

const commonArguments = [
  "tsc",
  "--ignoreConfig",
  "--strict",
  "--exactOptionalPropertyTypes",
  "--noUncheckedIndexedAccess",
  "--module",
  "NodeNext",
  "--moduleResolution",
  "NodeNext",
  "--target",
  "ES2022",
  "--skipLibCheck",
];

const runTsc = (arguments_) =>
  spawnSync("nubx", [...commonArguments, ...arguments_], {
    cwd: packageRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

const outputOf = (result) => `${result.stdout ?? ""}${result.stderr ?? ""}`;

const parseMetric = (output, name) => {
  const match = new RegExp(`^${name}:\\s+([0-9]+)`, "mu").exec(output);
  if (match === null) throw new Error(`missing ${name} in TypeScript diagnostics`);
  return Number(match[1]);
};

const parseSeconds = (output, name) => {
  const match = new RegExp(`^${name}:\\s+([0-9.]+)s`, "mu").exec(output);
  if (match === null) throw new Error(`missing ${name} in TypeScript diagnostics`);
  return Number(match[1]);
};

const normalizePath = (value) => value.replaceAll("\\", "/");

const assertionErasurePattern =
  /\bas\s+(?:any|unknown|const)\b|(?<![A-Za-z0-9_$>])<\s*(?:any|unknown)\s*>(?=\s*[A-Za-z_$([{])/u;
const assertionFixtureLines = readFileSync(
  join(staticRoot, "declaration-erasure.ts.txt"),
  "utf8",
).split(/\r?\n/u);
for (const assertion of ["as unknown", "as const"]) {
  if (!assertionFixtureLines.some((line) => line.includes(assertion))) {
    throw new Error(`assertion fixture is missing ${assertion}`);
  }
  if (!assertionErasurePattern.test(assertion)) {
    throw new Error(`assertion-erasure pattern failed to catch ${assertion}`);
  }
}
if (assertionErasurePattern.test("value as string")) {
  throw new Error("assertion-erasure pattern falsely rejects an ordinary type assertion");
}
for (const assertion of ["<unknown>value", "<any>value"]) {
  if (!assertionErasurePattern.test(assertion)) {
    throw new Error(`assertion-erasure pattern failed to catch ${assertion}`);
  }
}
if (assertionErasurePattern.test("declare const validGeneric: Array<unknown>[];")) {
  throw new Error("assertion-erasure pattern falsely rejects Array<unknown>[]");
}

const temporaryRoots = [];
const makeTemporaryRoot = (prefix) => {
  const root = mkdtempSync(join(packageRoot, `.static-harness-${prefix}`));
  temporaryRoots.push(root);
  return root;
};

const findSourceDeclaration = (sourcePath, typeName) => {
  const sourceLines = readFileSync(sourcePath, "utf8").split(/\r?\n/u);
  const candidates = [typeName, typeName.replace(/_base$/u, "")];
  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const declarationPattern = new RegExp(
      `\\b(?:class|interface|type|const|function)\\s+${escaped}\\b`,
      "u",
    );
    const sourceLine = sourceLines.findIndex((line) => declarationPattern.test(line));
    if (sourceLine !== -1) return sourceLine + 1;
  }
  return undefined;
};

const declarationTypeAt = (lines, lineIndex) => {
  for (let index = lineIndex; index >= 0; index -= 1) {
    const match =
      /(?:declare|export declare)\s+(?:const|class|function|interface|type)\s+([A-Za-z_$][\w$]*)/u.exec(
        lines[index],
      );
    if (match !== null) return match[1];
  }
  return "unclassified declaration member";
};

const parseRecursiveDiagnostics = (output, generatedPath) => {
  const diagnostics = [];
  const diagnosticPattern =
    /^(?<path>.+)\((?<line>\d+),(?<column>\d+)\): error (?<code>TS\d+): (?<message>.+)$/gmu;
  for (const match of output.matchAll(diagnosticPattern)) {
    diagnostics.push({
      path: normalizePath(resolve(match.groups.path)),
      line: Number(match.groups.line),
      column: Number(match.groups.column),
      code: match.groups.code,
      message: match.groups.message,
    });
  }
  const expected = [
    { code: "TS2577", line: 10 },
    { code: "TS2456", line: 13 },
  ];
  const expectedPath = normalizePath(resolve(generatedPath));
  if (diagnostics.length !== expected.length) {
    throw new Error(
      `recursive carrier emitted unexpected diagnostics (expected exactly TS2577/TS2456):\n${output}`,
    );
  }
  for (const expectation of expected) {
    const match = diagnostics.find(
      (diagnostic) =>
        diagnostic.path === expectedPath &&
        diagnostic.code === expectation.code &&
        diagnostic.line === expectation.line,
    );
    if (match === undefined) {
      throw new Error(
        `recursive carrier is missing ${expectation.code} at ${expectedPath}:${expectation.line}:\n${output}`,
      );
    }
  }
  return diagnostics;
};

let report;
let failure;
try {
  const tscVersion = execFileSync("nubx", ["tsc", "--version"], {
    cwd: packageRoot,
    encoding: "utf8",
  })
    .trim()
    .replace(/^Version /u, "");
  if (tscVersion !== baseline.typescriptVersion) {
    throw new Error(
      `TypeScript baseline is for ${baseline.typescriptVersion}; checked-in version is ${tscVersion}`,
    );
  }

  const mediumPath = join(staticRoot, "medium.ts");
  const mediumResult = runTsc(["--noEmit", "--extendedDiagnostics", mediumPath]);
  const mediumOutput = outputOf(mediumResult);
  if (mediumResult.status !== 0) throw new Error(`medium fixture failed:\n${mediumOutput}`);

  const mediumMetrics = {
    instantiations: parseMetric(mediumOutput, "Instantiations"),
    types: parseMetric(mediumOutput, "Types"),
    memoryKilobytes: parseMetric(mediumOutput, "Memory used"),
    totalSeconds: parseSeconds(mediumOutput, "Total time"),
  };
  for (const metric of ["instantiations", "types"]) {
    if (mediumMetrics[metric] > baseline.ceilings[metric]) {
      throw new Error(
        `medium ${metric} ${mediumMetrics[metric]} exceeds checked-in ceiling ${baseline.ceilings[metric]}`,
      );
    }
  }

  const negativeResult = runTsc(["--noEmit", join(staticRoot, "negative.ts")]);
  if (negativeResult.status !== 0) {
    throw new Error(`current-owner negative fixture failed:\n${outputOf(negativeResult)}`);
  }

  const recursiveRoot = makeTemporaryRoot("flow-state-recursive-carrier-");
  const recursiveSource = join(recursiveRoot, "recursive-carrier.ts");
  const sourceDirectory = fileURLToPath(pathToFileURL(join(packageRoot, "src")));
  const sourceSpecifierRoot = `${normalizePath(relative(dirname(recursiveSource), sourceDirectory))}/`;
  writeFileSync(
    recursiveSource,
    readFileSync(join(staticRoot, "recursive-carrier.ts.txt"), "utf8").replaceAll(
      '"../../src/',
      `"${sourceSpecifierRoot}`,
    ),
  );
  const recursiveResult = runTsc(["--noEmit", recursiveSource]);
  const recursiveOutput = outputOf(recursiveResult);
  if (recursiveResult.status === 0) {
    throw new Error("recursive carrier was accepted; expected a finite circularity diagnostic");
  }
  const recursiveDiagnostics = parseRecursiveDiagnostics(recursiveOutput, recursiveSource);

  const declarationRoot = makeTemporaryRoot("flow-state-static-declarations-");
  const declarationEntrySources = [
    "src/definition/definition.ts",
    "src/machine/machine.ts",
    "src/operation/key.ts",
    "src/operation/operation.ts",
    "src/operation/resource.ts",
    "src/operation/transaction.ts",
    "src/operation/stream.ts",
    "src/app/app.ts",
    "src/implementation/implementation.ts",
  ];
  const declarationResult = runTsc([
    "--declaration",
    "--emitDeclarationOnly",
    "--outDir",
    declarationRoot,
    ...declarationEntrySources.map((source) => join(packageRoot, source)),
  ]);
  if (declarationResult.status !== 0) {
    throw new Error(`owner declaration emit failed:\n${outputOf(declarationResult)}`);
  }

  const emittedDeclarationNames = readdirSync(declarationRoot, { recursive: true })
    .map((name) => normalizePath(String(name)))
    .filter((name) => name.endsWith(".d.ts"))
    .sort();
  if (emittedDeclarationNames.length === 0) {
    throw new Error("declaration emit produced no local declarations");
  }

  const declarationIssues = [];
  for (const emittedName of emittedDeclarationNames) {
    const sourceRelative = `src/${emittedName.replace(/\.d\.ts$/u, ".ts")}`;
    const sourcePath = join(packageRoot, sourceRelative);
    if (!existsSync(sourcePath)) {
      declarationIssues.push(`${emittedName}: no originating source for ${sourceRelative}`);
      continue;
    }
    const declarationPath = join(declarationRoot, ...emittedName.split("/"));
    const lines = readFileSync(declarationPath, "utf8").split(/\r?\n/u);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const typeName = declarationTypeAt(lines, lineIndex);
      const sourceLine = findSourceDeclaration(sourcePath, typeName);
      if (/\bany\b/iu.test(line)) {
        declarationIssues.push(
          `${emittedName}:${lineIndex + 1}: erased any; origin=${sourceRelative}:${sourceLine ?? "unknown"}; type=${typeName}; emitted=${line.trim()}`,
        );
      }
      if (assertionErasurePattern.test(line)) {
        declarationIssues.push(
          `${emittedName}:${lineIndex + 1}: assertion-based erasure; origin=${sourceRelative}:${sourceLine ?? "unknown"}; type=${typeName}; emitted=${line.trim()}`,
        );
      }
    }
  }
  if (declarationIssues.length > 0) {
    throw new Error(`all emitted local declaration scan failed:\n${declarationIssues.join("\n")}`);
  }

  report = {
    typescriptVersion: tscVersion,
    baseline: baseline.baseline,
    medium: mediumMetrics,
    ceilings: baseline.ceilings,
    emittedLocalDeclarations: emittedDeclarationNames,
    emittedDeclarationCount: emittedDeclarationNames.length,
    recursiveCarrier: recursiveDiagnostics.map(({ code, line }) => ({ code, line })),
    currentOwnerNegatives: "pass",
    assertionDetectionSelfTest: "as unknown/as const caught",
  };
} catch (error) {
  failure = error;
} finally {
  const cleanupFailures = [];
  for (const root of temporaryRoots) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch (error) {
      cleanupFailures.push(`${root}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const leakedRoots = temporaryRoots.filter((root) => existsSync(root));
  if (cleanupFailures.length > 0 || leakedRoots.length > 0) {
    const cleanupError = new Error(
      `temporary-root cleanup failed; errors=${cleanupFailures.join(" | ") || "none"}; leaks=${leakedRoots.join(", ") || "none"}`,
    );
    failure =
      failure === undefined
        ? cleanupError
        : new AggregateError([failure, cleanupError], "static harness failed during cleanup");
  }
}

if (failure !== undefined) throw failure;
console.log(
  JSON.stringify(
    {
      ...report,
      temporaryRootCount: temporaryRoots.length,
      temporaryRootsCleaned: true,
    },
    null,
    2,
  ),
);
