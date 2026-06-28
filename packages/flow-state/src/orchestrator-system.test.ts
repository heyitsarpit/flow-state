import { Cause, Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "./public/flow.js";
import type {
  FlowActor,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "./public/types.js";
import { NotificationScheduler } from "./services/notification-scheduler.js";
import { OrchestratorSystem } from "./services/orchestrator-system.js";
import { ResourceStore } from "./services/resource-store.js";
import { TraceLog } from "./services/trace.js";
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
    done: {},
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

const traceLogLayer = TraceLog.layer;
const resourceStoreLayer = ResourceStore.layer.pipe(Layer.provide(NotificationScheduler.testLayer));
const orchestratorLayer = Layer.mergeAll(
  traceLogLayer,
  resourceStoreLayer,
  OrchestratorSystem.layer.pipe(Layer.provide(Layer.mergeAll(resourceStoreLayer, traceLogLayer))),
);

function runOrchestrator<A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> {
  const provided = effect.pipe(Effect.provide(orchestratorLayer)) as Effect.Effect<A, E>;
  return Effect.runPromise(provided);
}

function childActorPath(parentId: string, childId: string): string {
  return `${parentId}/${childId}`;
}

describe("Phase 5 orchestrator lifecycle contract", () => {
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
      expect(String(Cause.squash(result.duplicateExit.cause))).toContain(
        "Actor with id 'orchestrator.actor' already exists",
      );
    }
    expect(
      result.actor.receipts().filter((receipt) => receipt.type === "actor:start"),
    ).toHaveLength(1);
  });

  it("reuses a detached keep-alive actor when started again with the same id", async () => {
    const result = await runOrchestrator(
      Effect.gen(function* () {
        const system = yield* OrchestratorSystem;
        const createKeepAliveMachine = () =>
          flow.machine<{ readonly steps: number }, { readonly type: "STEP" }, "idle">({
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

        const actor = yield* system.start(createKeepAliveMachine(), {
          id: "orchestrator.keep-alive",
          policy: "keep-alive",
        });

        const unsubscribe = actor.subscribe(() => undefined);
        actor.send({ type: "STEP" });
        unsubscribe();

        const reattached = yield* system.start(createKeepAliveMachine(), {
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

  it("marks completed child snapshots successful while preserving the stable child actor id", async () => {
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

        return {
          child,
          snapshot: actor.children()["child.worker"],
          receipts: actor.receipts(),
        };
      }),
    );

    expect(result.child.snapshot().value).toBe("done");
    expect(result.snapshot).toMatchObject({
      id: "child.worker",
      actorId: "child.parent.snapshot-sync/child.worker",
      state: "done",
      status: "success",
      parentState: "running",
    });
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
});
