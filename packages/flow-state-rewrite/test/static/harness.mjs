import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { API } from "typescript/unstable/sync";
import { SyntaxKind } from "typescript/unstable/ast";

/*
 * Static proofs:
 *
 * Pinned compiler invocation
 *
 * Representative fixture compilation
 *
 * Negative and recursive controls
 *
 * Declaration AST audit
 *
 * Assembly:
 *   run proof groups, collect report
 *
 * Finalization:
 *   clean temporary roots, preserve failures, print report
 */

const staticRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const packageRoot = resolve(staticRoot, "../..");
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

const normalizePath = (value) => value.replaceAll("\\", "/");

const temporaryRoots = [];
const makeTemporaryRoot = (prefix) => {
  const root = mkdtempSync(join(packageRoot, `.static-harness-${prefix}`));
  temporaryRoots.push(root);
  return root;
};

const parseDiagnostics = (output) => {
  const diagnostics = [];
  const diagnosticPattern = /error (?<code>TS\d+): (?<message>.+)$/gmu;
  for (const match of output.matchAll(diagnosticPattern)) {
    diagnostics.push({
      code: match.groups.code,
      message: match.groups.message,
    });
  }
  return diagnostics;
};

const parseRecursiveDiagnostics = (output, generatedPath) => {
  const diagnostics = [];
  const diagnosticPattern =
    /^(?<path>.+)\((?<line>\d+),(?<column>\d+)\): error (?<code>TS\d+): (?<message>.+)$/gmu;
  for (const match of output.matchAll(diagnosticPattern)) {
    diagnostics.push({
      path: normalizePath(resolve(packageRoot, match.groups.path)),
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
  const expectedPath = normalizePath(resolve(packageRoot, generatedPath));
  if (diagnostics.some(({ code }) => code === "TS2589")) {
    throw new Error(`recursive carrier emitted an excessive-instantiation diagnostic:\n${output}`);
  }
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

const verifyPinnedCompiler = () => {
  const tscVersion = execFileSync("nubx", ["tsc", "--version"], {
    cwd: packageRoot,
    encoding: "utf8",
  })
    .trim()
    .replace(/^Version /u, "");
  if (tscVersion !== "7.0.2") {
    throw new Error(`Static correctness proofs require TypeScript 7.0.2; found ${tscVersion}`);
  }
  return tscVersion;
};

const compileMediumFixture = () => {
  const result = runTsc(["--noEmit", "test/static/medium.ts"]);
  const output = outputOf(result);
  if (result.status !== 0 || /error TS\d+:/u.test(output)) {
    throw new Error(`medium fixture failed:\n${output}`);
  }
  return { fixture: "medium.ts", status: "pass" };
};

const assertCircularityDiagnostics = (result) => {
  if (result.status === 0) {
    throw new Error("circularity control was accepted; expected a circularity diagnostic");
  }
  const diagnostics = parseDiagnostics(outputOf(result));
  const circularityDiagnostics = diagnostics.filter(({ message }) => /circular/iu.test(message));
  if (circularityDiagnostics.length === 0) {
    throw new Error(`circularity control emitted no circularity diagnostic:\n${outputOf(result)}`);
  }
  if (diagnostics.some(({ code }) => code === "TS2589")) {
    throw new Error(
      `circularity control emitted an excessive-instantiation diagnostic:\n${outputOf(result)}`,
    );
  }
};

const assertControlRejectsMissingCircularity = (result) => {
  let failure;
  try {
    assertCircularityDiagnostics(result);
  } catch (error) {
    failure = error;
  }
  if (!(failure instanceof Error)) {
    throw new Error("nonrecursive control did not fail with an Error");
  }
  if (result.status === 0) {
    if (failure.message !== "circularity control was accepted; expected a circularity diagnostic") {
      throw failure;
    }
    return;
  }
  const diagnostics = parseDiagnostics(outputOf(result));
  if (diagnostics.length === 0) {
    throw new Error(`nonrecursive control emitted no diagnostics:\n${outputOf(result)}`);
  }
  if (diagnostics.some(({ message }) => /circular/iu.test(message))) {
    throw new Error(`nonrecursive control unexpectedly emitted circularity:\n${outputOf(result)}`);
  }
  if (diagnostics.some(({ code }) => code === "TS2589")) {
    throw new Error(`nonrecursive control emitted TS2589:\n${outputOf(result)}`);
  }
  if (!failure.message.startsWith("circularity control emitted no circularity diagnostic:")) {
    throw failure;
  }
};

const verifyNegativeFixtures = () => {
  const result = runTsc(["--noEmit", join(staticRoot, "negative.ts")]);
  if (result.status !== 0) {
    throw new Error(`current-owner negative fixture failed:\n${outputOf(result)}`);
  }
  assertControlRejectsMissingCircularity(result);
  return { fixture: "negative.ts", status: "pass" };
};

const assertNonrecursiveCircularityControl = () => {
  const root = makeTemporaryRoot("flow-state-nonrecursive-circularity-");
  const source = join(root, "nonrecursive-control.ts");
  writeFileSync(
    source,
    'type NonrecursiveCarrier = string;\nconst mismatch: number = "not-a-number";\n',
  );
  assertControlRejectsMissingCircularity(runTsc(["--noEmit", source]));
};

const verifyRecursiveCarrier = () => {
  assertNonrecursiveCircularityControl();
  const root = makeTemporaryRoot("flow-state-recursive-carrier-");
  const source = join(root, "recursive-carrier.ts");
  const sourceDirectory = fileURLToPath(pathToFileURL(join(packageRoot, "src")));
  const sourceSpecifierRoot = `${normalizePath(relative(dirname(source), sourceDirectory))}/`;
  const recursiveFixture = readFileSync(
    join(staticRoot, "recursive-carrier.ts.txt"),
    "utf8",
  ).replaceAll('"../../src/', `"${sourceSpecifierRoot}`);
  writeFileSync(source, recursiveFixture);
  const result = runTsc(["--noEmit", source]);
  if (result.status === 0) {
    throw new Error("recursive carrier was accepted; expected a finite circularity diagnostic");
  }
  parseRecursiveDiagnostics(outputOf(result), source);
  return { fixture: "recursive-carrier.ts", status: "pass" };
};

const verifyDeferredExports = () => {
  const root = makeTemporaryRoot("flow-state-deferred-exports-");
  const routeSource = join(root, "route.ts");
  const consumerSource = join(root, "consumer.ts");
  const consumer = `import type * as Route from "./route.js";

// @ts-expect-error The deferred type is absent from the route.
export type _DeferredType = Route.DeferredType;
// @ts-expect-error The deferred value is absent from the route.
  export type _DeferredValue = typeof Route.deferredValue;
`;

  writeFileSync(routeSource, "");
  writeFileSync(consumerSource, consumer);
  const omittedResult = runTsc(["--noEmit", consumerSource]);
  if (omittedResult.status !== 0) {
    throw new Error(`deferred export omission control failed:\n${outputOf(omittedResult)}`);
  }

  writeFileSync(
    routeSource,
    'export type DeferredType = string;\nexport const deferredValue = "restored";\n',
  );
  const restoredResult = runTsc(["--noEmit", consumerSource]);
  if (restoredResult.status === 0) {
    throw new Error("deferred export restoration control was accepted; expected unused directives");
  }
  const restoredDiagnostics = parseDiagnostics(outputOf(restoredResult));
  if (
    restoredDiagnostics.length !== 2 ||
    !restoredDiagnostics.every(({ code }) => code === "TS2578")
  ) {
    throw new Error(
      `deferred export restoration control did not report both unused directives:\n${outputOf(restoredResult)}`,
    );
  }
  return { status: "pass" };
};

const assertionErasurePattern =
  /\bas\s+(?:any|unknown|const)\b|(?<![A-Za-z0-9_$>])<\s*(?:any|unknown)\s*>(?=\s*[A-Za-z_$([{])/u;

const verifyAssertionErasureControls = () => {
  const assertionFixtureLines = readFileSync(
    join(staticRoot, "declaration-erasure.ts.txt"),
    "utf8",
  ).split(/\r?\n/u);
  for (const assertion of ["as unknown", "as const", "as any", "<unknown>value"]) {
    if (!assertionFixtureLines.some((line) => line.includes(assertion))) {
      throw new Error(`assertion fixture is missing ${assertion}`);
    }
    if (!assertionErasurePattern.test(assertion)) {
      throw new Error(`assertion-erasure pattern failed to catch ${assertion}`);
    }
  }
  if (!assertionErasurePattern.test("<any>value")) {
    throw new Error("assertion-erasure pattern failed to catch <any>value");
  }
  if (assertionErasurePattern.test("value as string")) {
    throw new Error("assertion-erasure pattern falsely rejects an ordinary type assertion");
  }
  if (assertionErasurePattern.test("declare const validGeneric: Array<unknown>[];")) {
    throw new Error("assertion-erasure pattern falsely rejects Array<unknown>[]");
  }
  return "pass";
};

const scanDeclarationForAnyKeywords = (snapshot, file) => {
  const source = snapshot.getDefaultProjectForFile(file)?.program.getSourceFile(file);
  if (source === undefined) throw new Error(`Missing declaration AST: ${file}`);
  const issues = [];
  const visit = (node) => {
    if (node.kind === SyntaxKind.AnyKeyword) {
      issues.push(`${file}:${node.pos}: erased any type`);
    }
    node.forEachChild(visit);
  };
  visit(source);
  return issues;
};

const scanDeclarationForAssertionErasure = (file) => {
  const issues = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/u);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (assertionErasurePattern.test(line)) {
      issues.push(`${file}:${lineIndex + 1}: assertion-based erasure: ${line.trim()}`);
    }
  }
  return issues;
};

const verifyEmittedDeclarations = () => {
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
    "src/runtime/actor-ref.ts",
    "src/runtime/runtime.ts",
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
  const declarationFiles = [];
  const declarationOrigins = new Map();
  for (const emittedName of emittedDeclarationNames) {
    const sourceRelative = `src/${emittedName.replace(/\.d\.ts$/u, ".ts")}`;
    const sourcePath = join(packageRoot, sourceRelative);
    if (!existsSync(sourcePath)) {
      declarationIssues.push(`${emittedName}: no originating source for ${sourceRelative}`);
      continue;
    }
    const declarationPath = join(declarationRoot, ...emittedName.split("/"));
    declarationFiles.push(declarationPath);
    declarationOrigins.set(declarationPath, { emittedName, sourceRelative });
  }

  const safeControlFile = join(declarationRoot, "__declaration-any-safe.d.ts");
  const erasedControlFile = join(declarationRoot, "__declaration-any-erased.d.ts");
  writeFileSync(safeControlFile, '/* any */\ntype Word = "any";\n');
  writeFileSync(erasedControlFile, "type Erased = any;\n");

  const api = new API({ cwd: packageRoot });
  let snapshot;
  try {
    snapshot = api.updateSnapshot({
      openFiles: [...declarationFiles, safeControlFile, erasedControlFile],
    });
    for (const declarationFile of declarationFiles) {
      const origin = declarationOrigins.get(declarationFile);
      const issues = scanDeclarationForAnyKeywords(snapshot, declarationFile);
      for (const issue of issues) {
        declarationIssues.push(`${issue}; origin=${origin.sourceRelative}`);
      }
      const assertionIssues = scanDeclarationForAssertionErasure(declarationFile);
      for (const issue of assertionIssues) {
        declarationIssues.push(`${issue}; origin=${origin.sourceRelative}`);
      }
    }
    const safeControlIssues = scanDeclarationForAnyKeywords(snapshot, safeControlFile);
    if (safeControlIssues.length > 0) {
      throw new Error(
        `declaration any scanner rejected safe control:\n${safeControlIssues.join("\n")}`,
      );
    }
    const erasedControlIssues = scanDeclarationForAnyKeywords(snapshot, erasedControlFile);
    if (erasedControlIssues.length === 0) {
      throw new Error("declaration any scanner accepted erased-any control");
    }
  } finally {
    try {
      snapshot?.dispose();
    } finally {
      api.close();
    }
  }
  if (declarationIssues.length > 0) {
    throw new Error(`all emitted local declaration scan failed:\n${declarationIssues.join("\n")}`);
  }
  return { emittedDeclarationNames, status: "pass" };
};

const makeReport = ({
  compilerVersion,
  medium,
  negative,
  recursive,
  deferredExports,
  assertionErasure,
  declarations,
}) => ({
  typescriptVersion: compilerVersion,
  medium: medium.status,
  currentOwnerNegatives: negative.status,
  recursiveCarrier: recursive.status,
  deferredExports: deferredExports.status,
  assertionDetectionSelfTest: assertionErasure,
  emittedLocalDeclarations: declarations.emittedDeclarationNames,
  emittedDeclarationCount: declarations.emittedDeclarationNames.length,
  temporaryRootCount: temporaryRoots.length,
  temporaryRootsCleaned: true,
});

const cleanupTemporaryRoots = () => {
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
    return new Error(
      `temporary-root cleanup failed; errors=${cleanupFailures.join(" | ") || "none"}; leaks=${leakedRoots.join(", ") || "none"}`,
    );
  }
};

let failure;
let report;
try {
  const compilerVersion = verifyPinnedCompiler();
  const medium = compileMediumFixture();
  const negative = verifyNegativeFixtures();
  const recursive = verifyRecursiveCarrier();
  const deferredExports = verifyDeferredExports();
  const assertionErasure = verifyAssertionErasureControls();
  const declarations = verifyEmittedDeclarations();
  report = makeReport({
    compilerVersion,
    medium,
    negative,
    recursive,
    deferredExports,
    assertionErasure,
    declarations,
  });
} catch (error) {
  failure = error;
} finally {
  const cleanupFailure = cleanupTemporaryRoots();
  if (cleanupFailure !== undefined) {
    failure =
      failure === undefined
        ? cleanupFailure
        : new AggregateError([failure, cleanupFailure], "static harness failed during cleanup");
  }
}

if (failure !== undefined) throw failure;
console.log(JSON.stringify(report, null, 2));
