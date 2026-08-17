import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { Schema } from "../../../../packages/flow-state/node_modules/effect/dist/index.js";
import {
  BehaviorArtifactSchema,
  CauseProjection,
  CliCommands,
  CliErrorSchema,
  CliSuccessSchema,
  DiagnosticCodes,
  RuntimeBootSchema,
  TraceArtifactSchema,
} from "./contract-fixtures.ts";

const directory = import.meta.dirname;
const root = resolve(directory, "../../../..");
const contractsDirectory = resolve(directory, "../contracts");

function fail(message: string): never {
  throw new Error(message);
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(resolve(directory, path), "utf8"));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalBytes(value: any): string {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

const inventory = readJson("export-inventory.json");
const currentInventory = JSON.parse(
  execFileSync(process.execPath, [resolve(directory, "inventory-exports.mjs")], {
    cwd: root,
    env: { ...process.env, FLOW_STATE_BASELINE_HEAD: inventory.head },
    encoding: "utf8",
  }),
);
assert(
  JSON.stringify(currentInventory) === JSON.stringify(inventory),
  "live export inventory drifted",
);

const dispositions = readJson("export-dispositions.json");
const expectedPackageKeys = Object.entries(inventory.routes).flatMap(([route, exports]: any) => [
  ...exports.values.map((name: string) => `${route}:value:${name}`),
  ...exports.types.map((name: string) => `${route}:type:${name}`),
]);
const actualPackageKeys = dispositions.packageRoutes.map(
  (row: any) => `${row.route}:${row.kind}:${row.name}`,
);
assert(
  new Set(actualPackageKeys).size === actualPackageKeys.length,
  "duplicate package export disposition",
);
assert(
  expectedPackageKeys.length === actualPackageKeys.length &&
    expectedPackageKeys.every((key: string) => actualPackageKeys.includes(key)),
  "a package export lacks exactly one disposition",
);
assert(
  dispositions.packageRoutes.every((row: any) =>
    ["keep", "change", "delete"].includes(row.disposition),
  ),
  "invalid package export disposition",
);

const expectedCliKeys = Object.entries(inventory.cliModules).flatMap(([file, exports]: any) => [
  ...exports.values.map((name: string) => `${file}:value:${name}`),
  ...exports.types.map((name: string) => `${file}:type:${name}`),
]);
const actualCliKeys = dispositions.cliModules.map(
  (row: any) => `${row.file}:${row.kind}:${row.name}`,
);
assert(
  new Set(actualCliKeys).size === actualCliKeys.length,
  "duplicate CLI module export disposition",
);
assert(
  expectedCliKeys.length === actualCliKeys.length &&
    expectedCliKeys.every((key: string) => actualCliKeys.includes(key)),
  "a CLI module export lacks exactly one disposition",
);

const issueIndex = readJson("issue-deletion-index.json");
const expectedIssues = [
  "I1",
  "I2",
  "I3",
  "I4",
  "I5.resource",
  "I5.react",
  "I6",
  "I7",
  "I8",
  "I9",
  "I10.runtime",
  "I10.model",
  "I11",
  "I12",
  "I13",
  "I14",
  "I15",
  "I16",
  "I17",
  "I18",
];
assert(
  JSON.stringify(issueIndex.issues.map((row: any) => row.issueId)) ===
    JSON.stringify(expectedIssues),
  "confirmed issue ownership is not the exact 20-row atomic set",
);
assert(
  issueIndex.issues.every(
    (row: any) =>
      Number.isInteger(row.owningPhase) && row.proofIds.length > 0 && row.liveEvidence.length > 0,
  ),
  "an issue lacks one phase, proof family, or live evidence",
);
assert(
  new Set(issueIndex.deletions.map((row: any) => row.deletionId)).size ===
    issueIndex.deletions.length &&
    issueIndex.deletions.every((row: any) => Number.isInteger(row.closingPhase)),
  "deletion rows are duplicate or ownerless",
);
assert(
  issueIndex.blockerResolutions.length === 24 &&
    issueIndex.blockerResolutions.every(
      (row: any) => row.contractIds.length > 0 && row.proofIds.length > 0,
    ),
  "B1-B12/Q1-Q12 resolution crosswalk is incomplete",
);

const proofIndex = readJson("proof-index.json");
const proofCases = proofIndex.proofCases;
const contractIds = new Set(
  readdirSync(contractsDirectory)
    .filter((name) => name.endsWith(".md"))
    .flatMap((name) =>
      readFileSync(resolve(contractsDirectory, name), "utf8")
        .split("\n")
        .flatMap((line) => {
          const match =
            /^#{2,4} ((?:GLO|API|TYPE|SEM|SNAP|ARCH|WIRE|HOST|TEST|CLI|CUT|PROOF|APP)-[^\s—:]+)/u.exec(
              line,
            );
          return match?.[1] === undefined ? [] : [match[1].replace(/\.$/u, "")];
        }),
    ),
);
const assertKnownContractIds = (ids: readonly string[], owner: string): void => {
  for (const id of ids) assert(contractIds.has(id), `${owner} references unknown contract ${id}`);
};
assert(
  new Set(proofCases.map((row: any) => row.caseId)).size === proofCases.length,
  "duplicate proof case",
);
for (let number = 1; number <= 17; number += 1) {
  const id = `PROOF-${String(number).padStart(3, "0")}`;
  assert(
    proofCases.some((row: any) => row.centralProofIds.includes(id)),
    `${id} has no atomic case`,
  );
}
assert(
  proofCases.every(
    (row: any) =>
      Number.isInteger(row.closingPhase) &&
      row.centralProofIds.length === 1 &&
      row.contractIds.length > 0 &&
      ["existing", "replacement", "missing"].includes(row.currentDisposition) &&
      row.targetTests.length > 0,
  ),
  "an atomic proof case lacks one owner, contract, disposition, or target",
);
for (const row of proofCases) assertKnownContractIds(row.contractIds, row.caseId);
for (const row of proofCases)
  if (row.currentDisposition !== "missing")
    for (const path of row.currentTests)
      assert(
        existsSync(resolve(root, path)),
        `${row.caseId} current proof owner does not exist: ${path}`,
      );
assert(
  proofCases
    .filter((row: any) => row.closingPhase === 0)
    .map((row: any) => row.caseId)
    .join(",") === "PROOF-014.01,PROOF-014.02",
  "Phase 0 may close only reviewed Schema/golden proof cases",
);

const expectedLocal = [
  "API-P01",
  "API-P02",
  "API-P03",
  "TYPE-P01",
  "TYPE-P02",
  "TYPE-P03",
  "TYPE-P04",
  "SNAP-P01",
  "HOST-P01",
  "HOST-P02",
  "HOST-P03",
  "HOST-P04",
  "HOST-P05",
  "CUT-P01",
  "CUT-P02",
  "CUT-P03",
  "CUT-P04",
  "CUT-P05",
  "CUT-P06",
];
for (const id of expectedLocal) {
  assert(
    proofIndex.localProofCases.some((row: any) => row.localProofId === id),
    `${id} fell through`,
  );
}
assert(
  new Set(proofIndex.localProofCases.map((row: any) => row.caseId)).size ===
    proofIndex.localProofCases.length &&
    proofIndex.localProofCases.every(
      (row: any) =>
        Number.isInteger(row.closingPhase) &&
        row.centralProofIds.length > 0 &&
        row.contractIds.length > 0,
    ),
  "local proof cases are duplicate or incomplete",
);
for (const row of proofIndex.localProofCases) assertKnownContractIds(row.contractIds, row.caseId);
for (const row of issueIndex.blockerResolutions)
  assertKnownContractIds(row.contractIds, row.blockerId);

const architecture = readJson("architecture-evidence.json");
assert(architecture.tests.length === 19, "source-text/filename architecture inventory drifted");
assert(
  architecture.tests.every(
    (row: any) =>
      row.classification === "cannot-close-behavior" &&
      row.proofIds.length > 0 &&
      Number.isInteger(row.replacementPhase),
  ),
  "architecture evidence classification is incomplete",
);

const fixtureSource = readFileSync(resolve(directory, "contract-fixtures.ts"), "utf8");
for (const forbidden of ["Schema.Unknown", "Schema.Any", "data: unknown", "code: string"]) {
  assert(!fixtureSource.includes(forbidden), `open Schema/result member survives: ${forbidden}`);
}

const goldenDirectory = resolve(directory, "goldens");
const goldenFiles = readdirSync(goldenDirectory).sort();
const requiredCauses = [
  "empty",
  "fail",
  "die-error",
  "die-value",
  "interrupt",
  "ordered",
  "duplicate",
];
for (const tag of requiredCauses)
  assert(goldenFiles.includes(`cause.${tag}.golden`), `missing Cause golden ${tag}`);
for (const command of CliCommands) {
  assert(
    goldenFiles.some((name) => name === `cli-success-${command.replace(".", "-")}.golden`),
    `missing CLI success golden for ${command}`,
  );
}
const allDiagnosticCodes = Object.values(DiagnosticCodes).flat();
for (const code of allDiagnosticCodes) {
  assert(goldenFiles.includes(`cli-error-${code}.golden`), `missing diagnostic golden for ${code}`);
}
assert(
  goldenFiles.filter((name) => name.startsWith("cli-error-")).length === allDiagnosticCodes.length,
  "diagnostic golden set is not exact",
);

for (const name of goldenFiles) {
  const bytes = readFileSync(resolve(goldenDirectory, name), "utf8");
  const value = JSON.parse(bytes);
  assert(bytes === canonicalBytes(value), `${name} is not compact raw-key-sorted JSON with one LF`);
  const options = { onExcessProperty: "error" as const };
  if (name === "boot.min.golden") Schema.decodeUnknownSync(RuntimeBootSchema, options)(value);
  else if (name === "behavior.min.golden")
    Schema.decodeUnknownSync(BehaviorArtifactSchema, options)(value);
  else if (name.startsWith("trace.")) Schema.decodeUnknownSync(TraceArtifactSchema, options)(value);
  else if (name.startsWith("cause.")) Schema.decodeUnknownSync(CauseProjection, options)(value);
  else if (name.startsWith("cli-success-"))
    Schema.decodeUnknownSync(CliSuccessSchema, options)(value);
  else if (name.startsWith("cli-error-")) Schema.decodeUnknownSync(CliErrorSchema, options)(value);
  else fail(`unclassified golden: ${name}`);
}

console.log(
  `Phase 0 contract validated: ${expectedPackageKeys.length} package exports, ${expectedCliKeys.length} CLI module exports, ${proofCases.length} proof cases, ${proofIndex.localProofCases.length} local cases, ${goldenFiles.length} byte goldens.`,
);
