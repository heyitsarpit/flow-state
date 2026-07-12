import { describe, expect, it } from "vite-plus/test";

const sourceModules = import.meta.glob("./{runtime,services,descriptors,core}/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const legacyStoreModules = import.meta.glob("./store/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const contractRuntimeModulePath = "./runtime/contract-runtime.ts";
const appDescriptorModulePath = "./descriptors/app.ts";
const orchestratorSystemModulePath = "./core/orchestrator/orchestrator-system.ts";
const orchestratorActorLifecycleModulePath = "./core/orchestrator/orchestrator-actor-lifecycle.ts";
const orchestratorChildrenModulePath = "./core/orchestrator/orchestrator-children.ts";
const orchestratorInspectionModulePath = "./core/orchestrator/orchestrator-inspection.ts";
const orchestratorRegistryModulePath = "./core/orchestrator/orchestrator-registry.ts";
const orchestratorAfterTimerOwnershipModulePath =
  "./core/orchestrator/orchestrator-after-timer-ownership.ts";
const orchestratorStreamOwnershipModulePath =
  "./core/orchestrator/orchestrator-stream-ownership.ts";
const orchestratorStreamTimerOwnershipModulePath =
  "./core/orchestrator/orchestrator-stream-timer-ownership.ts";
const orchestratorTransactionOwnershipModulePath =
  "./core/orchestrator/orchestrator-transaction-ownership.ts";
const readyWorkModulePath = "./core/scheduling/ready-work.ts";
const resourceStoreMemoryModulePath = "./core/store/resource-store-memory.ts";
const resourceStoreLookupsModulePath = "./core/store/resource-store-lookups.ts";
const resourceStoreStateUpdatesModulePath = "./core/store/resource-store-state-updates.ts";
const resourceStoreSubscriptionsModulePath = "./core/store/resource-store-subscriptions.ts";
const resourceStoreModulePath = "./core/runtime/services/resource-store.ts";
const canonicalKeyModulePath = "./core/api/canonical-key.ts";

function requireSource(path: string): string {
  const source = sourceModules[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source module`);
  }

  return source;
}

describe("runtime architecture", () => {
  it("keeps runtime disposal on Effect-native lifecycle primitives", () => {
    const contractRuntimeSource = requireSource(contractRuntimeModulePath);

    expect(contractRuntimeSource).toContain("managedRuntime.disposeEffect");
    expect(contractRuntimeSource).toContain("runPromise(disposeEffect)");
    expect(contractRuntimeSource).not.toContain("disposePromise = (async () => {");
    expect(contractRuntimeSource).not.toContain("managedRuntime.dispose()");
  });

  it("keeps runtime layer and runner typing free of unknown-erased service channels", () => {
    const contractRuntimeSource = requireSource(contractRuntimeModulePath);

    expect(contractRuntimeSource).not.toContain("FlowRuntime<unknown, unknown>");
    expect(contractRuntimeSource).not.toContain("Effect.Effect<A, E, unknown>");
    expect(contractRuntimeSource).not.toContain(
      "ManagedRuntime.make(runtimeLayer as Layer.Layer<unknown, unknown, never>)",
    );
  });

  it("keeps orchestrator actor lifecycle control in Effects internally", () => {
    const orchestratorSystemSource = requireSource(orchestratorSystemModulePath);
    const orchestratorActorLifecycleSource = requireSource(orchestratorActorLifecycleModulePath);

    expect(orchestratorSystemSource).toContain('from "./orchestrator-actor-lifecycle.js"');
    expect(orchestratorSystemSource).not.toContain('Effect.fn("FlowActor.flush")');
    expect(orchestratorSystemSource).not.toContain('Effect.fn("FlowActor.dispose")');
    expect(orchestratorSystemSource).not.toContain(
      "const listeners = new Map<number, () => void>()",
    );
    expect(orchestratorSystemSource).not.toContain("startReadyWork(actor)");
    expect(orchestratorSystemSource).not.toContain("Effect.promise(() => actor.dispose())");
    expect(orchestratorSystemSource).not.toContain("Effect.promise(() => actor.flush())");
    expect(orchestratorActorLifecycleSource).toContain('Effect.fn("FlowActor.flush")');
    expect(orchestratorActorLifecycleSource).toContain('Effect.fn("FlowActor.dispose")');
    expect(orchestratorActorLifecycleSource).toContain(
      "const listeners = new Map<number, () => void>()",
    );
    expect(orchestratorActorLifecycleSource).toContain("startReadyWork(actor)");
  });

  it("keeps child actor ownership delegated to a dedicated orchestrator helper", () => {
    const orchestratorSystemSource = requireSource(orchestratorSystemModulePath);
    const orchestratorChildrenSource = requireSource(orchestratorChildrenModulePath);

    expect(orchestratorSystemSource).toContain('from "./orchestrator-children.js"');
    expect(orchestratorSystemSource).not.toContain("const ownedChildren = new Map");
    expect(orchestratorSystemSource).not.toContain("const attachOwnedChild =");
    expect(orchestratorSystemSource).not.toContain("const startStateOwnedChildren =");
    expect(orchestratorChildrenSource).toContain("const ownedChildren = new Map");
    expect(orchestratorChildrenSource).toContain("const attachOwnedChild =");
    expect(orchestratorChildrenSource).toContain("const startStateOwnedChildren =");
  });

  it("keeps actor snapshot and inspection plumbing delegated to a dedicated orchestrator helper", () => {
    const orchestratorSystemSource = requireSource(orchestratorSystemModulePath);
    const orchestratorInspectionSource = requireSource(orchestratorInspectionModulePath);

    expect(orchestratorSystemSource).toContain('from "./orchestrator-inspection.js"');
    expect(orchestratorSystemSource).not.toContain("const appendInspectionReceipt =");
    expect(orchestratorSystemSource).not.toContain("let nextInspectionCorrelationId =");
    expect(orchestratorSystemSource).not.toContain("annotateNewMachineEventReceipts(nextSnapshot");
    expect(orchestratorInspectionSource).toContain("const appendInspectionReceipt =");
    expect(orchestratorInspectionSource).toContain("const appendRestoreFacts =");
    expect(orchestratorInspectionSource).toContain("const annotateMachineEventReceipts =");
  });

  it("keeps orchestrator registry and start-stop ownership delegated to a dedicated helper", () => {
    const orchestratorSystemSource = requireSource(orchestratorSystemModulePath);
    const orchestratorRegistrySource = requireSource(orchestratorRegistryModulePath);

    expect(orchestratorSystemSource).toContain('from "./orchestrator-registry.js"');
    expect(orchestratorSystemSource).not.toContain("const createRegisteredActor =");
    expect(orchestratorSystemSource).not.toContain(
      'const start = Effect.fn("OrchestratorSystem.start")',
    );
    expect(orchestratorSystemSource).not.toContain("new Map<string, RegisteredFlowActor>()");
    expect(orchestratorRegistrySource).toContain("const createRegisteredActor =");
    expect(orchestratorRegistrySource).toContain(
      'const start = Effect.fn("OrchestratorSystem.start")',
    );
    expect(orchestratorRegistrySource).toContain("new Map<string, RegisteredActorRecord>()");
  });

  it("keeps transaction ownership delegated to a dedicated orchestrator helper", () => {
    const orchestratorSystemSource = requireSource(orchestratorSystemModulePath);
    const orchestratorTransactionOwnershipSource = requireSource(
      orchestratorTransactionOwnershipModulePath,
    );

    expect(orchestratorSystemSource).toContain('from "./orchestrator-transaction-ownership.js"');
    expect(orchestratorSystemSource).not.toContain("const startStateOwnedTransactions =");
    expect(orchestratorSystemSource).not.toContain(
      "const transaction = snapshot.transactions[transactionId]",
    );
    expect(orchestratorSystemSource).not.toContain("transaction:reset");
    expect(orchestratorTransactionOwnershipSource).toContain("const startStateOwnedTransactions =");
    expect(orchestratorTransactionOwnershipSource).toContain(
      "const transaction = snapshot.transactions[transactionId]",
    );
    expect(orchestratorTransactionOwnershipSource).toContain("transaction:reset");
  });

  it("keeps ready-work mailbox scheduling on the compact FIFO helper", () => {
    const readyWorkSource = requireSource(readyWorkModulePath);

    expect(readyWorkSource).toContain('from "../../utils/fifo-queue.js"');
    expect(readyWorkSource).toContain("createFifoQueue<ReadyWorkTask>()");
    expect(readyWorkSource).not.toContain(".shift()");
  });

  it("keeps streams and timers ownership delegated to a dedicated orchestrator helper", () => {
    const orchestratorSystemSource = requireSource(orchestratorSystemModulePath);
    const orchestratorStreamsTimersSource = requireSource(
      "./core/orchestrator/orchestrator-streams-timers.ts",
    );
    const orchestratorAfterTimerOwnershipSource = requireSource(
      orchestratorAfterTimerOwnershipModulePath,
    );
    const orchestratorStreamOwnershipSource = requireSource(orchestratorStreamOwnershipModulePath);
    const orchestratorStreamTimerOwnershipSource = requireSource(
      orchestratorStreamTimerOwnershipModulePath,
    );

    expect(orchestratorSystemSource).toContain('from "./orchestrator-stream-timer-ownership.js"');
    expect(orchestratorSystemSource).not.toContain("applyAfterTransitionWithMeta");
    expect(orchestratorSystemSource).not.toContain("timer:fire");
    expect(orchestratorSystemSource).not.toContain(
      "const streamTimerController = createStreamTimerController",
    );
    expect(orchestratorStreamTimerOwnershipSource).toContain("applyAfterTransitionWithMeta");
    expect(orchestratorStreamTimerOwnershipSource).toContain("timer:fire");
    expect(orchestratorStreamTimerOwnershipSource).toContain(
      "return createStreamTimerController<Machine>",
    );
    expect(orchestratorStreamsTimersSource).toContain(
      'from "./orchestrator-after-timer-ownership.js"',
    );
    expect(orchestratorStreamsTimersSource).toContain('from "./orchestrator-stream-ownership.js"');
    expect(orchestratorStreamsTimersSource).not.toContain("const ownedAfters = new Map");
    expect(orchestratorStreamsTimersSource).not.toContain("const ownedStreams = new Map");
    expect(orchestratorStreamsTimersSource).not.toContain("const startStateOwnedAfters =");
    expect(orchestratorStreamsTimersSource).not.toContain("const startStateOwnedStreams =");
    expect(orchestratorStreamsTimersSource).not.toContain("createDelayedWorkPlan");
    expect(orchestratorStreamsTimersSource).not.toContain("resolveStreamSubscription");
    expect(orchestratorAfterTimerOwnershipSource).toContain("const ownedAfters = new Map");
    expect(orchestratorAfterTimerOwnershipSource).toContain("const startStateOwnedAfters =");
    expect(orchestratorAfterTimerOwnershipSource).toContain("createDelayedWorkPlan");
    expect(orchestratorStreamOwnershipSource).toContain("const ownedStreams = new Map");
    expect(orchestratorStreamOwnershipSource).toContain("const startStateOwnedStreams =");
    expect(orchestratorStreamOwnershipSource).toContain("resolveStreamSubscription");
  });

  it("keeps runtime installer policy owned by a dedicated service instead of ad hoc mode branches", () => {
    const appDescriptorSource = requireSource(appDescriptorModulePath);
    const resourceStoreSource = requireSource(resourceStoreModulePath);
    const orchestratorSystemSource = requireSource(orchestratorSystemModulePath);

    expect(appDescriptorSource).toContain('from "../core/runtime/services/runtime-policy.js"');
    expect(appDescriptorSource).not.toContain('descriptor.mode === "test"');
    expect(resourceStoreSource).toContain('from "../../store/resource-store-memory.js"');
    expect(resourceStoreSource).toContain('from "./runtime-policy.js"');
    expect(orchestratorSystemSource).toContain('from "../runtime/services/runtime-policy.js"');
  });

  it("keeps store implementation ownership under core/store instead of a root source bucket", () => {
    expect(Object.keys(legacyStoreModules)).toEqual([]);
  });

  it("keeps runtime-local resource key identity scoped to the ResourceStore owner", () => {
    const canonicalKeySource = requireSource(canonicalKeyModulePath);
    const resourceStoreMemorySource = requireSource(resourceStoreMemoryModulePath);

    expect(canonicalKeySource).toContain("function createRuntimeLocalIdentityState");
    expect(canonicalKeySource).not.toContain("const localObjectTokens = new WeakMap");
    expect(canonicalKeySource).not.toContain("const localSymbolTokens = new Map");
    expect(resourceStoreMemorySource).toContain("createFlowKeyIdentityScope()");
    expect(resourceStoreMemorySource).toContain("createResourceInvalidation(identityScope)");
  });

  it("keeps resource-store lookup orchestration delegated to a dedicated core/store helper", () => {
    const resourceStoreMemorySource = requireSource(resourceStoreMemoryModulePath);
    const resourceStoreLookupsSource = requireSource(resourceStoreLookupsModulePath);

    expect(resourceStoreMemorySource).toContain('from "./resource-store-lookups.js"');
    expect(resourceStoreMemorySource).not.toContain("const inFlightLookups = new Map");
    expect(resourceStoreMemorySource).not.toContain("const pausedLookups = new Map");
    expect(resourceStoreMemorySource).not.toContain("const performLookup = (");
    expect(resourceStoreLookupsSource).toContain("const inFlightLookups = new Map");
    expect(resourceStoreLookupsSource).toContain("const pausedLookups = new Map");
  });

  it("keeps resource-store state write loops delegated to a dedicated core/store helper", () => {
    const resourceStoreMemorySource = requireSource(resourceStoreMemoryModulePath);
    const resourceStoreStateUpdatesSource = requireSource(resourceStoreStateUpdatesModulePath);

    expect(resourceStoreMemorySource).toContain('from "./resource-store-state-updates.js"');
    expect(resourceStoreMemorySource).not.toContain("for (const resource of resources)");
    expect(resourceStoreMemorySource).toContain(
      "restorePrevalidatedResourceState(state, entries, resourceKeyOf)",
    );
    expect(resourceStoreStateUpdatesSource).toContain("for (const resource of resources)");
    expect(resourceStoreStateUpdatesSource).toContain("for (const entry of entries)");
    expect(resourceStoreStateUpdatesSource).toContain("function invalidateResourceState");
  });

  it("keeps resource-store subscription bookkeeping delegated to a dedicated core/store helper", () => {
    const resourceStoreMemorySource = requireSource(resourceStoreMemoryModulePath);
    const resourceStoreSubscriptionsSource = requireSource(resourceStoreSubscriptionsModulePath);

    expect(resourceStoreMemorySource).toContain('from "./resource-store-subscriptions.js"');
    expect(resourceStoreMemorySource).not.toContain("const selections = new Map");
    expect(resourceStoreMemorySource).not.toContain("const activeSubscriptions = new Map");
    expect(resourceStoreMemorySource).not.toContain("const sourceFor = (ref:");
    expect(resourceStoreSubscriptionsSource).toContain("const selections = new Map");
    expect(resourceStoreSubscriptionsSource).toContain("const activeSubscriptions = new Map");
    expect(resourceStoreSubscriptionsSource).toContain("const sourceFor = (ref:");
  });
});
