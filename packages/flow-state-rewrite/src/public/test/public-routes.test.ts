import { assert, describe, it } from "@effect/vitest";

import * as appOwner from "../../app/app.js";
import * as actorRefOwner from "../../runtime/actor-ref.js";
import * as definitionOwner from "../../definition/definition.js";
import * as implementationOwner from "../../implementation/implementation.js";
import * as machineOwner from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import { stream } from "../../operation/stream.js";
import { transaction } from "../../operation/transaction.js";
import * as root from "../../index.js";
import * as inspectRoute from "../../inspect.js";
import * as reactRoute from "../../react-entry.js";
import * as runtimeOwner from "../../runtime/runtime.js";
import * as testingRoute from "../../testing.js";
import packageJson from "../../../package.json";

const rootRuntimeNames = [
  "actorRef",
  "app",
  "definition",
  "Diagnostic",
  "Implementation",
  "machine",
  "module",
  "resource",
  "runtimeSetup",
  "stream",
  "transaction",
] as const;

const routeNames = {
  react: [],
  testing: [],
  inspect: [],
};

describe("public routes", () => {
  // Exact runtime keys and constructor identity catch route drift and duplicate constructor authorities.
  it("exposes exactly the accepted root runtime names and constructor values", () => {
    assert.deepStrictEqual(Object.keys(root).sort(), [...rootRuntimeNames].sort());
    assert.strictEqual(root.actorRef, actorRefOwner.actorRef);
    assert.strictEqual(root.app, appOwner.app);
    assert.strictEqual(root.module, appOwner.module);
    assert.strictEqual(root.definition, definitionOwner.definition);
    assert.strictEqual(root.machine, machineOwner.machine);
    assert.strictEqual(root.resource, resource);
    assert.strictEqual(root.stream, stream);
    assert.strictEqual(root.transaction, transaction);
    assert.strictEqual(root.Implementation, implementationOwner.Implementation);
    assert.strictEqual(root.runtimeSetup, runtimeOwner.runtimeSetup);
    assert.deepStrictEqual(Object.keys(root.Diagnostic).sort(), ["Defect", "Failure", "Interrupt"]);
    assert.ok(root.Diagnostic.Defect);
    assert.ok(root.Diagnostic.Failure);
    assert.ok(root.Diagnostic.Interrupt);
    assert.deepStrictEqual(Object.keys(root.Implementation).sort(), ["effect", "merge", "succeed"]);
  });

  // Deferred routes retain package paths while their owners are absent.
  it("keeps deferred routes empty and isolated from root constructors", () => {
    assert.deepStrictEqual(Object.keys(reactRoute), routeNames.react);
    assert.deepStrictEqual(Object.keys(testingRoute), routeNames.testing);
    assert.deepStrictEqual(Object.keys(inspectRoute), routeNames.inspect);

    for (const route of [reactRoute, testingRoute, inspectRoute]) {
      for (const name of rootRuntimeNames) assert.strictEqual(Object.hasOwn(route, name), false);
    }
  });

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
