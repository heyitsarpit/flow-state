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

const traceLogLayer = TraceLog.layer;
const orchestratorLayer = Layer.mergeAll(
  traceLogLayer,
  OrchestratorSystem.layer.pipe(Layer.provide(traceLogLayer)),
);

function runOrchestrator<A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> {
  const provided = effect.pipe(Effect.provide(orchestratorLayer)) as Effect.Effect<A, E>;
  return Effect.runPromise(provided);
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
});
