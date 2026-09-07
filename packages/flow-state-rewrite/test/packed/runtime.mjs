import assert from "node:assert/strict";

import { Context, Effect, Result } from "effect";
import * as root from "flow-state-rewrite";

const expectedRootRuntimeKeys = [
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
];
const deferredRuntimeKeys = [
  "FlowDisposeError",
  "FlowPersistenceError",
  "FlowUsageError",
  "can",
  "indexedDbStorage",
  "persistence",
  "webStorage",
];
const expectedManifestExportKeys = [".", "./inspect", "./package.json", "./react", "./testing"];
const forbiddenDeepImports = [
  "flow-state-rewrite/src",
  "flow-state-rewrite/src/index.js",
  "flow-state-rewrite/diagnostic",
  "flow-state-rewrite/implementation",
];

const react = await import("flow-state-rewrite/react");
const testing = await import("flow-state-rewrite/testing");
const inspect = await import("flow-state-rewrite/inspect");
const quickstart = await import("../generated/quickstart.js");
const packageJsonModule = await import("flow-state-rewrite/package.json", {
  with: { type: "json" },
});
const packageJson = packageJsonModule.default;

assert.deepEqual(Object.keys(root).sort(), expectedRootRuntimeKeys.sort());
assert.deepEqual(Object.keys(root.Implementation).sort(), ["effect", "merge", "succeed"]);
assert.equal(packageJson.private, true);
assert.deepEqual(Object.keys(packageJson.exports).sort(), expectedManifestExportKeys);

for (const route of [react, testing, inspect]) {
  assert.deepEqual(Object.keys(route), []);
  for (const name of expectedRootRuntimeKeys) assert.equal(Object.hasOwn(route, name), false);
}
for (const name of deferredRuntimeKeys) assert.equal(Object.hasOwn(root, name), false);
for (const specifier of forbiddenDeepImports) {
  await assert.rejects(
    import(specifier),
    (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
  );
}

const Repo = Context.Service("Packed/Repo");
const Config = Context.Service("Packed/Config");

const repo = Context.make(Repo, { load: () => "ready" });
const config = Context.make(Config, { name: "packed" });
const synchronous = root.Implementation.succeed(Repo, repo);
let acquireCalls = 0;
const effectful = root.Implementation.effect(
  Config,
  Effect.sync(() => {
    acquireCalls += 1;
    return config;
  }),
);
const merged = root.Implementation.merge(synchronous, effectful);

assert.equal(synchronous.kind, "implementation");
assert.equal(effectful.kind, "implementation");
assert.equal(merged.kind, "implementation");
assert.equal(acquireCalls, 0);
assert.throws(() => root.Implementation.merge(synchronous, synchronous), /service is duplicated/u);

const definitionResult = root.definition({
  id: "packed-editor",
  states: ["idle"],
  events: { refresh: "bare" },
});
assert.equal(Result.isSuccess(definitionResult), true);
const machineResult = root.machine(definitionResult, ({ S }) => ({
  default: S.idle,
  states: { idle: {} },
}));
assert.equal(Result.isSuccess(machineResult), true);
const machine = machineResult.success;
const ref = root.actorRef(machine, "primary-editor", { persist: true });
assert.equal(ref.machine, machine);
assert.equal(ref.id, "primary-editor");
assert.equal(ref.persist, true);
assert.throws(() => root.actorRef({ ...machine }, "copied-machine"), TypeError);
assert.throws(
  () => root.resource({ id: "packed-invalid-resource", key: () => [], lookup: 1 }),
  /lookup adapter must be callable/u,
);

await Effect.runPromise(quickstart.quickstart);

console.log("runtime-routes\tPASS");
console.log(`runtime-root-keys\t${expectedRootRuntimeKeys.join(",")}`);
console.log(`forbidden-deep-imports\tPASS\t${forbiddenDeepImports.join(",")}`);
console.log("implementation-constructors\tsucceed,effect,merge");
console.log("inert-and-identity-failures\tPASS");
console.log(
  "quickstart-runtime\tPASS\tdefinition->machine->module->app->runtimeSetup->construct->ready",
);
