import { assert, describe, it } from "@effect/vitest";

import * as appOwner from "../../app/app.js";
import * as definitionOwner from "../../definition/definition.js";
import * as diagnosticOwner from "../../diagnostic/diagnostic.js";
import * as implementationOwner from "../implementation.js";
import * as machineOwner from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import { stream } from "../../operation/stream.js";
import { transaction } from "../../operation/transaction.js";
import * as root from "../../index.js";
import * as inspectRoute from "../../inspect.js";
import * as reactRoute from "../../react-entry.js";
import * as testingRoute from "../../testing.js";
import packageJson from "../../../package.json";

const rootRuntimeNames = [
  "actorRef",
  "app",
  "can",
  "definition",
  "Diagnostic",
  "Implementation",
  "indexedDbStorage",
  "machine",
  "module",
  "persistence",
  "resource",
  "runtimeSetup",
  "stream",
  "transaction",
  "webStorage",
] as const;

const routeNames = {
  react: ["FlowProvider", "useActor", "useActorByRef", "useView"],
  testing: ["FlowStoryExecutionError", "behavior", "fixture", "model", "story"],
  inspect: [
    "analyzeTrace",
    "attachInspectionSink",
    "buildBehaviorContract",
    "compressTraceArtifact",
    "createInspectionBufferSink",
    "decompressTraceArtifact",
    "diffBehaviorContracts",
    "diffTrace",
    "exportTraceArtifact",
    "formatInspectionEvent",
    "formatInspectionTimeline",
    "formatNoTransitionSummary",
    "formatRehydrationSummary",
    "formatResourceFreshnessReport",
    "formatTrace",
    "formatTransactionOverlapSummary",
    "graphOf",
    "importTraceArtifact",
    "inspectActivities",
    "inspectMicrosteps",
    "inspectTransition",
    "renderBehaviorContract",
    "renderBehaviorCoverage",
    "renderBehaviorDiff",
    "sliceBehaviorContract",
    "summarizeTrace",
    "whyNoTransition",
  ],
} as const;

describe("public routes (API-001 / API-P01; owner package entrypoints)", () => {
  // API-001 / API-P01; production owner: packages/flow-state-rewrite/src/public/root.ts.
  // Rationale: exact runtime keys and owner identity catch route drift and duplicate constructor authorities.
  it("exposes exactly the accepted root runtime names and owner values", () => {
    assert.deepStrictEqual(Object.keys(root).sort(), [...rootRuntimeNames].sort());
    assert.strictEqual(root.app, appOwner.app);
    assert.strictEqual(root.module, appOwner.module);
    assert.strictEqual(root.definition, definitionOwner.definition);
    assert.strictEqual(root.machine, machineOwner.machine);
    assert.strictEqual(root.resource, resource);
    assert.strictEqual(root.stream, stream);
    assert.strictEqual(root.transaction, transaction);
    assert.strictEqual(root.Implementation, implementationOwner.Implementation);
    assert.strictEqual(root.Diagnostic.Error, diagnosticOwner.Error);
    assert.deepStrictEqual(Object.keys(root.Implementation).sort(), ["effect", "merge", "succeed"]);
  });

  // API-001 / API-P01; production owner: packages/flow-state-rewrite/src/{react-entry,testing,inspect}.ts.
  // Rationale: isolated routes must not recover root builders or package-owned namespace objects.
  it("keeps non-root routes isolated from root constructors", () => {
    assert.deepStrictEqual(Object.keys(reactRoute).sort(), [...routeNames.react].sort());
    assert.deepStrictEqual(Object.keys(testingRoute).sort(), [...routeNames.testing].sort());
    assert.deepStrictEqual(Object.keys(inspectRoute).sort(), [...routeNames.inspect].sort());

    for (const route of [reactRoute, testingRoute, inspectRoute]) {
      for (const name of rootRuntimeNames) assert.strictEqual(Object.hasOwn(route, name), false);
    }
  });

  // RET-001 / API-P01; production owner: packages/flow-state-rewrite/package.json.
  // Rationale: the packed boundary retains only the supported ESM routes and rejects private deep imports.
  it("publishes only supported package routes and no private deep-import condition", () => {
    assert.deepStrictEqual(Object.keys(packageJson.exports).sort(), [
      ".",
      "./inspect",
      "./package.json",
      "./react",
      "./testing",
    ]);
    assert.strictEqual(Object.hasOwn(packageJson.exports, "./src"), false);
    assert.strictEqual(Object.hasOwn(packageJson.exports, "./diagnostic"), false);
    assert.strictEqual(Object.hasOwn(packageJson.exports, "./implementation"), false);
  });
});
