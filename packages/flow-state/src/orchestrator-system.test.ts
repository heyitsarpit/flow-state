import { Cause, Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "./public/flow.js";
import type {
  FlowActor,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "./public/types.js";
import { OrchestratorSystem } from "./services/orchestrator-system.js";
import { TraceLog } from "./services/trace.js";

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

const childWorkerMachine = flow.machine<{}, { readonly type: "NOOP" }, "running">({
  id: "child.worker",
  initial: "running",
  context: () => ({}),
  states: {
    running: {},
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
const orchestratorLayer = Layer.mergeAll(
  traceLogLayer,
  OrchestratorSystem.layer.pipe(Layer.provide(traceLogLayer)),
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
});
