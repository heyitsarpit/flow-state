import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import type { EventOf } from "../../definition/domain.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine, type MachineAction } from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import { actorRef } from "../actor-ref.js";
import { makeActorIdentityRegistry, type ActorFence } from "../actor-admission.js";
import { prepareActorEngine, prepareActorSnapshot } from "../actor-engine.js";
import {
  planTurn,
  type ContextProjectionCarrier,
  type EventTurnInput,
  type ProjectionFact,
} from "../turn-plan.js";
import type { ActorSnapshot } from "../actor-engine.js";

const resultSuccess = <Value, Error>(result: Result.Result<Value, Error>) => {
  if (Result.isFailure(result)) throw result.failure;

  return result.success;
};

const item = resource({
  id: "turn-plan/item",
  key: (value: number) => [value] as const,
  lookup: (value: number, _options) => Effect.succeed(value),
});

const nestedItem = resource({
  id: "turn-plan/nested-item",
  key: (value: number) => [{ value }] as const,
  lookup: (value: number, _options) => Effect.succeed(value),
});

const planDefinitionResult = definition({
  id: "turn-plan/test",
  states: ["idle", "working", "done"],
  events: {
    opened: (value: number) => ({ value }),
    mapped: "bare",
  },
  operations: { item, nestedItem },
  memory: ({ input }: { input: { seed: number } }) => ({
    count: input.seed,
  }),
});

const planDefinition = resultSuccess(planDefinitionResult);

const opened = resultSuccess(planDefinition.E.opened(1));

const mapped = resultSuccess(planDefinition.E.mapped());

const asActionBatch = (value: unknown[]) => {
  // SAFETY: This fixture deliberately routes a mapped event through the runtime batch seam; the planner classifies it before allocation.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mixed runtime batch intentionally exceeds the authoring action type for this planner proof.
  return value as MachineAction<typeof planDefinition>[];
};

const trace: string[] = [];

const planMachine = resultSuccess(
  machine(planDefinitionResult, ({ S, O }) => ({
    default: S.idle,
    states: {
      idle: {
        on: {
          opened: {
            target: S.working,
            guard: ({ event, memory }) => {
              trace.push(`guard:${event.value}:${memory.count}`);

              return event.value > 0;
            },
            updateMemory: ({ event, memory }) => {
              trace.push(`memory:${event.value}:${memory.count}`);

              return { count: memory.count + event.value };
            },
            actions: ({ memory, snapshot }) => {
              trace.push(`actions:${memory.count}:${snapshot.state.name}`);

              return asActionBatch([O.item.lookup(memory.count), mapped]);
            },
          },
        },
      },
      working: {
        redirect: {
          when: ({ memory, snapshot }) => {
            trace.push(`redirect:${memory.count}:${snapshot.state.name}`);

            return memory.count === 2;
          },
          target: S.done,
        },
      },
      done: {},
    },
  })),
);

const identityRegistry = makeActorIdentityRegistry();

const identity = resultSuccess(identityRegistry.reserveStable(actorRef(planMachine, "turn-plan")));

const fence: ActorFence = {
  key: identity.key,
  incarnation: identity.incarnation,
  generation: 0,
  leaseEpoch: identity.leaseEpoch,
};

const snapshot: ActorSnapshot<typeof planDefinition> = {
  state: planDefinition.S.idle,
  memory: { count: 1 },
  context: {},
  lifecycle: "active",
  operations: [],
  timers: [],
  issues: [],
  revision: 4,
  observedStoreRevision: 2,
};

const contextProviderDefinitionResult = definition({
  id: "turn-plan/context-provider",
  states: ["ready", "changed"],
  events: {},
});

const contextProviderDefinition = resultSuccess(contextProviderDefinitionResult);

const contextConsumerDefinitionResult = definition({
  id: "turn-plan/context-consumer",
  states: ["ready"],
  events: { opened: "bare" },
  context: {
    provider: contextProviderDefinition.select(({ state }) => state),
  },
});

const contextConsumerDefinition = resultSuccess(contextConsumerDefinitionResult);

const contextConsumerMachine = resultSuccess(
  machine(contextConsumerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const contextRegistry = makeActorIdentityRegistry();

const contextIdentity = resultSuccess(
  contextRegistry.reserveStable(actorRef(contextConsumerMachine, "turn-plan-context")),
);

const contextFence: ActorFence = {
  key: contextIdentity.key,
  incarnation: contextIdentity.incarnation,
  generation: 0,
  leaseEpoch: contextIdentity.leaseEpoch,
};

const contextSnapshot: ActorSnapshot<typeof contextConsumerDefinition> = {
  state: contextConsumerDefinition.S.ready,
  memory: {},
  context: { provider: contextProviderDefinition.S.ready },
  lifecycle: "active",
  operations: [],
  timers: [],
  issues: [],
  revision: 4,
  observedStoreRevision: 2,
};

// RETURN_TYPE: Keeps the fixture input at the exact machine-specific planner boundary.
const turnInput = (
  event: EventOf<typeof planDefinition>,
  currentSnapshot = snapshot,
): EventTurnInput<typeof planDefinition> => ({
  _tag: "event",
  machine: planMachine,
  snapshot: currentSnapshot,
  event,
  fence,
});

// Contracts: REV-OPS-015, SEM-010, SEM-024A.
// Proofs: PROOF-003, PROOF-004.
describe("turn planner", () => {
  it("freezes one pre-turn snapshot, orders callbacks, and redirects the updated candidate", () => {
    trace.length = 0;
    const result = planTurn(turnInput(opened));
    const plan = resultSuccess(result);

    assert.deepStrictEqual(trace, [
      "guard:1:1",
      "memory:1:1",
      "actions:1:S.idle",
      "redirect:2:S.working",
    ]);
    assert.strictEqual(plan._tag, "event-plan");

    if (plan._tag === "event-plan") {
      assert.strictEqual(plan.before.state, planDefinition.S.idle);
      assert.strictEqual(plan.candidate.state, planDefinition.S.done);
      assert.deepStrictEqual(plan.before.memory, { count: 1 });
      assert.deepStrictEqual(plan.candidate.memory, { count: 2 });
      assert.strictEqual(plan.actions.length, 1);
      assert.strictEqual(plan.mappedEvents.length, 1);
      assert.strictEqual(plan.mappedEvents[0], mapped);
    }

    assert.deepStrictEqual(snapshot.memory, { count: 1 });
    assert.strictEqual(snapshot.state, planDefinition.S.idle);
  });

  it("returns a no-op when every guard rejects without running later stages", () => {
    trace.length = 0;
    const rejected = resultSuccess(planDefinition.E.opened(0));
    const result = planTurn(turnInput(rejected));
    const plan = resultSuccess(result);

    assert.deepStrictEqual(trace, ["guard:0:1"]);
    assert.strictEqual(plan._tag, "noop");
  });

  it("rejects a foreign nominal event before callbacks run", () => {
    const foreignDefinitionResult = definition({
      id: "turn-plan/foreign",
      states: ["idle"],
      events: { opened: (value: number) => ({ value }) },
    });

    const foreignDefinition = resultSuccess(foreignDefinitionResult);
    const foreignEvent = resultSuccess(foreignDefinition.E.opened(1));
    // @ts-expect-error EventOf is nominal and rejects another definition's event.
    const foreignInput: EventTurnInput<typeof planDefinition> = turnInput(foreignEvent);
    const result = planTurn(foreignInput);

    assert.strictEqual(Result.isFailure(result), true);

    if (Result.isFailure(result)) {
      assert.deepStrictEqual(result.failure.path, ["event"]);
      assert.strictEqual(result.failure.details.issue, "foreign-event");
    }
  });

  it("rejects the complete batch at the first unconstructed operation plan", () => {
    const malformed = {
      kind: "resource-lookup",
      descriptor: item.id,
      key: item.key(2),
    };

    const invalidMachine = resultSuccess(
      machine(planDefinitionResult, ({ S, O }) => ({
        default: S.idle,
        states: {
          idle: {
            on: {
              opened: {
                target: S.working,
                actions: () => asActionBatch([O.item.lookup(1), malformed]),
              },
            },
          },
          working: {},
          done: {},
        },
      })),
    );

    const result = planTurn({ ...turnInput(opened), machine: invalidMachine });

    assert.strictEqual(Result.isFailure(result), true);

    if (Result.isFailure(result)) {
      assert.deepStrictEqual(result.failure.path, ["actions", 1]);
      assert.strictEqual(result.failure.details.issue, "invalid-action");
    }
  });

  it("matches nested canonical operation keys across independently-owned containers", () => {
    const keyedSnapshot: ActorSnapshot<typeof planDefinition> = {
      ...snapshot,
      operations: [
        {
          descriptor: nestedItem,
          key: nestedItem.key(1),
          status: "running",
        },
      ],
    };

    const result = planTurn<typeof planDefinition>({
      _tag: "projection",
      snapshot: keyedSnapshot,
      fence,
      fact: {
        _tag: "completion-projection",
        completion: {
          fence: {
            actor: fence,
            descriptor: nestedItem,
            key: nestedItem.key(1),
            ordinal: 1,
          },
          outcome: { _tag: "success", value: 1 },
        },
      },
    });

    const plan = resultSuccess(result);

    assert.strictEqual(plan._tag, "projection-plan");

    if (plan._tag === "projection-plan") {
      assert.strictEqual(plan.candidate.operations.length, 1);
      assert.strictEqual(plan.candidate.operations[0]?.descriptor, nestedItem);
      assert.strictEqual(plan.candidate.operations[0]?.status, "succeeded");
    }
  });

  it("preserves nominal event and operation action types", () => {
    const event: EventOf<typeof planDefinition> = opened;
    const action: MachineAction<typeof planDefinition> = item.lookup(1);
    // @ts-expect-error EventOf is nominal and rejects a structural event envelope.
    const structuralEvent: EventOf<typeof planDefinition> = { type: opened.type };
    void event;
    void action;
    void structuralEvent;
  });

  it("plans retained selector defects as an issue-only context cut", () => {
    const diagnostic = Failure({
      code: "InvariantViolation" as const,
      path: ["context", "provider"],
      details: { issue: "selector" },
      summary: "context selector failed",
      help: "Inspect the provider selector.",
    });

    const providers = [
      {
        fence: contextFence,
        slot: "provider",
        revision: 1,
        value: contextProviderDefinition.S.ready,
      },
    ];

    const carrier: ContextProjectionCarrier = {
      providers,
      issueOnly: true,
      selectorDefects: [diagnostic],
    };

    const fact: Extract<ProjectionFact, { _tag: "context-projection" }> = {
      _tag: "context-projection",
      provider: { ...providers[0]!, value: carrier },
      projection: carrier,
    };

    const result = planTurn<typeof contextConsumerDefinition>({
      _tag: "projection",
      snapshot: contextSnapshot,
      fact,
      fence: contextFence,
    });

    const plan = resultSuccess(result);

    assert.strictEqual(plan._tag, "projection-plan");

    if (plan._tag === "projection-plan") {
      assert.strictEqual(plan.candidate.revision, contextSnapshot.revision);
      assert.strictEqual(
        plan.candidate.observedStoreRevision,
        contextSnapshot.observedStoreRevision,
      );
      assert.strictEqual(plan.candidate.context.provider, contextProviderDefinition.S.ready);
      assert.strictEqual(plan.candidate.issues[0], diagnostic);
    }
  });

  it("rejects issue-only carriers with duplicate fixed slots", () => {
    const provider = {
      fence: contextFence,
      slot: "provider",
      revision: 1,
      value: contextProviderDefinition.S.ready,
    };

    const carrier: ContextProjectionCarrier = {
      providers: [provider, provider],
      issueOnly: true,
      selectorDefects: [
        Failure({
          code: "InvariantViolation" as const,
          path: ["context", "provider"],
          details: { issue: "selector" },
          summary: "context selector failed",
          help: "Inspect the provider selector.",
        }),
      ],
    };

    const result = planTurn<typeof contextConsumerDefinition>({
      _tag: "projection",
      snapshot: contextSnapshot,
      fact: {
        _tag: "context-projection",
        provider: { ...provider, value: carrier },
        projection: carrier,
      },
      fence: contextFence,
    });

    assert.strictEqual(Result.isFailure(result), true);

    if (Result.isFailure(result)) {
      assert.deepStrictEqual(result.failure.path, ["projection", "context", "slots"]);
      assert.strictEqual(
        result.failure.summary,
        "Aggregate context projection contains a duplicate slot",
      );
    }
  });

  it("builds a pure event turn candidate from an admitted event", () => {
    const result = resultSuccess(planTurn(turnInput(opened)));
    assert.strictEqual(result._tag, "event-plan");

    if (result._tag === "event-plan") {
      assert.strictEqual(result.cause.event, opened);
      assert.strictEqual(result.fence, fence);
      assert.strictEqual(result.before.state, planDefinition.S.idle);
      assert.strictEqual(result.actions.length, 1);
    }
  });

  it("keeps passive projections separate from event planning", () => {
    trace.length = 0;

    const fact: ProjectionFact = {
      _tag: "timer-projection",
      fence,
      name: "refresh",
      startedAt: 1,
      dueAt: 5,
    };

    const result = resultSuccess(planTurn({ _tag: "projection", snapshot, fence, fact }));
    assert.strictEqual(result._tag, "projection-plan");
    assert.deepStrictEqual(trace, []);

    if (result._tag === "projection-plan") assert.strictEqual(result.cause._tag, "projection");
  });

  it("orders machine actions and exact store targets", () => {
    const result = resultSuccess(planTurn(turnInput(opened)));
    assert.strictEqual(result._tag, "event-plan");

    if (result._tag === "event-plan") {
      assert.strictEqual(result.actions[0]?.ordinal, 0);
      assert.strictEqual(result.actions[0]?.action.kind, "resource-lookup");
      assert.strictEqual(result.mappedEvents[0], mapped);
      assert.strictEqual(
        new Set(result.actions.map((action) => action.ordinal)).size,
        result.actions.length,
      );
    }
  });

  it("preserves authored false and null callback results", () => {
    const falseValue = false;
    const nullValue = null;
    const result = resultSuccess(planTurn(turnInput(opened)));
    assert.strictEqual(Object.is(falseValue, false), true);
    assert.strictEqual(nullValue, null);
    assert.strictEqual(result._tag, "event-plan");
  });

  it("reconciles activity lifetimes against the prior snapshot", () => {
    const current: ActorSnapshot<typeof planDefinition> = {
      ...snapshot,
      operations: [{ descriptor: nestedItem, key: nestedItem.key(1), status: "succeeded" }],
    };

    const result = resultSuccess(
      planTurn<typeof planDefinition>({
        _tag: "projection",
        snapshot: current,
        fence,
        fact: {
          _tag: "stream-projection",
          fact: {
            fence: { actor: fence, descriptor: nestedItem, key: nestedItem.key(1), ordinal: 1 },
            value: "next",
          },
        },
      }),
    );

    assert.strictEqual(result._tag, "projection-plan");

    if (result._tag === "projection-plan") {
      assert.strictEqual(result.candidate.operations.length, 1);
      assert.strictEqual(result.candidate.operations[0]?.status, "running");
    }
  });

  it.effect("cancels removed activity before late completion can apply", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");

      const initial = resultSuccess(
        prepareActorSnapshot(planMachine, {
          ...snapshot,
          lifecycle: "prepared",
          revision: 0,
          observedStoreRevision: 0,
          operations: [{ descriptor: nestedItem, key: nestedItem.key(1), status: "running" }],
        }),
      );

      const prepared = yield* prepareActorEngine({
        identity,
        fence,
        initial,
        scope,
      });

      const engine = yield* prepared.activate();

      const cancelled = engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: { actor: fence, descriptor: nestedItem, key: nestedItem.key(1), ordinal: 1 },
          outcome: { _tag: "interrupt", exit: "removed" },
        },
      });

      assert.ok(Result.isSuccess(cancelled));
      yield* engine.drain();
      const afterCancel = engine.snapshot();
      assert.strictEqual(afterCancel.operations[0]?.status, "cancelled");
      assert.strictEqual(afterCancel.revision, 1);

      const late = engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: { actor: fence, descriptor: nestedItem, key: nestedItem.key(1), ordinal: 1 },
          outcome: { _tag: "success", value: 1 },
        },
      });

      assert.ok(Result.isSuccess(late));
      yield* engine.drain();
      assert.strictEqual(engine.snapshot(), afterCancel);

      const staleIncarnation = engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: {
            // SAFETY: The copied fence deliberately crosses the private incarnation brand to prove stale-owner rejection.
            actor: { ...fence, incarnation: (fence.incarnation + 1) as typeof fence.incarnation },
            descriptor: nestedItem,
            key: nestedItem.key(1),
            ordinal: 2,
          },
          outcome: { _tag: "success", value: 2 },
        },
      });

      assert.ok(Result.isSuccess(staleIncarnation));
      yield* engine.drain();
      assert.strictEqual(engine.snapshot(), afterCancel);
      yield* engine.shutdown("hard");
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it("maps expected planning refusal without running effects", () => {
    const foreignDefinitionResult = definition({
      id: "turn-plan/refusal",
      states: ["idle"],
      events: { opened: "bare" },
    });

    const foreignDefinition = resultSuccess(foreignDefinitionResult);
    const foreignEvent = resultSuccess(foreignDefinition.E.opened());
    // @ts-expect-error This negative proof deliberately crosses the nominal event boundary.
    const result = planTurn(turnInput(foreignEvent));
    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) assert.deepStrictEqual(result.failure.path, ["event"]);
  });

  it("retains planning defects separately from expected refusal", () => {
    const defective = resultSuccess(
      machine(planDefinitionResult, ({ S }) => ({
        default: S.idle,
        states: {
          idle: {
            on: {
              opened: {
                target: S.working,
                actions: () => {
                  throw new Error("planner defect");
                },
              },
            },
          },
          working: {},
          done: {},
        },
      })),
    );

    const result = planTurn({ ...turnInput(opened), machine: defective });
    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) {
      assert.strictEqual(result.failure.code, "Defect");
      assert.deepStrictEqual(result.failure.path, []);
    }
  });

  it.effect("rejects a candidate with a stale actor fence", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const published: ActorSnapshot<typeof planDefinition>[] = [];

      const initial = resultSuccess(
        prepareActorSnapshot(planMachine, {
          ...snapshot,
          lifecycle: "prepared",
          operations: [{ descriptor: nestedItem, key: nestedItem.key(1), status: "running" }],
        }),
      );

      const prepared = yield* prepareActorEngine({
        identity,
        fence,
        initial,
        scope,
        onSnapshot: (next) => published.push(next),
      });

      const engine = yield* prepared.activate();

      const cancelled = engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: { actor: fence, descriptor: nestedItem, key: nestedItem.key(1), ordinal: 1 },
          outcome: { _tag: "interrupt", exit: "removed" },
        },
      });

      assert.ok(Result.isSuccess(cancelled));
      yield* engine.drain();
      const terminal = engine.snapshot();
      assert.strictEqual(terminal.operations[0]?.status, "cancelled");
      assert.strictEqual(terminal.revision, snapshot.revision + 1);

      const late = engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: { actor: fence, descriptor: nestedItem, key: nestedItem.key(1), ordinal: 1 },
          outcome: { _tag: "success", value: 1 },
        },
      });

      assert.ok(Result.isSuccess(late));

      const stale = engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: {
            // SAFETY: A distinct incarnation deliberately crosses the private fence seam.
            actor: { ...fence, incarnation: (fence.incarnation + 1) as typeof fence.incarnation },
            descriptor: nestedItem,
            key: nestedItem.key(1),
            ordinal: 2,
          },
          outcome: { _tag: "success", value: 2 },
        },
      });

      assert.ok(Result.isSuccess(stale));
      yield* engine.drain();
      assert.strictEqual(engine.snapshot(), terminal);
      assert.strictEqual(published.length, 1);
      yield* engine.shutdown("hard");
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it("rejects a candidate with an inconsistent store cut", () => {
    const fact: ProjectionFact = {
      _tag: "store-projection",
      fact: { fence, revision: -1, changed: [] },
    };

    const result = planTurn({ _tag: "projection", snapshot, fence, fact });
    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result))
      assert.deepStrictEqual(result.failure.path, ["projection", "store", "revision"]);
  });

  it("keeps commit revisions and evidence allocation out of the pure plan", () => {
    const plan = resultSuccess(planTurn(turnInput(opened)));
    assert.strictEqual("sequence" in plan, false);
    assert.strictEqual("evidence" in plan, false);
    assert.strictEqual(plan.before.revision, snapshot.revision);

    if (plan._tag === "event-plan") assert.strictEqual(plan.candidate.revision, snapshot.revision);
  });

  it("rejects a timer projection whose deadline precedes its start", () => {
    const result = planTurn({
      _tag: "projection",
      snapshot,
      fence,
      fact: { _tag: "timer-projection", fence, name: "bad", startedAt: 4, dueAt: 3 },
    });

    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) assert.strictEqual(result.failure.code, "SemanticValidation");
  });

  it("preserves descriptor identity in stream projection plans", () => {
    const result = resultSuccess(
      planTurn<typeof planDefinition>({
        _tag: "projection",
        snapshot,
        fence,
        fact: {
          _tag: "stream-projection",
          fact: {
            fence: { actor: fence, descriptor: nestedItem, key: nestedItem.key(2), ordinal: 1 },
            value: 42,
          },
        },
      }),
    );

    assert.strictEqual(result._tag, "projection-plan");

    if (result._tag === "projection-plan") {
      assert.strictEqual(result.candidate.operations[0]?.descriptor, nestedItem);
      assert.deepStrictEqual(result.candidate.operations[0]?.key, nestedItem.key(2));
    }
  });

  it("coalesces equal context revisions in a plan", () => {
    const provider = {
      fence: contextFence,
      slot: "provider",
      revision: 1,
      value: contextProviderDefinition.S.ready,
    };

    const carrier: ContextProjectionCarrier = {
      providers: [provider],
      issueOnly: false,
      selectorDefects: [],
    };

    const result = resultSuccess(
      planTurn<typeof contextConsumerDefinition>({
        _tag: "projection",
        snapshot: contextSnapshot,
        fence: contextFence,
        fact: {
          _tag: "context-projection",
          provider: { ...provider, value: carrier },
          projection: carrier,
        },
      }),
    );

    assert.strictEqual(result._tag, "noop");
    assert.strictEqual(result.before.context.provider, contextProviderDefinition.S.ready);
  });

  it("retains the last valid context through selector defect", () => {
    const diagnostic = Failure({
      code: "InvariantViolation" as const,
      path: ["context"],
      details: {},
      summary: "selector",
      help: "inspect selector",
    });

    const provider = {
      fence: contextFence,
      slot: "provider",
      revision: 2,
      value: contextProviderDefinition.S.changed,
    };

    const carrier: ContextProjectionCarrier = {
      providers: [provider],
      issueOnly: true,
      selectorDefects: [diagnostic],
    };

    const result = resultSuccess(
      planTurn<typeof contextConsumerDefinition>({
        _tag: "projection",
        snapshot: contextSnapshot,
        fence: contextFence,
        fact: {
          _tag: "context-projection",
          provider: { ...provider, value: carrier },
          projection: carrier,
        },
      }),
    );

    assert.strictEqual(result._tag, "projection-plan");

    if (result._tag === "projection-plan") {
      assert.strictEqual(result.candidate.context.provider, contextProviderDefinition.S.changed);
      assert.strictEqual(result.candidate.issues[0], diagnostic);
    }
  });

  it("retains absolute timer deadlines in the candidate plan", () => {
    const result = resultSuccess(
      planTurn({
        _tag: "projection",
        snapshot,
        fence,
        fact: { _tag: "timer-projection", fence, name: "deadline", startedAt: 10, dueAt: 100 },
      }),
    );

    assert.strictEqual(result._tag, "projection-plan");

    if (result._tag === "projection-plan")
      assert.deepStrictEqual(result.candidate.timers, [
        { name: "deadline", startedAt: 10, dueAt: 100 },
      ]);
  });

  it("plans suspension with cancellation before publication", () => {
    const result = resultSuccess(
      planTurn({
        _tag: "projection",
        snapshot,
        fence,
        fact: { _tag: "lifecycle-projection", fence, lifecycle: "suspended" },
      }),
    );

    assert.strictEqual(result._tag, "projection-plan");

    if (result._tag === "projection-plan")
      assert.strictEqual(result.candidate.lifecycle, "suspended");
  });

  it("keeps a valid no-op plan free of synthetic changes", () => {
    const result = resultSuccess(
      planTurn({
        _tag: "projection",
        snapshot,
        fence,
        fact: { _tag: "lifecycle-projection", fence, lifecycle: snapshot.lifecycle },
      }),
    );

    assert.strictEqual(result._tag, "noop");
    assert.strictEqual(result.before.revision, snapshot.revision);
  });

  it("plans independently from the same captured pre-turn snapshot", () => {
    const first = resultSuccess(planTurn(turnInput(opened)));
    const second = resultSuccess(planTurn(turnInput(opened, first.before)));
    assert.notStrictEqual(first, second);
    assert.deepStrictEqual(first.before, second.before);
  });

  it("validates mapped event envelopes before scheduling them", () => {
    const result = resultSuccess(planTurn(turnInput(opened)));
    assert.strictEqual(result._tag, "event-plan");

    if (result._tag === "event-plan") {
      assert.strictEqual(result.mappedEvents.length, 1);
      assert.strictEqual(result.mappedEvents[0]?.type, mapped.type);
      assert.strictEqual(result.mappedEvents[0], mapped);
    }
  });
});
