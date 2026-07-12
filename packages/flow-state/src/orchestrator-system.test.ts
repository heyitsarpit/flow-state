import { Cause, Effect, Exit, Layer } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import * as flow from "./core/api/flow-core.js";
import type {
  FlowActor,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "./core/api/types.js";
import { HostSignals } from "./core/runtime/services/host-signals.js";
import { InspectionLog } from "./core/runtime/services/inspection.js";
import { NotificationScheduler } from "./core/runtime/services/notification-scheduler.js";
import { OrchestratorSystem } from "./core/orchestrator/orchestrator-system.js";
import { createOrchestratorActorLifecycle } from "./core/orchestrator/orchestrator-actor-lifecycle.js";
import { createOrchestratorRegistry } from "./core/orchestrator/orchestrator-registry.js";
import { ResourceStore } from "./core/runtime/services/resource-store.js";
import { FlowRuntimePolicy } from "./core/runtime/services/runtime-policy.js";
import { TraceLog } from "./core/runtime/services/trace.js";
import { createControlledStream } from "./testing/controlled-stream.js";

const actorMachine = flow.machine<{ readonly steps: number }, { readonly type: "STEP" }, "idle">({
  id: "orchestrator.actor",
  initial: "idle",
  context: () => ({ steps: 0 }),
  states: {
    idle: {
      on: {
        STEP: {
          update: ({ context }) => ({ steps: context.steps + 1 }),
        },
      },
    },
  },
});

function createDelayedLeaseRegistry() {
  let finalizerStarted = false;
  let finalizerRuns = 0;
  let releaseFinalizer: (() => void) | undefined;
  const actors: Array<object> = [];
  type RegistryCreateActor = Parameters<typeof createOrchestratorRegistry>[0]["createActor"];
  const createActor = ((machine, actorId, _createOwnedActor, _inspectionOwner, onDispose) => {
    let snapshot = machine.getInitialSnapshot();
    const lifecycle = createOrchestratorActorLifecycle({
      actorId,
      machine,
      currentSnapshot: () => snapshot,
      currentIssues: () => [],
      runPromise: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.runPromise(effect as Effect.Effect<A, E, never>),
    });

    const actor = lifecycle.createActor({
      dispatchMachineEvent: () => undefined,
      replaceSnapshot: (next) => {
        snapshot = next;
      },
      appendReceipt: (receipt) => {
        snapshot = Object.freeze({
          ...snapshot,
          receipts: [...snapshot.receipts, receipt],
        });
      },
      buildDisposedSnapshot: () => snapshot,
      activateStateOwnedWork: () => undefined,
      restoreStateOwnedWork: () => undefined,
      initialSnapshotProvided: false,
      ownedChildActors: () => [
        {
          flushEffect: Effect.void,
          disposeEffect: Effect.promise<void>(
            () =>
              new Promise((resolve) => {
                finalizerStarted = true;
                releaseFinalizer = () => {
                  finalizerRuns += 1;
                  resolve();
                };
              }),
          ),
        },
      ],
      ownedWorkFinalizers: () => [],
      retryChild: () => false,
      retryTransaction: () => false,
      resetTransaction: () => false,
      onDispose,
    });
    actors.push(actor);
    return actor;
  }) as RegistryCreateActor;

  const registry = createOrchestratorRegistry({
    rootBindingFor: (machine, options) =>
      Object.freeze({
        actorId: options?.id ?? machine.id,
        ownerDomain: "delayed-lease-test",
      }),
    inspectionOwnerFor: (_machine, actorId, ownerSeed) =>
      Object.freeze({
        actorId,
        rootActorId: ownerSeed.rootActorId,
      }),
    createActor,
  });

  return {
    registry,
    actors: () => actors,
    finalizerStarted: () => finalizerStarted,
    finalizerRuns: () => finalizerRuns,
    releaseFinalizer: () => {
      releaseFinalizer?.();
    },
  };
}

const childWorkerMachine = flow.machine<
  {},
  { readonly type: "NOOP" } | { readonly type: "COMPLETE" },
  "running" | "done"
>({
  id: "child.worker",
  initial: "running",
  context: () => ({}),
  states: {
    running: {
      on: {
        COMPLETE: "done",
      },
    },
    done: {
      type: "final",
    },
  },
});

const childParentMachine = flow.machine<
  {},
  { readonly type: "START" } | { readonly type: "STOP" },
  "idle" | "running" | "done"
>({
  id: "child.parent",
  initial: "idle",
  context: () => ({}),
  states: {
    idle: {
      on: {
        START: "running",
      },
    },
    running: {
      invoke: flow.child({
        id: "child.worker",
        machine: childWorkerMachine,
        supervision: "stop-on-failure",
      }),
      on: {
        STOP: "done",
      },
    },
    done: {},
  },
});

const switchingChildParentMachine = flow.machine<
  {},
  { readonly type: "NEXT" } | { readonly type: "STOP" },
  "alpha" | "beta" | "done"
>({
  id: "child.switching-parent",
  initial: "alpha",
  context: () => ({}),
  states: {
    alpha: {
      invoke: flow.child({
        id: "child.worker",
        machine: childWorkerMachine,
        supervision: "stop-on-failure",
      }),
      on: {
        NEXT: "beta",
      },
    },
    beta: {
      invoke: flow.child({
        id: "child.worker",
        machine: childWorkerMachine,
        supervision: "stop-on-failure",
      }),
      on: {
        STOP: "done",
      },
    },
    done: {},
  },
});

const reenteringChildParentMachine = flow.machine<
  {},
  { readonly type: "START" } | { readonly type: "REENTER" } | { readonly type: "STOP" },
  "idle" | "running" | "done"
>({
  id: "child.reenter-parent",
  initial: "idle",
  context: () => ({}),
  states: {
    idle: {
      on: {
        START: "running",
      },
    },
    running: {
      invoke: flow.child({
        id: "child.worker",
        machine: childWorkerMachine,
        supervision: "stop-on-failure",
      }),
      on: {
        REENTER: {
          target: "running",
          reenter: true,
        },
        STOP: "done",
      },
    },
    done: {},
  },
});

const nestedGrandchildMachine = flow.machine<{}, { readonly type: "NOOP" }, "running">({
  id: "grand.child",
  initial: "running",
  context: () => ({}),
  states: {
    running: {},
  },
});

const nestedChildMachine = flow.machine<{}, { readonly type: "NOOP" }, "running">({
  id: "child.node",
  initial: "running",
  context: () => ({}),
  states: {
    running: {
      invoke: flow.child({
        id: "grand.child",
        machine: nestedGrandchildMachine,
      }),
    },
  },
});

const nestedParentMachine = flow.machine<
  {},
  { readonly type: "START" } | { readonly type: "STOP" },
  "idle" | "running" | "done"
>({
  id: "nested.parent",
  initial: "idle",
  context: () => ({}),
  states: {
    idle: {
      on: {
        START: "running",
      },
    },
    running: {
      invoke: flow.child({
        id: "child.node",
        machine: nestedChildMachine,
      }),
      on: {
        STOP: "done",
      },
    },
    done: {},
  },
});

const timedChildMachine = flow.machine<{}, never, "waiting" | "done">({
  id: "child.timed-worker",
  initial: "waiting",
  context: () => ({}),
  states: {
    waiting: {
      after: flow.after({
        id: "child.timed-worker.finish",
        delay: "2 seconds",
        target: "done",
      }),
    },
    done: {
      type: "final",
    },
  },
});

const timedChildParentMachine = flow.machine<{}, { readonly type: "START" }, "idle" | "running">({
  id: "child.timed-parent",
  initial: "idle",
  context: () => ({}),
  states: {
    idle: {
      on: {
        START: "running",
      },
    },
    running: {
      invoke: flow.child({
        id: "child.timer",
        machine: timedChildMachine,
        supervision: "stop-on-failure",
      }),
    },
  },
});

const inspectionLogLayer = InspectionLog.layer;
const traceLogLayer = TraceLog.layer;
const runtimePolicyLayer = FlowRuntimePolicy.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
}).pipe(Layer.provide(Layer.mergeAll(NotificationScheduler.testLayer, HostSignals.testLayer)));
const resourceStoreLayer = ResourceStore.layer.pipe(
  Layer.provide(
    Layer.mergeAll(NotificationScheduler.testLayer, HostSignals.testLayer, runtimePolicyLayer),
  ),
);
const orchestratorLayer = Layer.mergeAll(
  inspectionLogLayer,
  traceLogLayer,
  runtimePolicyLayer,
  resourceStoreLayer,
  OrchestratorSystem.layer.pipe(
    Layer.provide(
      Layer.mergeAll(resourceStoreLayer, inspectionLogLayer, traceLogLayer, runtimePolicyLayer),
    ),
  ),
);
const timedOrchestratorDependencies = Layer.mergeAll(
  resourceStoreLayer,
  inspectionLogLayer,
  traceLogLayer,
  runtimePolicyLayer,
  TestClock.layer(),
);
const timedOrchestratorLayer = Layer.mergeAll(
  timedOrchestratorDependencies,
  OrchestratorSystem.layer.pipe(Layer.provide(timedOrchestratorDependencies)),
);

function runOrchestrator<A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> {
  const provided = effect.pipe(Effect.provide(orchestratorLayer)) as Effect.Effect<A, E>;
  return Effect.runPromise(provided);
}

function runTimedOrchestrator<A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> {
  const provided = effect.pipe(Effect.provide(timedOrchestratorLayer)) as Effect.Effect<A, E>;
  return Effect.runPromise(provided);
}

function childActorPath(parentId: string, childId: string): string {
  return `${parentId}/${childId}`;
}

describe("orchestrator lifecycle contracts", () => {
  it("registers actors, records attach and detach lifecycle receipts, and mirrors them to trace", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const trace = yield* TraceLog;
        const actor = yield* system.start(actorMachine, {
          id: "orchestrator.lifecycle",
        });

        const unsubscribeFirst = actor.subscribe(() => undefined);
        const unsubscribeSecond = actor.subscribe(() => undefined);

        unsubscribeSecond();
        const receiptsBeforeDetach = actor.receipts();

        unsubscribeFirst();

        return {
          actor,
          registered: yield* system.get("orchestrator.lifecycle"),
          receiptsBeforeDetach,
          traceEntries: yield* trace.entries,
        };
      }),
    );

    expect(result.registered).toBe(result.actor);
    expect(
      result.receiptsBeforeDetach.filter((receipt) => receipt.type === "actor:unsubscribe"),
    ).toHaveLength(0);
    expect(result.actor.receipts()).toEqual(
      expect.arrayContaining([
        { type: "actor:start", id: "orchestrator.lifecycle" },
        { type: "actor:subscribe", id: "orchestrator.lifecycle" },
        { type: "actor:unsubscribe", id: "orchestrator.lifecycle" },
      ]),
    );
    expect(result.traceEntries).toEqual([
      { type: "actor:start", id: "orchestrator.lifecycle" },
      { type: "actor:subscribe", id: "orchestrator.lifecycle" },
      { type: "actor:unsubscribe", id: "orchestrator.lifecycle" },
    ]);
  });

  it("uses machine ids by default and rejects duplicate live actor ids", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(actorMachine);
        const duplicateExit = yield* Effect.exit(system.start(actorMachine));

        return {
          actor,
          duplicateExit,
          registered: yield* system.get(actorMachine.id),
        };
      }),
    );

    expect(result.registered).toBe(result.actor);
    expect(Exit.isFailure(result.duplicateExit)).toBe(true);
    if (Exit.isFailure(result.duplicateExit)) {
      const error = Cause.squash(result.duplicateExit.cause);
      expect(error instanceof FlowDiagnostic).toBe(true);
      expect(error).toMatchObject({
        code: "FLOW-ORCH-001",
        title: "Actor with id 'orchestrator.actor' already exists",
        debug: {
          actorId: "orchestrator.actor",
          machineId: "orchestrator.actor",
        },
      });
    }
    expect(
      result.actor.receipts().filter((receipt) => receipt.type === "actor:start"),
    ).toHaveLength(1);
  });

  it("reuses a detached keep-alive actor when started again with the same id and definition", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const keepAliveMachine = flow.machine<
          { readonly steps: number },
          { readonly type: "STEP" },
          "idle"
        >({
          id: "orchestrator.actor.keep-alive",
          initial: "idle",
          context: () => ({ steps: 0 }),
          states: {
            idle: {
              on: {
                STEP: {
                  update: ({ context }) => ({ steps: context.steps + 1 }),
                },
              },
            },
          },
        });

        const actor = yield* system.start(keepAliveMachine, {
          id: "orchestrator.keep-alive",
          policy: "keep-alive",
        });

        const unsubscribe = actor.subscribe(() => undefined);
        actor.send({ type: "STEP" });
        unsubscribe();

        const reattached = yield* system.start(keepAliveMachine, {
          id: "orchestrator.keep-alive",
          policy: "keep-alive",
        });

        return {
          actor,
          reattached,
          registered: yield* system.get("orchestrator.keep-alive"),
        };
      }),
    );

    expect(result.reattached).toBe(result.actor);
    expect(result.registered).toBe(result.actor);
    expect(result.reattached.snapshot().context.steps).toBe(1);
    expect(
      result.actor.receipts().filter((receipt) => receipt.type === "actor:start"),
    ).toHaveLength(1);
  });

  it("rejects keep-alive reuse for a different machine definition with the same id", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const createKeepAliveMachine = () =>
          flow.machine<{ readonly steps: number }, { readonly type: "STEP" }, "idle">({
            id: "orchestrator.actor.keep-alive.exact",
            initial: "idle",
            context: () => ({ steps: 0 }),
            states: {
              idle: {},
            },
          });

        const actor = yield* system.start(createKeepAliveMachine(), {
          id: "orchestrator.keep-alive.exact",
          policy: "keep-alive",
        });
        const duplicateExit = yield* Effect.exit(
          system.start(createKeepAliveMachine(), {
            id: "orchestrator.keep-alive.exact",
            policy: "keep-alive",
          }),
        );

        return {
          actor,
          duplicateExit,
        };
      }),
    );

    expect(Exit.isFailure(result.duplicateExit)).toBe(true);
    if (Exit.isFailure(result.duplicateExit)) {
      const error = Cause.squash(result.duplicateExit.cause);
      expect(error instanceof FlowDiagnostic).toBe(true);
      expect(error).toMatchObject({
        code: "FLOW-ORCH-001",
        debug: {
          actorId: "orchestrator.keep-alive.exact",
          machineId: "orchestrator.actor.keep-alive.exact",
        },
      });
    }
    expect(result.actor.id).toBe("orchestrator.keep-alive.exact");
  });

  it("waits for final lease cleanup before compatible same-id reacquisition", async () => {
    const delayed = createDelayedLeaseRegistry();
    const first = await Effect.runPromise(
      delayed.registry.attach(actorMachine, {
        id: "orchestrator.lease.reacquire",
        policy: "keep-alive",
      }),
    );
    const cleanup = Effect.runSync(first.releaseSync);
    const release = Effect.runPromise(cleanup);

    await Promise.resolve();
    expect(delayed.finalizerStarted()).toBe(true);

    const reacquire = Effect.runPromise(
      delayed.registry.attach(actorMachine, {
        id: "orchestrator.lease.reacquire",
        policy: "keep-alive",
      }),
    );
    let reacquired = false;
    void reacquire.then(() => {
      reacquired = true;
    });
    await Promise.resolve();

    expect(reacquired).toBe(false);
    expect(delayed.actors()).toHaveLength(1);

    delayed.releaseFinalizer();
    await release;
    const second = await reacquire;

    expect(second.actor).not.toBe(first.actor);
    expect(second.actor.id).toBe("orchestrator.lease.reacquire");
    expect(delayed.actors()).toHaveLength(2);
    expect(delayed.finalizerRuns()).toBe(1);

    const secondCleanup = Effect.runSync(second.releaseSync);
    const secondRelease = Effect.runPromise(secondCleanup);
    delayed.releaseFinalizer();
    await secondRelease;
  });

  it("lets registry shutdown override leases while awaiting delayed finalization", async () => {
    const delayed = createDelayedLeaseRegistry();
    const lease = await Effect.runPromise(
      delayed.registry.attach(actorMachine, {
        id: "orchestrator.lease.shutdown",
        policy: "keep-alive",
      }),
    );

    const shutdown = Effect.runPromise(delayed.registry.stopAll);
    await Promise.resolve();

    expect(delayed.finalizerStarted()).toBe(true);

    let stopped = false;
    void shutdown.then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    const leaseCleanup = Effect.runSync(lease.releaseSync);
    const leaseRelease = Effect.runPromise(leaseCleanup);
    delayed.releaseFinalizer();
    await shutdown;
    await leaseRelease;

    expect(stopped).toBe(true);
    expect(delayed.finalizerRuns()).toBe(1);
  });

  it("stops actors by id and keeps dispose idempotent once the registry releases them", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(actorMachine, {
          id: "orchestrator.stop",
        });

        yield* system.stop("orchestrator.stop");
        const afterFirstStop = yield* system.get("orchestrator.stop");
        yield* system.stop("orchestrator.stop");

        return {
          actor,
          afterFirstStop,
          afterSecondStop: yield* system.get("orchestrator.stop"),
        };
      }),
    );

    expect(result.afterFirstStop).toBe(null);
    expect(result.afterSecondStop).toBe(null);
    expect(
      result.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(1);
  });

  it("disposes retained actors when the orchestrator scope closes", async () => {
    let actor:
      | FlowActor<
          InferMachineContext<typeof actorMachine>,
          InferMachineEvent<typeof actorMachine>,
          InferMachineState<typeof actorMachine>
        >
      | undefined;

    await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        actor = yield* system.start(actorMachine, {
          id: "orchestrator.scope",
        });
      }),
    );

    expect(actor).toBeDefined();
    expect(actor?.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "actor:start", id: "orchestrator.scope" }),
        expect.objectContaining({ type: "actor:dispose", id: "orchestrator.scope" }),
      ]),
    );
    expect(actor?.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(1);
  });

  it("registers state-owned child snapshots on entry and removes them on state exit", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(childParentMachine, {
          id: "child.parent.lifecycle",
        });

        actor.send({ type: "START" });
        const activeChildren = actor.children();

        actor.send({ type: "STOP" });

        return {
          actor,
          activeChildren,
          finalChildren: actor.children(),
        };
      }),
    );

    expect(result.activeChildren).toMatchObject({
      "child.worker": {
        id: "child.worker",
        status: "active",
        state: "running",
        parentState: "running",
        supervision: "stop-on-failure",
      },
    });
    expect(result.actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "child:start", id: "child.worker" }),
        expect.objectContaining({ type: "child:stop", id: "child.worker" }),
      ]),
    );
    expect(result.finalChildren["child.worker"]).toBeUndefined();
  });

  it("marks active children stopped before the parent actor disposes", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(childParentMachine, {
          id: "child.parent.dispose",
        });

        actor.send({ type: "START" });
        yield* Effect.promise(() => actor.dispose());

        return {
          actor,
          children: actor.children(),
        };
      }),
    );

    expect(result.children).toMatchObject({
      "child.worker": {
        id: "child.worker",
        status: "stopped",
        state: "running",
        parentState: "running",
        supervision: "stop-on-failure",
      },
    });
    expect(result.actor.receipts().slice(-2)).toEqual([
      expect.objectContaining({ type: "child:stop", id: "child.worker" }),
      expect.objectContaining({ type: "actor:dispose", id: "child.parent.dispose" }),
    ]);
  });

  it("registers active child actors in the system and unregisters them on state exit", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(childParentMachine, {
          id: "child.parent.registry",
        });

        actor.send({ type: "START" });
        const activeChild = yield* system.get(childActorPath(actor.id, "child.worker"));

        actor.send({ type: "STOP" });

        return {
          activeChild,
          stoppedChild: yield* system.get(childActorPath(actor.id, "child.worker")),
        };
      }),
    );

    expect(result.activeChild).not.toBe(null);
    expect(result.activeChild?.id).toBe("child.parent.registry/child.worker");
    expect(result.activeChild?.snapshot().value).toBe("running");
    expect(result.stoppedChild).toBe(null);
  });

  it("re-registers a state-owned child id when moving between invoking states", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(switchingChildParentMachine, {
          id: "child.parent.switch",
        });
        const before = yield* system.get(childActorPath(actor.id, "child.worker"));

        actor.send({ type: "NEXT" });
        const after = yield* system.get(childActorPath(actor.id, "child.worker"));

        return {
          before,
          after,
          receiptsAfterNext: actor.receipts(),
        };
      }),
    );

    expect(result.before).not.toBe(null);
    expect(result.after).not.toBe(null);
    expect(result.after).not.toBe(result.before);
    expect(
      result.receiptsAfterNext.filter(
        (receipt) => receipt.type === "child:start" && receipt.id === "child.worker",
      ),
    ).toHaveLength(2);
    expect(
      result.receiptsAfterNext.filter(
        (receipt) => receipt.type === "child:stop" && receipt.id === "child.worker",
      ),
    ).toHaveLength(1);
  });

  it("re-registers a state-owned child once on a reentering self-transition", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(reenteringChildParentMachine, {
          id: "child.parent.reenter",
        });

        actor.send({ type: "START" });
        const before = yield* system.get(childActorPath(actor.id, "child.worker"));

        actor.send({ type: "REENTER" });
        const after = yield* system.get(childActorPath(actor.id, "child.worker"));

        return {
          before,
          after,
          snapshot: actor.children()["child.worker"],
          receipts: actor.receipts(),
        };
      }),
    );

    expect(result.before).not.toBe(null);
    expect(result.after).not.toBe(null);
    expect(result.after).not.toBe(result.before);
    expect(result.snapshot).toMatchObject({
      actorId: "child.parent.reenter/child.worker",
      state: "running",
      status: "active",
      parentState: "running",
    });
    expect(
      result.receipts.filter(
        (receipt) => receipt.type === "child:start" && receipt.id === "child.worker",
      ),
    ).toHaveLength(2);
    expect(
      result.receipts.filter(
        (receipt) => receipt.type === "child:stop" && receipt.id === "child.worker",
      ),
    ).toHaveLength(1);
  });

  it("unregisters nested child actor ids when a parent-owned child stops", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(nestedParentMachine, {
          id: "nested.parent.registry",
        });

        actor.send({ type: "START" });
        const childId = childActorPath(actor.id, "child.node");
        const grandchildId = childActorPath(childId, "grand.child");
        const activeChild = yield* system.get(childId);
        const activeGrandchild = yield* system.get(grandchildId);

        actor.send({ type: "STOP" });
        if (activeChild !== null) {
          yield* Effect.promise(() => activeChild.dispose());
        }

        return {
          activeChild,
          activeGrandchild,
          stoppedChild: yield* system.get(childId),
          stoppedGrandchild: yield* system.get(grandchildId),
        };
      }),
    );

    expect(result.activeChild).not.toBe(null);
    expect(result.activeGrandchild).not.toBe(null);
    expect(result.stoppedChild).toBe(null);
    expect(result.stoppedGrandchild).toBe(null);
  });

  it("cleans nested child actor ids when disposing the parent actor", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(nestedParentMachine, {
          id: "nested.parent.dispose",
        });

        actor.send({ type: "START" });
        const childId = childActorPath(actor.id, "child.node");
        const grandchildId = childActorPath(childId, "grand.child");

        yield* Effect.promise(() => actor.dispose());

        return {
          childAfterDispose: yield* system.get(childId),
          grandchildAfterDispose: yield* system.get(grandchildId),
        };
      }),
    );

    expect(result.childAfterDispose).toBe(null);
    expect(result.grandchildAfterDispose).toBe(null);
  });

  it("keeps the parent snapshot in sync when a registered child actor is stopped directly", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(childParentMachine, {
          id: "child.parent.direct-stop",
        });

        actor.send({ type: "START" });
        yield* system.stop(childActorPath(actor.id, "child.worker"));

        return {
          child: yield* system.get(childActorPath(actor.id, "child.worker")),
          childrenAfterStop: actor.children(),
          receiptsAfterStop: actor.receipts(),
        };
      }),
    );

    expect(result.child).toBe(null);
    expect(result.childrenAfterStop["child.worker"]).toBeUndefined();
    expect(result.receiptsAfterStop).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "child:stop", id: "child.worker" })]),
    );
  });

  it("records child success and removes completed child snapshots from the parent state", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(childParentMachine, {
          id: "child.parent.snapshot-sync",
        });

        actor.send({ type: "START" });
        const childId = childActorPath(actor.id, "child.worker");
        const child = yield* system.get(childId);
        if (child === null) {
          throw new Error("expected child actor to be registered");
        }

        child.send({ type: "COMPLETE" });
        yield* Effect.promise(() => child.flush());

        return {
          child,
          childAfterComplete: yield* system.get(childId),
          childrenAfterComplete: actor.children(),
          receipts: actor.receipts(),
        };
      }),
    );

    expect(result.child.snapshot().value).toBe("done");
    expect(result.childAfterComplete).toBe(null);
    expect(result.childrenAfterComplete["child.worker"]).toBeUndefined();
    expect(result.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "child:success", id: "child.worker" }),
      ]),
    );
  });

  it("marks failed child snapshots as failure so child completion and stop stay distinct", async () => {
    const childStream = createControlledStream<string, Error>("child.failure.stream");
    const failingChildMachine = flow.machine<{}, { readonly type: "CHILD_TOKEN" }, "running">({
      id: "child.failure.worker",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.stream<{}, { readonly type: "CHILD_TOKEN" }, void, string, Error>({
            id: "child.failure.tokens",
            subscribe: () => childStream.stream(),
            routes: {
              value: () => ({ type: "CHILD_TOKEN" }),
            },
          }),
        },
      },
    });
    const failingParentMachine = flow.machine<{}, { readonly type: "START" }, "idle" | "running">({
      id: "child.failure.parent",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: flow.child({
            id: "child.failure",
            machine: failingChildMachine,
            supervision: "stop-on-failure",
          }),
        },
      },
    });

    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(failingParentMachine, {
          id: "child.parent.failure",
        });

        actor.send({ type: "START" });
        childStream.fail(new Error("child stream failed"));
        yield* Effect.promise(() => actor.flush());

        return {
          snapshot: actor.children()["child.failure"],
          receipts: actor.receipts(),
          issues: actor.issues(),
        };
      }),
    );

    expect(result.snapshot).toMatchObject({
      id: "child.failure",
      status: "failure",
      parentState: "running",
    });
    expect(result.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "child:failure", id: "child.failure" }),
      ]),
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "failure", source: "child", id: "child.failure" }),
      ]),
    );
  });

  it("lets child actors inherit the injected test clock for flow.after transitions", async () => {
    const result = await runTimedOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const actor = yield* system.start(timedChildParentMachine, {
          id: "child.parent.timed",
        });

        actor.send({ type: "START" });
        yield* Effect.promise(() => actor.flush());

        const childId = childActorPath(actor.id, "child.timer");
        const child = yield* system.get(childId);
        if (child === null) {
          throw new Error("expected timed child actor to be registered");
        }

        yield* TestClock.adjust("1999 millis");
        yield* Effect.promise(() => actor.flush());

        const beforeFinalTick = {
          childState: child.snapshot().value,
          childSnapshot: actor.children()["child.timer"],
        };

        yield* TestClock.adjust("1 millis");
        yield* Effect.promise(() => actor.flush());

        return {
          beforeFinalTick,
          childAfterDelay: yield* system.get(childId),
          childrenAfterDelay: actor.children(),
          receipts: actor.receipts(),
        };
      }),
    );

    expect(result.beforeFinalTick.childState).toBe("waiting");
    expect(result.beforeFinalTick.childSnapshot).toMatchObject({
      id: "child.timer",
      status: "active",
      state: "waiting",
      parentState: "running",
    });
    expect(result.childAfterDelay).toBe(null);
    expect(result.childrenAfterDelay["child.timer"]).toBeUndefined();
    expect(result.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "child:success", id: "child.timer" }),
      ]),
    );
  });
});
