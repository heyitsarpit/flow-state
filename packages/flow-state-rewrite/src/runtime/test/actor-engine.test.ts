// oxlint-disable-next-line anti-slop/no-large-production-file -- this suite proves snapshot admission, prepared mailbox activation, turns, and publication ordering across one actor engine; splitting would duplicate fixtures and fragment lifecycle assertions.
import { assert, describe, it } from "@effect/vitest";
import { Cause, Clock, Deferred, Effect, Exit, Fiber, Result, Scope, type Types } from "effect";

import { app, appPlan, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import {
  Diagnostic,
  Failure,
  Interrupt,
  type PublicDiagnostic,
} from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import type { OperationKey } from "../../operation/key.js";
import { actorRef } from "../actor-ref.js";
import {
  ACTOR_MAILBOX_CAPACITY,
  actorHandle,
  fenceActorFact,
  prepareActorSnapshot,
  prepareActorEngine,
  makeActorStoreResult,
  type AcknowledgedDispatch,
  type ActorEngine,
  type ActorCommand,
  type ActorEngineInput,
  type ActorMailboxFact,
  type ActorPublication,
  type ActorSnapshot,
  type ActorStoreResult,
} from "../actor-engine.js";
import { makeActorIdentityRegistry, type ActorFence } from "../actor-admission.js";
import { makeRuntimeEvidenceOwner, type EvidenceRecord } from "../evidence.js";
import { makeEvidenceSink } from "../evidence-sink.js";
import { runtimeOwner, runtimeSetup } from "../runtime.js";
import type {
  ContextProjectionCarrier,
  OperationOccurrenceFence,
  ProjectionFact,
} from "../turn-plan.js";

const resultSuccess = <Value, Error>(result: Result.Result<Value, Error>) => {
  if (Result.isFailure(result)) throw result.failure;

  return result.success;
};

const makeTestClock = (currentTimeMillisUnsafe: () => number): Clock.Clock => {
  const currentTimeNanosUnsafe = () => BigInt(currentTimeMillisUnsafe()) * 1_000_000n;

  return {
    currentTimeMillisUnsafe,
    currentTimeMillis: Effect.sync(currentTimeMillisUnsafe),
    currentTimeNanosUnsafe,
    currentTimeNanos: Effect.sync(currentTimeNanosUnsafe),
    monotonicTimeNanosUnsafe: currentTimeNanosUnsafe,
    monotonicTimeNanos: Effect.sync(currentTimeNanosUnsafe),
    sleep: () => Effect.void,
  };
};

const definitionResult = definition({
  id: "actor-engine/test",
  states: ["ready"],
  events: { opened: "bare", closed: "bare" },
  operations: {
    item: resource({
      id: "actor-engine/item",
      key: (value: number) => [value] as const,
      lookup: (value: number, _options) => Effect.succeed(value),
    }),
    nestedItem: resource({
      id: "actor-engine/nested-item",
      key: (value: number) => [{ value }] as const,
      lookup: (value: number, _options) => Effect.succeed(value),
    }),
  },
});

const testDefinition = resultSuccess(definitionResult);

const testMachine = resultSuccess(
  machine(definitionResult, ({ S, O }) => ({
    default: S.ready,
    states: {
      ready: {
        on: { opened: { target: S.ready, actions: () => O.item.lookup(1) } },
      },
    },
  })),
);

const memoryDefinitionResult = definition({
  id: "actor-engine/memory",
  states: ["ready"],
  events: {},
  memory: () => ({
    nested: { count: 1 },
    list: [{ label: "initial" }],
  }),
});

const memoryDefinition = resultSuccess(memoryDefinitionResult);

const memoryMachine = resultSuccess(
  machine(memoryDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const testApp = app({
  id: "actor-engine/app",
  persistenceVersion: "1",
  modules: [module({ id: "actor-engine/module", machines: { test: testMachine } })],
});

void testApp;

const makeInput = (
  scope: Scope.Scope,
  onCommand: ActorEngineInput<typeof testDefinition>["onCommand"],
) => {
  const registry = makeActorIdentityRegistry();
  const ref = actorRef(testMachine, "editor");
  const identity = resultSuccess(registry.reserveStable(ref));

  const fence: ActorFence = {
    key: identity.key,
    incarnation: identity.incarnation,
    generation: 0,
    leaseEpoch: identity.leaseEpoch,
  };

  const initial: ActorSnapshot<typeof testDefinition> = {
    state: testDefinition.S.ready,
    memory: {},
    context: {},
    lifecycle: "prepared",
    operations: [],
    timers: [],
    issues: [],
    revision: 0,
    observedStoreRevision: 0,
  };

  return {
    input: {
      identity,
      fence,
      initial: resultSuccess(prepareActorSnapshot(testMachine, initial)),
      scope,
      onCommand,
    },
    ref,
    registry,
  };
};

const opened = resultSuccess(testDefinition.E.opened());

const closed = resultSuccess(testDefinition.E.closed());

const contextProviderDefinitionResult = definition({
  id: "actor-engine/context-provider",
  states: ["ready", "changed"],
  events: {},
});

const contextProviderDefinition = resultSuccess(contextProviderDefinitionResult);

const contextConsumerDefinitionResult = definition({
  id: "actor-engine/context-consumer",
  states: ["ready"],
  events: { opened: "bare" },
  context: {
    left: contextProviderDefinition.select(({ state }) => state),
    right: contextProviderDefinition.select(({ state }) => state),
  },
});

const contextConsumerDefinition = resultSuccess(contextConsumerDefinitionResult);

const contextConsumerMachine = resultSuccess(
  machine(contextConsumerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const makeContextInput = (
  scope: Scope.Scope,
  onCommand: ActorEngineInput<typeof contextConsumerDefinition>["onCommand"],
) => {
  const registry = makeActorIdentityRegistry();
  const ref = actorRef(contextConsumerMachine, "editor");
  const identity = resultSuccess(registry.reserveStable(ref));

  const fence: ActorFence = {
    key: identity.key,
    incarnation: identity.incarnation,
    generation: 0,
    leaseEpoch: identity.leaseEpoch,
  };

  const initial: ActorSnapshot<typeof contextConsumerDefinition> = {
    state: contextConsumerDefinition.S.ready,
    memory: {},
    context: {
      left: contextProviderDefinition.S.ready,
      right: contextProviderDefinition.S.ready,
    },
    lifecycle: "prepared",
    operations: [],
    timers: [],
    issues: [],
    revision: 0,
    observedStoreRevision: 0,
  };

  return {
    input: {
      identity,
      fence,
      initial: resultSuccess(prepareActorSnapshot(contextConsumerMachine, initial)),
      scope,
      onCommand,
    },
  };
};

const assertMailboxThrows = (action: () => void, reason: "closed" | "full") => {
  try {
    action();
    assert.fail(`Expected a ${reason} mailbox admission failure`);
  } catch (error) {
    assert.ok(error instanceof Error);

    if (error instanceof Error)
      assert.strictEqual(
        error.message.includes(
          reason === "closed" ? "Actor mailbox is closed" : "Actor mailbox is full",
        ),
        true,
      );
  }
};

const failureFromExit = <Value, Error>(exit: Exit.Exit<Value, Error>) => {
  assert.ok(Exit.isFailure(exit));
  const reason = exit.cause.reasons.find(Cause.isFailReason);
  assert.ok(reason !== undefined);

  return reason.error;
};

// Contracts: ARCH-012, SEM-001, SEM-004, SEM-010, SEM-024A.
// Proofs: PROOF-003, PROOF-004, HOST-P05.

const diagnosticClassification = (kind: "failure" | "defect" | "interrupt") => {
  switch (kind) {
    case "failure":
      return "Failure" as const;
    case "defect":
      return "Defect" as const;
    case "interrupt":
      return "Interruption" as const;
  }
};

describe("actor engine", () => {
  it("admits one exact prepared snapshot seam and rejects malformed truth", () => {
    const scope = Scope.makeUnsafe("sequential");
    const setup = makeInput(scope, () => Effect.void);
    const prepared = setup.input.initial;
    const admitted = prepareActorSnapshot(testMachine, prepared);
    assert.ok(Result.isSuccess(admitted));

    if (Result.isSuccess(admitted)) {
      assert.notStrictEqual(admitted.success, prepared);
    }

    const malformed = [
      { path: ["state"], snapshot: { ...prepared, state: { forged: true } } },
      { path: ["lifecycle"], snapshot: { ...prepared, lifecycle: "active" } },
      { path: ["context"], snapshot: { ...prepared, context: { forged: true } } },
      { path: ["revision"], snapshot: { ...prepared, revision: -1 } },
      {
        path: ["issues", 0],
        snapshot: { ...prepared, issues: [Object.create(Diagnostic.prototype)] },
      },
    ];

    for (const candidate of malformed) {
      const result = prepareActorSnapshot(testMachine, candidate.snapshot);
      assert.ok(Result.isFailure(result));

      if (Result.isFailure(result)) assert.deepStrictEqual(result.failure.path, candidate.path);
    }
  });

  it("captures data properties before copying a prepared snapshot", () => {
    const setup = makeInput(Scope.makeUnsafe("sequential"), () => Effect.void);
    let stateReads = 0;

    const proxy = new Proxy(
      { ...setup.input.initial },
      {
        get(target, property, receiver) {
          if (property === "state") {
            stateReads += 1;

            return stateReads === 1 ? setup.input.initial.state : { forged: true };
          }

          // SAFETY: This proxy forwards all non-state reads unchanged while the state getter is the hostile seam under test.
          // oxlint-disable-next-line anti-slop/no-reflect-get -- the proxy forwards arbitrary property reads for the negative proof.
          return Reflect.get(target, property, receiver);
        },
      },
    );

    const prepared = prepareActorSnapshot(testMachine, proxy);
    assert.ok(Result.isSuccess(prepared));

    if (Result.isSuccess(prepared)) {
      assert.strictEqual(prepared.success.state, setup.input.initial.state);
      assert.strictEqual(stateReads, 0);
    }
  });

  it("recursively owns memory and issue data and rejects unsupported values", () => {
    const sourceMemory = {
      nested: { count: 1 },
      list: [{ label: "initial" }],
    };

    const sourceIssue = Failure({
      code: "InvariantViolation",
      path: ["memory"],
      details: { reason: "source" },
      summary: "Source issue",
      help: "Keep the source issue owned.",
    });

    const initial: ActorSnapshot<typeof memoryDefinition> = {
      state: memoryDefinition.S.ready,
      memory: sourceMemory,
      context: {},
      lifecycle: "prepared",
      operations: [],
      timers: [],
      issues: [sourceIssue],
      revision: 0,
      observedStoreRevision: 0,
    };

    const prepared = prepareActorSnapshot(memoryMachine, initial);
    assert.ok(Result.isSuccess(prepared));

    if (Result.isSuccess(prepared)) {
      assert.notStrictEqual(prepared.success.memory.nested, sourceMemory.nested);
      assert.notStrictEqual(prepared.success.memory.list, sourceMemory.list);
      assert.notStrictEqual(prepared.success.memory.list[0], sourceMemory.list[0]);
      assert.notStrictEqual(prepared.success.issues[0], sourceIssue);

      sourceMemory.nested.count = 9;
      sourceMemory.list[0]!.label = "mutated";
      Reflect.set(sourceIssue.path, "0", "mutated");
      Reflect.set(sourceIssue.details, "reason", "mutated");
      assert.strictEqual(prepared.success.memory.nested.count, 1);
      assert.strictEqual(prepared.success.memory.list[0]?.label, "initial");
      assert.deepStrictEqual(prepared.success.issues[0]?.path, ["memory"]);
      assert.deepStrictEqual(prepared.success.issues[0]?.details, { reason: "source" });

      const replay = prepareActorSnapshot(memoryMachine, prepared.success);
      assert.ok(Result.isSuccess(replay));

      if (Result.isSuccess(replay)) assert.deepStrictEqual(replay.success, prepared.success);
    }

    const invalidMemory = prepareActorSnapshot(memoryMachine, {
      ...initial,
      memory: { invalid: new Date() },
    });

    assert.ok(Result.isFailure(invalidMemory));

    if (Result.isFailure(invalidMemory))
      assert.deepStrictEqual(invalidMemory.failure.path, ["memory", "invalid"]);

    const invalidContext = prepareActorSnapshot(contextConsumerMachine, {
      ...makeContextInput(Scope.makeUnsafe("sequential"), () => Effect.void).input.initial,
      context: { left: new Date(), right: contextProviderDefinition.S.ready },
    });

    assert.ok(Result.isFailure(invalidContext));

    if (Result.isFailure(invalidContext))
      assert.deepStrictEqual(invalidContext.failure.path, ["context", "left"]);
  });

  it.effect("rejects an unbranded initial snapshot before engine publication", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const setup = makeInput(scope, () => Effect.void);
      const published: ActorSnapshot<typeof testDefinition>[] = [];

      const forged = {
        ...setup.input.initial,
        lifecycle: "active",
      };

      const configured: ActorEngineInput<typeof testDefinition> = {
        ...setup.input,
        // SAFETY: This is the adversarial unbranded snapshot passed through a runtime cast.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- negative proof for the private prepared seam.
        initial: forged as ActorEngineInput<typeof testDefinition>["initial"],
        onSnapshot: (snapshot) => published.push(snapshot),
      };

      const prepared = yield* Effect.exit(prepareActorEngine(configured));
      assert.ok(Exit.isFailure(prepared));

      if (Exit.isFailure(prepared)) {
        const failure = prepared.cause.reasons.find(Cause.isFailReason);
        assert.ok(failure !== undefined);
        assert.strictEqual(failure.error.code, "InvariantViolation");
        assert.deepStrictEqual(failure.error.path, []);
      }

      assert.deepStrictEqual(published, []);
    }),
  );

  it.effect("accepts a 64-command FIFO prefix and activates one consumer behind a barrier", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const processed: string[] = [];
      const firstStarted = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const drained = yield* Deferred.make<void>();

      const setup = makeInput(scope, (command) =>
        Effect.gen(function* () {
          processed.push(command.type);

          if (processed.length === 1) {
            yield* Deferred.succeed(firstStarted, undefined);
            yield* Deferred.await(releaseFirst);
          }

          if (processed.length === ACTOR_MAILBOX_CAPACITY + 1) {
            yield* Deferred.succeed(drained, undefined);
          }
        }),
      );

      const prepared = yield* prepareActorEngine(setup.input);

      const buffered = Array.from({ length: ACTOR_MAILBOX_CAPACITY }, (_, index) =>
        index % 2 === 0 ? opened : closed,
      );

      for (const command of buffered) prepared.send(command);
      assert.deepStrictEqual(processed, []);
      assertMailboxThrows(() => prepared.send(closed), "full");

      const engine = yield* prepared.activate();
      const handle = actorHandle(engine);
      yield* Deferred.await(firstStarted);
      prepared.send(opened);
      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Deferred.await(drained);
      assert.deepStrictEqual(processed, [...buffered.map((command) => command.type), opened.type]);
      assert.strictEqual(Object.keys(handle).sort().join(","), "ref,send");
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("abandons without delivering buffered commands and rejects later sends", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const processed: string[] = [];
      const setup = makeInput(scope, (command) => Effect.sync(() => processed.push(command.type)));
      const prepared = yield* prepareActorEngine(setup.input);
      prepared.send(opened);
      prepared.send(closed);
      prepared.abandon();

      assert.deepStrictEqual(processed, []);
      assertMailboxThrows(() => prepared.send(opened), "closed");
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("returns a cached typed failure when activation follows abandonment", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const setup = makeInput(scope, () => Effect.void);
      const prepared = yield* prepareActorEngine(setup.input);

      prepared.abandon();
      yield* Scope.close(scope, Exit.void);

      const firstExit = yield* Effect.exit(prepared.activate());
      const secondExit = yield* Effect.exit(prepared.activate());

      assert.ok(Exit.isFailure(firstExit));
      assert.ok(Exit.isFailure(secondExit));

      if (Exit.isFailure(firstExit) && Exit.isFailure(secondExit)) {
        assert.strictEqual(Cause.hasDies(firstExit.cause), false);
        assert.strictEqual(Cause.hasDies(secondExit.cause), false);

        const firstFailure = failureFromExit(firstExit);
        const secondFailure = failureFromExit(secondExit);
        assert.ok(firstFailure instanceof Diagnostic);
        assert.strictEqual(firstFailure.code, "InvariantViolation");
        assert.deepStrictEqual(firstFailure.path, ["mailbox", "closed"]);
        assert.strictEqual(secondFailure, firstFailure);
      }
    }),
  );

  it.effect("makes projection mailbox overflow explicit", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const firstStarted = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();

      const setup = makeInput(scope, (command) =>
        Effect.gen(function* () {
          if (command === opened) {
            yield* Deferred.succeed(firstStarted, undefined);
            yield* Deferred.await(releaseFirst);
          }
        }),
      );

      const engine = yield* (yield* prepareActorEngine(setup.input)).activate();
      engine.send(opened);
      yield* Deferred.await(firstStarted);

      for (let index = 0; index < ACTOR_MAILBOX_CAPACITY; index += 1) engine.send(closed);

      const overflow = engine.dispatchFact({
        _tag: "timer-projection",
        fence: setup.input.fence,
        name: "refresh",
        startedAt: 1,
        dueAt: 2,
      });

      assert.ok(Result.isFailure(overflow));

      if (Result.isFailure(overflow)) {
        assert.strictEqual(overflow.failure.code, "InvariantViolation");
        assert.deepStrictEqual(overflow.failure.path, ["mailbox", "full"]);
      }

      assert.strictEqual(engine.snapshot().revision, 1);
      yield* Deferred.succeed(releaseFirst, undefined);
      yield* engine.drain();
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("keeps the public send exact-typed and synchronous", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const setup = makeInput(scope, () => Effect.void);
      const prepared = yield* prepareActorEngine(setup.input);
      const engine = yield* prepared.activate();
      const handle = actorHandle(engine);
      // RETURN_TYPE: This local proof fixes the public send signature to synchronous void.
      const send = (command: ActorCommand<typeof testDefinition>): void => handle.send(command);
      const result: Types.Equals<ReturnType<typeof send>, void> = true;
      void result;
      send(opened);
      // @ts-expect-error EventOf is nominal and cannot accept a structural event record.
      send({ type: opened.type });
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("rejects sends after active shutdown without exposing an async result", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const setup = makeInput(scope, () => Effect.void);
      const engine = yield* (yield* prepareActorEngine(setup.input)).activate();
      yield* engine.shutdown();
      assertMailboxThrows(() => engine.send(opened), "closed");
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("joins repeated activation calls to one engine and one consumer", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const processed: string[] = [];
      const done = yield* Deferred.make<void>();

      const setup = makeInput(scope, (command) =>
        Effect.gen(function* () {
          processed.push(command.type);
          yield* Deferred.succeed(done, undefined);
        }),
      );

      const prepared = yield* prepareActorEngine(setup.input);
      const first = yield* prepared.activate();
      const second = yield* prepared.activate();

      assert.strictEqual(second, first);
      first.send(opened);
      yield* Deferred.await(done);
      assert.deepStrictEqual(processed, [opened.type]);
      yield* first.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("closes admission when the sole consumer fails", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const entered = yield* Deferred.make<void>();

      const failure = Failure({
        code: "InvariantViolation",
        path: ["actor-engine"],
        details: {},
        summary: "consumer failed",
        help: "Inspect the actor engine failure.",
      });

      const setup = makeInput(scope, () =>
        Effect.gen(function* () {
          yield* Deferred.succeed(entered, undefined);
          yield* Effect.fail(failure);
        }),
      );

      const engine = yield* (yield* prepareActorEngine(setup.input)).activate();
      engine.send(opened);
      yield* Deferred.await(entered);
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assertMailboxThrows(() => engine.send(closed), "closed");
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("keeps normal and reentrant sends in one FIFO order", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const firstStarted = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const processed: string[] = [];
      const processedAll = yield* Deferred.make<void>();
      let sendReentrant: (command: ActorCommand<typeof testDefinition>) => void = () => undefined;

      const setup = makeInput(scope, (command) =>
        Effect.gen(function* () {
          processed.push(command.type);

          if (processed.length === 1) {
            yield* Deferred.succeed(firstStarted, undefined);
            yield* Deferred.await(releaseFirst);
            sendReentrant(opened);
          }

          if (processed.length === 3) yield* Deferred.succeed(processedAll, undefined);
        }),
      );

      const engine = yield* (yield* prepareActorEngine(setup.input)).activate();
      sendReentrant = engine.send;

      engine.send(opened);
      yield* Deferred.await(firstStarted);
      engine.send(closed);
      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Deferred.await(processedAll);

      assert.deepStrictEqual(processed, [opened.type, closed.type, opened.type]);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("discards stale incarnation, generation, and lease facts before planning", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const processed: string[] = [];
      const processedOne = yield* Deferred.make<void>();

      const setup = makeInput(scope, (command) =>
        Effect.gen(function* () {
          processed.push(command.type);

          if (processed.length === 1) yield* Deferred.succeed(processedOne, undefined);
        }),
      );

      const engine = yield* (yield* prepareActorEngine(setup.input)).activate();
      setup.registry.rollback(setup.input.identity);
      const nextIdentity = resultSuccess(setup.registry.reserveStable(setup.ref));

      const staleFacts: Extract<ActorMailboxFact<typeof testDefinition>, { _tag: "command" }>[] = [
        {
          _tag: "command" as const,
          fence: { ...setup.input.fence, incarnation: nextIdentity.incarnation },
          command: opened,
        },
        {
          _tag: "command" as const,
          fence: { ...setup.input.fence, generation: 1 },
          command: opened,
        },
        {
          _tag: "command" as const,
          fence: { ...setup.input.fence, leaseEpoch: 1 },
          command: opened,
        },
      ];

      for (const fact of staleFacts) {
        assert.strictEqual(
          fenceActorFact<typeof testDefinition>(setup.input.fence, fact)._tag,
          "discarded",
        );
        assert.ok(
          Result.isSuccess(
            engine.dispatchFact({
              _tag: "timer-projection",
              fence: fact.fence,
              name: "stale",
              startedAt: 1,
              dueAt: 2,
            }),
          ),
        );
      }

      yield* engine.drain();
      assert.deepStrictEqual(processed, []);

      engine.send(closed);
      yield* Deferred.await(processedOne);
      assert.deepStrictEqual(processed, [closed.type]);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("acknowledges the committed cut before user work begins", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const order: string[] = [];
      const committedActions: unknown[] = [];
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      let preparedEvidence: ActorPublication<typeof testDefinition> | undefined;
      let acknowledgedDispatch: AcknowledgedDispatch | undefined;
      let storeRevision = 0;
      let validatedActorStoreResult: ActorStoreResult<typeof testDefinition> | undefined;
      const commandStarted = yield* Deferred.make<void>();
      const releaseCommand = yield* Deferred.make<void>();

      const evidence = makeRuntimeEvidenceOwner({
        app: testApp,
        plan: appPlan(testApp),
        clock: makeTestClock(() => 4_242),
      });

      const records: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "actor-cut-order",
        deliver: (record) => Effect.sync(() => records.push(record)),
      });

      assert.ok(Result.isSuccess(evidence.journal.attach(sink)));

      const setup = makeInput(scope, () =>
        Effect.gen(function* () {
          assert.ok(acknowledgedDispatch !== undefined);
          assert.strictEqual(Deferred.isDoneUnsafe(acknowledgedDispatch.completion), true);
          order.push("command");
          yield* Deferred.succeed(commandStarted, undefined);
          yield* Deferred.await(releaseCommand);
        }),
      );

      const configured: ActorEngineInput<typeof testDefinition> = {
        ...setup.input,
        store: {
          commit: (actions) => {
            order.push("store");
            committedActions.push(...actions);
            storeRevision += 1;

            const validated = makeActorStoreResult<typeof testDefinition>({
              revision: storeRevision,
              changed: [{ descriptor: testDefinition.operations.item, key: [1] }],
            });

            if (Result.isFailure(validated)) return Result.fail(validated.failure);
            validatedActorStoreResult = validated.success;

            return Result.succeed(validated.success);
          },
        },
        onSnapshot: (snapshot) => {
          order.push("snapshot");
          published.push(snapshot);
          assert.ok(acknowledgedDispatch !== undefined);
          assert.strictEqual(Deferred.isDoneUnsafe(acknowledgedDispatch.completion), true);
        },
        acceptEvidence: (publication, before, phase) => {
          order.push("evidence");
          preparedEvidence = publication;
          assert.strictEqual(publication.publicationRevision, 1);
          assert.strictEqual(publication.machineTurnRevision, 1);
          assert.strictEqual(publication.store.revision, 0);

          return (phase === "prepare" ? evidence.preparePublication : evidence.acceptPublication)(
            setup.input.identity,
            setup.input.fence,
            before,
            publication,
          );
        },
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();

      const accepted = engine.dispatch(opened);
      acknowledgedDispatch = accepted;
      assert.strictEqual(accepted.admitted, true);
      const receipt = yield* Deferred.await(accepted.completion);
      yield* Deferred.await(commandStarted);

      assert.deepStrictEqual(receipt, { publicationRevision: 1, evidenceSequence: 1 });
      assert.strictEqual(committedActions.length, 1);
      assert.strictEqual(published.length, 1);
      assert.deepStrictEqual(order.slice(0, 3), ["evidence", "store", "snapshot"]);
      assert.strictEqual(order.indexOf("evidence") < order.indexOf("command"), true);
      assert.ok(preparedEvidence !== undefined);
      assert.strictEqual(published[0]?.revision, 1);
      assert.strictEqual(published[0]?.observedStoreRevision, 1);
      assert.ok(validatedActorStoreResult !== undefined);
      assert.ok(validatedActorStoreResult.changed.length > 0);
      assert.ok(validatedActorStoreResult.revision > setup.input.initial.observedStoreRevision);
      assert.strictEqual(records.length, 0);
      yield* evidence.journal.drain();
      const record = records[0];
      assert.ok(record?._tag === "turn");

      if (record?._tag === "turn") {
        assert.strictEqual(record.store.revision, validatedActorStoreResult.revision);
        assert.deepStrictEqual(record.store.changed, validatedActorStoreResult.changed);
        assert.strictEqual(published[0]?.observedStoreRevision, validatedActorStoreResult.revision);
      }

      yield* Deferred.succeed(releaseCommand, undefined);
      yield* engine.drain();
      const beforeNoop = published.length;
      const noop = engine.dispatch(closed);
      const noopReceipt = yield* Deferred.await(noop.completion);
      yield* engine.drain();
      assert.deepStrictEqual(noopReceipt, { publicationRevision: 1, evidenceSequence: 1 });
      assert.strictEqual(published.length, beforeNoop);
      assert.strictEqual(order.filter((entry) => entry === "command").length, 2);
      yield* evidence.close();
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("retains the prior cut after evidence preflight failure and retries later", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const order: string[] = [];
      let failTimestamp = true;
      let storeCalls = 0;
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const evidence = makeRuntimeEvidenceOwner({
        app: testApp,
        plan: appPlan(testApp),
        clock: makeTestClock(() => {
          if (failTimestamp) {
            failTimestamp = false;
            // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- the clock fixture deliberately defects during preparation.
            throw new Error("timestamp failure");
          }

          return 4_242;
        }),
      });

      const configured: ActorEngineInput<typeof testDefinition> = {
        ...setup.input,
        store: {
          commit: () => {
            order.push("store");
            storeCalls += 1;

            return Result.succeed({ revision: storeCalls, changed: [] });
          },
        },
        acceptEvidence: (publication, before, phase) => {
          order.push("evidence");

          const accepted = (
            phase === "prepare" ? evidence.preparePublication : evidence.acceptPublication
          )(setup.input.identity, setup.input.fence, before, publication);

          return accepted;
        },
        onSnapshot: (snapshot) => {
          order.push("snapshot");
          published.push(snapshot);
        },
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();

      const failed = engine.dispatch(opened);
      const failedExit = yield* Effect.exit(Deferred.await(failed.completion));
      yield* engine.drain();

      assert.ok(Exit.isFailure(failedExit));
      assert.strictEqual(storeCalls, 0);
      assert.deepStrictEqual(order, ["evidence", "evidence", "snapshot"]);
      assert.strictEqual(published.length, 1);
      assert.strictEqual(published[0]?.revision, 1);
      assert.strictEqual(published[0]?.observedStoreRevision, 0);
      assert.strictEqual(engine.snapshot().observedStoreRevision, 0);

      const retried = engine.dispatch(opened);
      const receipt = yield* Deferred.await(retried.completion);
      yield* engine.drain();

      assert.deepStrictEqual(receipt, { publicationRevision: 2, evidenceSequence: 2 });
      assert.strictEqual(storeCalls, 1);
      assert.deepStrictEqual(order, [
        "evidence",
        "evidence",
        "snapshot",
        "evidence",
        "store",
        "snapshot",
      ]);
      assert.strictEqual(engine.snapshot().observedStoreRevision, 1);
      assert.strictEqual(published.length, 2);
      yield* evidence.close();
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("persists machine-turn revisions across successful event turns", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      let storeRevision = 0;
      let commandCalls = 0;
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      const evidenceMachineRevisions: number[] = [];

      const setup = makeInput(scope, () => {
        commandCalls += 1;

        return Effect.void;
      });

      const configured: ActorEngineInput<typeof testDefinition> = {
        ...setup.input,
        store: {
          commit: () => {
            storeRevision += 1;

            return Result.succeed({ revision: storeRevision, changed: [] });
          },
        },
        onSnapshot: (snapshot) => published.push(snapshot),
        acceptEvidence: (publication) => {
          evidenceMachineRevisions.push(publication.machineTurnRevision);

          return Result.succeed(evidenceMachineRevisions.length);
        },
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();

      const first = engine.dispatch(opened);
      const firstReceipt = yield* Deferred.await(first.completion);
      const second = engine.dispatch(opened);
      const secondReceipt = yield* Deferred.await(second.completion);
      yield* engine.drain();

      assert.deepStrictEqual(firstReceipt, { publicationRevision: 1, evidenceSequence: 1 });
      assert.deepStrictEqual(secondReceipt, { publicationRevision: 2, evidenceSequence: 2 });
      assert.deepStrictEqual(
        published.map((snapshot) => snapshot.revision),
        [1, 2],
      );
      assert.deepStrictEqual(
        published.map((snapshot) => snapshot.observedStoreRevision),
        [1, 2],
      );
      assert.deepStrictEqual(evidenceMachineRevisions, [1, 2]);
      assert.strictEqual(commandCalls, 2);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("rejects a stale validated store result without changing the committed cut", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const setup = makeInput(scope, () => Effect.void);

      const evidence = makeRuntimeEvidenceOwner({
        app: testApp,
        plan: appPlan(testApp),
        clock: makeTestClock(() => 7_000),
      });

      let storeCalls = 0;
      const observed: ActorSnapshot<typeof testDefinition>[] = [];

      const engine = yield* (yield* prepareActorEngine({
        ...setup.input,
        store: {
          commit: () => {
            storeCalls += 1;
            const revision = storeCalls === 2 ? 0 : storeCalls === 1 ? 1 : 2;

            return makeActorStoreResult<typeof testDefinition>({ revision, changed: [] });
          },
        },
        acceptEvidence: (publication, before, phase) =>
          (phase === "prepare" ? evidence.preparePublication : evidence.acceptPublication)(
            setup.input.identity,
            setup.input.fence,
            before,
            publication,
          ),
        onSnapshot: (snapshot) => observed.push(snapshot),
      })).activate();

      const first = yield* Deferred.await(engine.dispatch(opened).completion);
      assert.deepStrictEqual(first, { publicationRevision: 1, evidenceSequence: 1 });
      const beforeStale = engine.snapshot();
      const stale = yield* Effect.exit(Deferred.await(engine.dispatch(opened).completion));
      assert.ok(Exit.isFailure(stale));
      assert.strictEqual(engine.snapshot(), beforeStale);
      assert.strictEqual(engine.machineTurnRevision(), 1);
      assert.strictEqual(evidence.journal.sequence(), 1);
      assert.strictEqual(observed.length, 1);

      const retried = yield* Deferred.await(engine.dispatch(opened).completion);
      assert.deepStrictEqual(retried, { publicationRevision: 2, evidenceSequence: 2 });
      assert.strictEqual(engine.snapshot().observedStoreRevision, 2);
      assert.strictEqual(storeCalls, 3);
      yield* evidence.close();
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("publishes one issue-only cut for typed failures, defects, and interruptions", () =>
    Effect.gen(function* () {
      const typedFailure = Failure({
        code: "SchemaValidation",
        path: ["store"],
        details: { issue: "typed" },
        summary: "typed store failure",
        help: "Repair the store cut.",
      });

      const cases = ["failure", "defect", "interrupt"] as const;

      for (const kind of cases) {
        const scope = yield* Scope.make("sequential");
        let storeCalls = 0;
        let commandCalls = 0;
        const published: ActorSnapshot<typeof testDefinition>[] = [];
        const evidenceMachineRevisions: number[] = [];

        const setup = makeInput(scope, () => {
          commandCalls += 1;

          return Effect.void;
        });

        const configured: ActorEngineInput<typeof testDefinition> = {
          ...setup.input,
          store: {
            commit: () => {
              storeCalls += 1;

              if (kind === "failure") return Result.fail(typedFailure);

              if (kind === "interrupt") return Result.fail(Interrupt());
              // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- this fixture proves raw store defects are classified.
              throw new Error("raw store defect");
            },
          },
          onSnapshot: (snapshot) => published.push(snapshot),
          acceptEvidence: (publication) => {
            evidenceMachineRevisions.push(publication.machineTurnRevision);

            return Result.succeed(evidenceMachineRevisions.length);
          },
        };

        const engine = yield* (yield* prepareActorEngine(configured)).activate();
        const dispatched = engine.dispatch(opened);
        const firstExit = yield* Effect.exit(Deferred.await(dispatched.completion));
        const repeatedExit = yield* Effect.exit(Deferred.await(dispatched.completion));
        yield* engine.drain();
        const error = failureFromExit(firstExit);

        assert.deepStrictEqual(repeatedExit, firstExit);
        assert.ok(error instanceof Diagnostic);

        if (error instanceof Diagnostic) {
          assert.strictEqual(error.classification, diagnosticClassification(kind));

          if (kind === "failure") assert.strictEqual(error, typedFailure);
        }

        assert.strictEqual(storeCalls, 1);
        assert.strictEqual(commandCalls, 0);
        assert.strictEqual(published.length, 1);
        assert.strictEqual(published[0]?.revision, 1);
        assert.strictEqual(published[0]?.observedStoreRevision, 0);
        assert.strictEqual(published[0]?.issues.length, 1);
        assert.deepStrictEqual(evidenceMachineRevisions, [1, 0]);

        const noop = engine.dispatch(closed);
        const noopReceipt = yield* Deferred.await(noop.completion);
        yield* engine.drain();
        assert.deepStrictEqual(noopReceipt, { publicationRevision: 1, evidenceSequence: 2 });
        assert.strictEqual(published.length, 1);
        assert.strictEqual(commandCalls, 1);
        yield* engine.shutdown();
        yield* Scope.close(scope, Exit.void);
      }
    }),
  );

  it.effect("publishes each passive projection fact as its own non-machine turn", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      let commandCalls = 0;
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      const machineTurnRevisions: number[] = [];

      const setup = makeInput(scope, () => {
        commandCalls += 1;

        return Effect.void;
      });

      const configured: ActorEngineInput<typeof testDefinition> = {
        ...setup.input,
        onSnapshot: (snapshot) => published.push(snapshot),
        acceptEvidence: (publication) => {
          machineTurnRevisions.push(publication.machineTurnRevision);

          return Result.succeed(machineTurnRevisions.length);
        },
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();

      const occurrenceFence = {
        actor: setup.input.fence,
        descriptor: testDefinition.operations.item,
        key: [1],
        ordinal: 1,
      };

      const streamOccurrenceFence = { ...occurrenceFence, ordinal: 2 };

      const facts: ProjectionFact[] = [
        {
          _tag: "timer-projection",
          fence: setup.input.fence,
          name: "refresh",
          startedAt: 1,
          dueAt: 2,
        },
        {
          _tag: "completion-projection",
          completion: {
            fence: occurrenceFence,
            outcome: { _tag: "success", value: 1 },
          },
        },
        {
          _tag: "stream-projection",
          fact: { fence: streamOccurrenceFence, value: "chunk" },
        },
        {
          _tag: "context-projection",
          provider: {
            fence: { ...setup.input.fence, generation: 1 },
            slot: "provider",
            revision: 1,
            value: "ready",
          },
        },
        {
          _tag: "store-projection",
          fact: { fence: setup.input.fence, revision: 1, changed: [] },
        },
        {
          _tag: "lifecycle-projection",
          fence: setup.input.fence,
          lifecycle: "suspended",
        },
      ];

      for (const fact of facts) {
        engine.dispatchFact(fact);
        yield* engine.drain();
      }

      const staleFence = { ...setup.input.fence, generation: 1 };
      engine.dispatchFact({
        _tag: "timer-projection",
        fence: staleFence,
        name: "stale",
        startedAt: 3,
        dueAt: 4,
      });
      yield* engine.drain();
      engine.dispatchFact({
        _tag: "context-projection",
        provider: {
          fence: { ...setup.input.fence, generation: 1 },
          slot: "provider",
          revision: 0,
          value: "older",
        },
      });
      yield* engine.drain();

      assert.deepStrictEqual(
        published.map((snapshot) => snapshot.revision),
        [1, 2, 3, 4, 5, 6],
      );
      assert.deepStrictEqual(machineTurnRevisions, [0, 0, 0, 0]);
      assert.strictEqual(commandCalls, 0);
      assert.strictEqual(engine.snapshot().state, testDefinition.S.ready);
      assert.strictEqual(engine.snapshot().observedStoreRevision, 1);
      assert.deepStrictEqual(engine.snapshot().context, { provider: "ready" });
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("publishes one complete aggregate context cut and ignores its stale repeat", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      let commandCalls = 0;
      let storeCalls = 0;
      let evidenceCalls = 0;
      const published: ActorSnapshot<typeof contextConsumerDefinition>[] = [];

      const setup = makeContextInput(scope, () => {
        commandCalls += 1;

        return Effect.void;
      });

      const left = {
        fence: setup.input.fence,
        slot: "left",
        revision: 1,
        value: contextProviderDefinition.S.changed,
      };

      const right = {
        fence: setup.input.fence,
        slot: "right",
        revision: 1,
        value: contextProviderDefinition.S.changed,
      };

      const projection: ContextProjectionCarrier = {
        providers: [left, right],
        issueOnly: false,
        selectorDefects: [],
      };

      const aggregate: Extract<ProjectionFact, { _tag: "context-projection" }> = {
        _tag: "context-projection",
        provider: { ...left, value: projection },
        projection,
      };

      const configured: ActorEngineInput<typeof contextConsumerDefinition> = {
        ...setup.input,
        store: {
          commit: () => {
            storeCalls += 1;

            return Result.succeed({ revision: storeCalls, changed: [] });
          },
        },
        onSnapshot: (snapshot) => published.push(snapshot),
        acceptEvidence: (publication) => {
          evidenceCalls += 1;
          assert.strictEqual(publication.machineTurnRevision, 0);

          return Result.succeed(evidenceCalls);
        },
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();

      engine.dispatchFact(aggregate);
      yield* engine.drain();
      engine.dispatchFact(aggregate);
      yield* engine.drain();

      assert.strictEqual(published.length, 1);
      assert.strictEqual(evidenceCalls, 0);
      assert.deepStrictEqual(published[0]?.context, {
        left: contextProviderDefinition.S.changed,
        right: contextProviderDefinition.S.changed,
      });
      assert.strictEqual(published[0]?.revision, 1);
      assert.strictEqual(published[0]?.observedStoreRevision, 0);
      assert.strictEqual(engine.snapshot().revision, 1);
      assert.strictEqual(engine.snapshot().observedStoreRevision, 0);
      assert.strictEqual(commandCalls, 0);
      assert.strictEqual(storeCalls, 0);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("publishes selector defects once and retries newer context revisions", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const published: ActorSnapshot<typeof contextConsumerDefinition>[] = [];
      const evidenceMachineRevisions: number[] = [];
      const evidenceStoreRevisions: number[] = [];
      const evidenceIssues: PublicDiagnostic[][] = [];

      const setup = makeContextInput(scope, () =>
        // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- context projections must not run user commands; this defect makes accidental command execution observable.
        Effect.die("context projections do not run commands"),
      );

      const configured: ActorEngineInput<typeof contextConsumerDefinition> = {
        ...setup.input,
        onSnapshot: (snapshot) => published.push(snapshot),
        acceptEvidence: (publication) => {
          evidenceMachineRevisions.push(publication.machineTurnRevision);
          evidenceStoreRevisions.push(publication.store.revision);
          evidenceIssues.push([...publication.snapshot.issues]);

          return Result.succeed(evidenceMachineRevisions.length);
        },
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();

      const makeContextFact = (
        revision: number,
        leftValue:
          | typeof contextProviderDefinition.S.ready
          | typeof contextProviderDefinition.S.changed,
        rightValue:
          | typeof contextProviderDefinition.S.ready
          | typeof contextProviderDefinition.S.changed,
        issueOnly: boolean,
        selectorDefects: PublicDiagnostic[],
      ) => {
        const providers = [
          { fence: setup.input.fence, slot: "left", revision, value: leftValue },
          { fence: setup.input.fence, slot: "right", revision, value: rightValue },
        ];

        const carrier: ContextProjectionCarrier = {
          providers,
          issueOnly,
          selectorDefects,
        };

        assert.strictEqual(carrier.providers.length, 2);

        return {
          _tag: "context-projection" as const,
          provider: { ...providers[0]!, value: carrier },
          projection: carrier,
        } satisfies ProjectionFact;
      };

      const firstDefect = Failure({
        code: "InvariantViolation" as const,
        path: ["context", "left"],
        details: { revision: 1 },
        summary: "left selector failed",
        help: "Inspect the left context selector.",
      });

      const secondDefect = Failure({
        code: "InvariantViolation" as const,
        path: ["context", "left"],
        details: { revision: 2 },
        summary: "left selector failed again",
        help: "Inspect the left context selector.",
      });

      const firstIssue = makeContextFact(
        1,
        contextProviderDefinition.S.ready,
        contextProviderDefinition.S.ready,
        true,
        [firstDefect],
      );

      engine.dispatchFact(firstIssue);
      yield* engine.drain();
      engine.dispatchFact(firstIssue);
      yield* engine.drain();

      assert.strictEqual(published.length, 1);
      assert.strictEqual(evidenceMachineRevisions.length, 1);
      assert.strictEqual(published[0]?.revision, 1);
      assert.strictEqual(published[0]?.issues[0], firstDefect);
      assert.strictEqual(evidenceIssues[0]?.[0], firstDefect);
      assert.strictEqual(published[0]?.context.left, contextProviderDefinition.S.ready);
      assert.strictEqual(published[0]?.context.right, contextProviderDefinition.S.ready);
      assert.strictEqual(published[0]?.observedStoreRevision, 0);

      const secondIssue = makeContextFact(
        2,
        contextProviderDefinition.S.ready,
        contextProviderDefinition.S.ready,
        true,
        [secondDefect],
      );

      engine.dispatchFact(secondIssue);
      yield* engine.drain();
      assert.strictEqual(published.length, 2);
      assert.strictEqual(published[1]?.revision, 2);
      assert.strictEqual(published[1]?.issues[0], secondDefect);
      assert.strictEqual(evidenceIssues[1]?.[0], secondDefect);
      assert.strictEqual(published[1]?.context.left, contextProviderDefinition.S.ready);
      assert.strictEqual(published[1]?.context.right, contextProviderDefinition.S.ready);

      const recovered = makeContextFact(
        3,
        contextProviderDefinition.S.changed,
        contextProviderDefinition.S.changed,
        false,
        [],
      );

      engine.dispatchFact(recovered);
      yield* engine.drain();
      assert.strictEqual(published.length, 3);
      assert.strictEqual(published[2]?.revision, 3);
      assert.deepStrictEqual(published[2]?.issues, []);
      assert.strictEqual(evidenceIssues[2], undefined);
      assert.strictEqual(published[2]?.context.left, contextProviderDefinition.S.changed);
      assert.strictEqual(published[2]?.context.right, contextProviderDefinition.S.changed);
      assert.deepStrictEqual(evidenceMachineRevisions, [0, 0]);
      assert.deepStrictEqual(evidenceStoreRevisions, [0, 0]);
      assert.strictEqual(engine.snapshot().revision, 3);
      assert.strictEqual(engine.snapshot().observedStoreRevision, 0);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("ignores a duplicate completion for the same operation occurrence", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      let evidenceCalls = 0;
      const setup = makeInput(scope, () => Effect.void);

      const configured: ActorEngineInput<typeof testDefinition> = {
        ...setup.input,
        onSnapshot: (snapshot) => published.push(snapshot),
        acceptEvidence: () => {
          evidenceCalls += 1;

          return Result.succeed(evidenceCalls);
        },
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();

      const occurrence = {
        actor: setup.input.fence,
        descriptor: testDefinition.operations.nestedItem,
        key: testDefinition.operations.nestedItem.key(1),
        ordinal: 1,
      };

      const failure = Failure({
        code: "InvariantViolation" as const,
        path: ["operation", "completion"],
        details: {},
        summary: "duplicate completion",
        help: "Ignore the duplicate operation completion.",
      });

      engine.dispatchFact({
        _tag: "completion-projection",
        completion: { fence: occurrence, outcome: { _tag: "success", value: 1 } },
      });
      yield* engine.drain();
      engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: { ...occurrence, key: testDefinition.operations.nestedItem.key(1) },
          outcome: { _tag: "failure", error: failure },
        },
      });
      yield* engine.drain();

      assert.strictEqual(published.length, 1);
      assert.strictEqual(evidenceCalls, 1);
      assert.strictEqual(engine.snapshot().revision, 1);
      assert.strictEqual(engine.snapshot().operations[0]?.status, "succeeded");
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("settles the current and buffered accepted prefix on hard shutdown", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const firstStarted = yield* Deferred.make<void>();
      const processed: string[] = [];

      const setup = makeInput(scope, (command) =>
        Effect.gen(function* () {
          processed.push(command.type);

          if (processed.length === 1) {
            yield* Deferred.succeed(firstStarted, undefined);
            yield* Deferred.await(Deferred.makeUnsafe<void>());
          }
        }),
      );

      const engine = yield* (yield* prepareActorEngine(setup.input)).activate();
      const first = engine.dispatch(opened);
      yield* Deferred.await(firstStarted);
      const second = engine.dispatch(opened);
      const third = engine.dispatch(opened);
      const firstExit = yield* Effect.exit(Deferred.await(first.completion));

      assert.ok(Exit.isSuccess(firstExit));
      yield* engine.shutdown();
      const secondExit = yield* Effect.exit(Deferred.await(second.completion));
      const thirdExit = yield* Effect.exit(Deferred.await(third.completion));
      const secondError = failureFromExit(secondExit);
      const thirdError = failureFromExit(thirdExit);

      assert.ok(secondError instanceof Diagnostic);
      assert.ok(thirdError instanceof Diagnostic);

      if (secondError instanceof Diagnostic)
        assert.strictEqual(secondError.classification, "Interruption");

      if (thirdError instanceof Diagnostic)
        assert.strictEqual(thirdError.classification, "Interruption");
      assert.deepStrictEqual(yield* Effect.exit(Deferred.await(second.completion)), secondExit);
      assert.deepStrictEqual(yield* Effect.exit(Deferred.await(third.completion)), thirdExit);
      assert.deepStrictEqual(processed, [opened.type]);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("delivers snapshots only after evidence and acknowledgement", () =>
    Effect.gen(function* () {
      const failures = {
        observer: Failure({
          code: "InvariantViolation" as const,
          path: ["publication", "observer"],
          details: {},
          summary: "snapshot observer failed",
          help: "Inspect the actor publication observer.",
        }),
        evidence: Failure({
          code: "InvariantViolation" as const,
          path: ["publication", "evidence"],
          details: {},
          summary: "evidence acceptance failed",
          help: "Inspect the actor evidence boundary.",
        }),
      };

      for (const kind of ["observer", "evidence"] as const) {
        const scope = yield* Scope.make("sequential");
        const order: string[] = [];
        const observed: ActorSnapshot<typeof testDefinition>[] = [];
        let storeCalls = 0;
        let evidenceCalls = 0;
        let commandCalls = 0;
        let acknowledgedDispatch: AcknowledgedDispatch | undefined;

        const setup = makeInput(scope, () => {
          commandCalls += 1;

          return Effect.void;
        });

        const configured: ActorEngineInput<typeof testDefinition> = {
          ...setup.input,
          store: {
            commit: () => {
              storeCalls += 1;

              return Result.succeed({ revision: 1, changed: [] });
            },
          },
          onSnapshot: (snapshot) => {
            order.push("snapshot");
            observed.push(snapshot);

            if (kind === "observer") {
              assert.ok(acknowledgedDispatch !== undefined);
              assert.strictEqual(Deferred.isDoneUnsafe(acknowledgedDispatch.completion), true);
              // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- this fixture proves observer defects occur after a committed cut.
              throw failures.observer;
            }
          },
          acceptEvidence: () => {
            order.push("evidence");
            evidenceCalls += 1;

            return kind === "evidence" ? Result.fail(failures.evidence) : Result.succeed(1);
          },
        };

        const engine = yield* (yield* prepareActorEngine(configured)).activate();
        const dispatched = engine.dispatch(opened);
        acknowledgedDispatch = dispatched;
        const completion = yield* Effect.exit(Deferred.await(dispatched.completion));
        yield* engine.drain();
        assert.deepStrictEqual(
          yield* Effect.exit(Deferred.await(dispatched.completion)),
          completion,
        );

        assert.strictEqual(storeCalls, kind === "observer" ? 1 : 0);
        assert.strictEqual(commandCalls, 0);
        assert.deepStrictEqual(
          order,
          kind === "observer" ? ["evidence", "snapshot"] : ["evidence", "evidence"],
        );
        assert.strictEqual(evidenceCalls, kind === "observer" ? 1 : 2);

        if (kind === "observer") {
          assert.ok(Exit.isSuccess(completion));
          assert.strictEqual(observed.length, 1);
          assert.strictEqual(observed[0]?.revision, 1);
          assert.strictEqual(engine.snapshot().revision, 1);
        } else {
          const error = failureFromExit(completion);
          assert.strictEqual(error, failures.evidence);
          assert.strictEqual(observed.length, 0);
          assert.strictEqual(engine.snapshot().revision, 0);
        }

        assert.strictEqual(engine.snapshot().observedStoreRevision, kind === "observer" ? 1 : 0);
        assertMailboxThrows(() => engine.send(closed), "closed");
        yield* Scope.close(scope, Exit.void);
      }
    }),
  );

  it.effect("publishes the matching actor snapshot after store commit", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      let committed = false;
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const configured: ActorEngineInput<typeof testDefinition> = {
        ...setup.input,
        initial: resultSuccess(
          prepareActorSnapshot(testMachine, {
            ...setup.input.initial,
            observedStoreRevision: 2,
          }),
        ),
        store: {
          commit: () => {
            committed = true;

            return Result.succeed({ revision: 3, changed: [] });
          },
        },
        onSnapshot: (snapshot) => published.push(snapshot),
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();
      const dispatched = engine.dispatch(opened);
      const completion = yield* Effect.exit(Deferred.await(dispatched.completion));
      yield* engine.drain();
      assert.ok(Exit.isSuccess(completion));
      assert.strictEqual(committed, true);
      assert.strictEqual(published.length, 1);
      assert.strictEqual(published[0]?.revision, 1);
      assert.strictEqual(published[0]?.observedStoreRevision, 3);
      assert.strictEqual(engine.snapshot().revision, 1);
      assert.strictEqual(engine.snapshot().observedStoreRevision, 3);
      assert.deepStrictEqual(yield* Deferred.await(dispatched.completion), {
        publicationRevision: 1,
        evidenceSequence: 1,
      });
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("rejects a hostile store result before owner mutation", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      let storeCalls = 0;
      let storeMutated = false;
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const configured: ActorEngineInput<typeof testDefinition> = {
        ...setup.input,
        store: {
          commit: () => {
            storeCalls += 1;

            const hostileChanged = new Proxy([], {
              get: (target, property, receiver) => {
                if (property === "map") {
                  // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- the proxy deliberately defects during post-commit validation.
                  throw new Error("hostile changed-reference getter");
                }

                // SAFETY: This proxy forwards all non-map reads unchanged for the hostile-result proof.
                // oxlint-disable-next-line anti-slop/no-reflect-get -- the proxy forwards arbitrary property reads for the negative proof.
                return Reflect.get(target, property, receiver);
              },
            });

            const result = makeActorStoreResult<typeof testDefinition>({
              revision: 1,
              // SAFETY: The hostile proxy deliberately crosses the private changed-projection boundary.
              // oxlint-disable-next-line anti-slop/no-unsafe-type-assertion -- adversarial owner-result proof.
              changed: hostileChanged as never,
            });

            if (Result.isFailure(result)) return result;
            storeMutated = true;

            return result;
          },
        },
        onSnapshot: (snapshot) => published.push(snapshot),
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();
      const dispatched = engine.dispatch(opened);
      const completion = yield* Effect.exit(Deferred.await(dispatched.completion));
      yield* engine.drain();

      assert.ok(Exit.isFailure(completion));
      assert.strictEqual(storeCalls, 1);
      assert.strictEqual(storeMutated, false);
      assert.strictEqual(published.length, 1);
      assert.strictEqual(published[0]?.revision, 1);
      assert.strictEqual(published[0]?.observedStoreRevision, 0);
      assert.strictEqual(engine.snapshot().observedStoreRevision, 0);
      assert.strictEqual(engine.snapshot().issues.length, 1);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("finalizes a production evidence record with the committed store cut", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const order: string[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const evidence = makeRuntimeEvidenceOwner({
        app: testApp,
        plan: appPlan(testApp),
        clock: makeTestClock(() => 4_242),
      });

      const evidenceStoreRevisions: number[] = [];

      const sink = yield* makeEvidenceSink({
        id: "actor-engine-b15",
        deliver: (record) =>
          Effect.sync(() => {
            if (record._tag === "turn") evidenceStoreRevisions.push(record.store.revision);
          }),
      });

      assert.ok(Result.isSuccess(evidence.journal.attach(sink)));
      let preparedStoreRevision = -1;

      const configured: ActorEngineInput<typeof testDefinition> = {
        ...setup.input,
        store: {
          commit: () => {
            order.push("store");

            return Result.succeed({ revision: 7, changed: [] });
          },
        },
        acceptEvidence: (publication, before, phase) => {
          order.push("evidence");
          preparedStoreRevision = publication.store.revision;

          const accepted = (
            phase === "prepare" ? evidence.preparePublication : evidence.acceptPublication
          )(setup.input.identity, setup.input.fence, before, publication);

          return accepted;
        },
        onSnapshot: () => order.push("snapshot"),
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();
      const dispatched = engine.dispatch(opened);
      const receipt = yield* Deferred.await(dispatched.completion);
      yield* engine.drain();
      yield* evidence.close();

      assert.deepStrictEqual(order, ["evidence", "store", "snapshot"]);
      assert.strictEqual(preparedStoreRevision, 0);
      assert.strictEqual(engine.snapshot().observedStoreRevision, 7);
      assert.deepStrictEqual(evidenceStoreRevisions, [7]);
      assert.deepStrictEqual(receipt, { publicationRevision: 1, evidenceSequence: 1 });
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("fails before publication when the revision counter would wrap", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      let storeCalls = 0;
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const configured: ActorEngineInput<typeof testDefinition> = {
        ...setup.input,
        initial: resultSuccess(
          prepareActorSnapshot(testMachine, {
            ...setup.input.initial,
            revision: Number.MAX_SAFE_INTEGER,
          }),
        ),
        store: {
          commit: () => {
            storeCalls += 1;

            return Result.succeed({ revision: 1, changed: [] });
          },
        },
        onSnapshot: (snapshot) => published.push(snapshot),
      };

      const engine = yield* (yield* prepareActorEngine(configured)).activate();
      const dispatched = engine.dispatch(opened);
      const completion = yield* Effect.exit(Deferred.await(dispatched.completion));

      assert.ok(Exit.isFailure(completion));
      assert.strictEqual(storeCalls, 0);
      assert.deepStrictEqual(published, []);
      assert.strictEqual(engine.snapshot().revision, Number.MAX_SAFE_INTEGER);
      assertMailboxThrows(() => engine.send(closed), "closed");
      assert.deepStrictEqual(yield* Effect.exit(Deferred.await(dispatched.completion)), completion);
      yield* Scope.close(scope, Exit.void);
    }),
  );
});

const startParityEngine = (
  scope: Scope.Scope,
  onCommand: ActorEngineInput<typeof testDefinition>["onCommand"] = () => Effect.void,
) =>
  Effect.gen(function* () {
    const setup = makeInput(scope, onCommand);
    const prepared = yield* prepareActorEngine(setup.input);
    const engine = yield* prepared.activate();

    return { engine, setup };
  });

const parityOccurrence = (
  setup: ReturnType<typeof makeInput>,
  key: OperationKey = [1],
  ordinal = 1,
) =>
  ({
    actor: setup.input.fence,
    descriptor: testDefinition.operations.nestedItem,
    key,
    ordinal,
  }) satisfies OperationOccurrenceFence;

describe("actor engine parity cases", () => {
  // SETUP: Start one real engine with a recording command handler.
  // ACTION: Send a typed event, inspect the void return, then await the owner drain.
  // ASSERT: The command is observed once; the synchronous send result is not a turn-completion receipt.
  it.effect("walkthrough: send returns immediately and drain observes completed work", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const received: string[] = [];

      const { engine } = yield* startParityEngine(scope, (command) =>
        Effect.sync(() => received.push(command.type)),
      );

      const result: void = engine.send(opened);
      assert.strictEqual(result, undefined);
      yield* engine.drain();
      assert.deepStrictEqual(received, [opened.type]);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("rejects a foreign event before mailbox mutation", () =>
    Effect.gen(function* () {
      const foreignDefinitionResult = definition({
        id: "actor-engine/foreign",
        states: ["ready"],
        events: { opened: "bare" },
      });

      const foreignDefinition = resultSuccess(foreignDefinitionResult);
      const foreignEvent = resultSuccess(foreignDefinition.E.opened());
      const scope = yield* Scope.make("sequential");
      const { engine } = yield* startParityEngine(scope);
      const before = engine.snapshot();
      assert.throws(() => {
        // SAFETY: a foreign nominal event deliberately crosses the synchronous negative-test boundary.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        engine.send(foreignEvent as ActorCommand<typeof testDefinition>);
      });
      yield* engine.drain();
      assert.strictEqual(engine.snapshot(), before);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("processes mailbox commands in FIFO turn order", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const received: string[] = [];

      const { engine } = yield* startParityEngine(scope, (command) =>
        Effect.sync(() => received.push(command.type)),
      );

      engine.send(opened);
      engine.send(closed);
      engine.send(opened);
      yield* engine.drain();
      assert.deepStrictEqual(received, [opened.type, closed.type, opened.type]);
      assert.strictEqual(engine.snapshot().revision, 2);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("discards stale command fences before mutation", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const received: string[] = [];

      const { engine, setup } = yield* startParityEngine(scope, (command) =>
        Effect.sync(() => received.push(command.type)),
      );

      assert.strictEqual(
        fenceActorFact<typeof testDefinition>(setup.input.fence, {
          _tag: "command",
          fence: { ...setup.input.fence, generation: setup.input.fence.generation + 1 },
          command: opened,
        })._tag,
        "discarded",
      );
      assert.ok(
        Result.isSuccess(
          engine.dispatchFact({
            _tag: "timer-projection",
            fence: { ...setup.input.fence, generation: setup.input.fence.generation + 1 },
            name: "stale",
            startedAt: 1,
            dueAt: 2,
          }),
        ),
      );
      yield* engine.drain();
      assert.deepStrictEqual(received, []);
      engine.send(closed);
      yield* engine.drain();
      assert.deepStrictEqual(received, [closed.type]);
      assert.strictEqual(engine.snapshot().revision, 0);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("commits one complete actor and store cut", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      let committed = 0;
      const published: ActorPublication<typeof testDefinition>[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const engine = yield* (yield* prepareActorEngine({
        ...setup.input,
        store: {
          commit: () => {
            committed += 1;

            return Result.succeed({
              revision: committed,
              changed: [{ descriptor: testDefinition.operations.item, key: [1] as const }],
            });
          },
        },
        acceptEvidence: (publication) => {
          published.push(publication);

          return Result.succeed(1);
        },
      })).activate();

      const receipt = yield* Deferred.await(engine.dispatch(opened).completion);
      yield* engine.drain();
      assert.deepStrictEqual(receipt, { publicationRevision: 1, evidenceSequence: 1 });
      assert.strictEqual(committed, 1);
      assert.strictEqual(published.length, 1);
      assert.strictEqual(published[0]?.snapshot.revision, 1);
      assert.strictEqual(published[0]?.store.revision, 0);
      assert.strictEqual(engine.snapshot().observedStoreRevision, 1);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("drops a failed plan without partial publication", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");

      const failure = Failure({
        code: "InvariantViolation" as const,
        path: ["store"],
        details: { reason: "rejected" },
        summary: "store rejected",
        help: "Repair the store.",
      });

      let commands = 0;
      const published: ActorSnapshot<typeof testDefinition>[] = [];

      const setup = makeInput(scope, () => {
        commands += 1;

        return Effect.void;
      });

      const engine = yield* (yield* prepareActorEngine({
        ...setup.input,
        store: {
          // SAFETY: the failing branch carries the same public diagnostic channel as ActorStore.commit.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          commit: () => Result.fail(failure) as never,
        },
        onSnapshot: (snapshot) => published.push(snapshot),
      })).activate();

      const exit = yield* Effect.exit(Deferred.await(engine.dispatch(opened).completion));
      yield* engine.drain();
      assert.ok(Exit.isFailure(exit));
      assert.strictEqual(commands, 0);
      assert.strictEqual(published.length, 1);
      assert.strictEqual(published[0]?.issues[0], failure);
      assert.strictEqual(engine.snapshot().observedStoreRevision, 0);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("retains a planning defect and discards staged actions", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      let storeCalls = 0;
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const engine = yield* (yield* prepareActorEngine({
        ...setup.input,
        store: {
          commit: () => {
            storeCalls += 1;
            // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- the store fixture deliberately defects after action staging.
            throw new Error("staged action defect");
          },
        },
        onSnapshot: (snapshot) => published.push(snapshot),
      })).activate();

      const exit = yield* Effect.exit(Deferred.await(engine.dispatch(opened).completion));
      yield* engine.drain();
      assert.ok(Exit.isFailure(exit));
      assert.strictEqual(storeCalls, 1);
      assert.strictEqual(published.length, 1);
      assert.strictEqual(published[0]?.issues.length, 1);
      assert.strictEqual(engine.snapshot().revision, 1);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("correlates operation completion with its descriptor and key", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const { engine, setup } = yield* startParityEngine(scope);
      const occurrence = parityOccurrence(setup, [{ nested: true }], 4);

      const offered = engine.dispatchFact({
        _tag: "completion-projection",
        completion: { fence: occurrence, outcome: { _tag: "success", value: "ok" } },
      });

      assert.ok(Result.isSuccess(offered));
      yield* engine.drain();
      const operation = engine.snapshot().operations[0];
      assert.ok(operation !== undefined);
      assert.strictEqual(operation.descriptor, occurrence.descriptor);
      assert.deepStrictEqual(operation.key, [{ nested: true }]);
      assert.strictEqual(operation.status, "succeeded");
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("settles distinct live occurrences delivered out of order", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const { engine, setup } = yield* startParityEngine(scope);
      const second = parityOccurrence(setup, [2], 2);
      const first = parityOccurrence(setup, [1], 1);
      assert.ok(
        Result.isSuccess(
          engine.dispatchFact({
            _tag: "completion-projection",
            completion: { fence: second, outcome: { _tag: "success", value: 2 } },
          }),
        ),
      );
      assert.ok(
        Result.isSuccess(
          engine.dispatchFact({
            _tag: "completion-projection",
            completion: { fence: first, outcome: { _tag: "success", value: 1 } },
          }),
        ),
      );
      yield* engine.drain();
      assert.strictEqual(engine.snapshot().operations.length, 2);
      assert.deepStrictEqual(
        engine.snapshot().operations.map((operation) => operation.key),
        [[2], [1]],
      );
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("discards completions from a prior actor incarnation", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const engine = yield* (yield* prepareActorEngine({
        ...setup.input,
        onSnapshot: (snapshot) => published.push(snapshot),
      })).activate();

      setup.registry.rollback(setup.input.identity);
      const nextIdentity = resultSuccess(setup.registry.reserveStable(setup.ref));
      const stale = { ...setup.input.fence, incarnation: nextIdentity.incarnation };

      const result = engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: { ...parityOccurrence(setup), actor: stale },
          outcome: { _tag: "success", value: 1 },
        },
      });

      assert.ok(Result.isSuccess(result));
      yield* engine.drain();
      assert.deepStrictEqual(published, []);
      assert.deepStrictEqual(engine.snapshot().operations, []);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("retains finite success and expected failure outcomes", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const { engine, setup } = yield* startParityEngine(scope);

      const expected = Failure({
        code: "SchemaValidation" as const,
        path: ["operation"],
        details: {},
        summary: "expected operation failure",
        help: "Inspect the operation.",
      });

      engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: parityOccurrence(setup, [1], 1),
          outcome: { _tag: "success", value: 1 },
        },
      });
      engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: parityOccurrence(setup, [2], 2),
          outcome: { _tag: "failure", error: expected },
        },
      });
      yield* engine.drain();
      assert.deepStrictEqual(
        engine.snapshot().operations.map((operation) => operation.status),
        ["succeeded", "failed"],
      );
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("keeps interruption distinct during operation completion", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const { engine, setup } = yield* startParityEngine(scope);
      engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: parityOccurrence(setup),
          outcome: { _tag: "interrupt", exit: "disposed" },
        },
      });
      yield* engine.drain();
      assert.strictEqual(engine.snapshot().operations[0]?.status, "cancelled");
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("retains a defective operation exit and cause", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const setup = makeInput(scope, () => Effect.void);
      const defect = new Error("operation defect");
      const defectExit = Exit.die(defect);

      const initial = resultSuccess(
        prepareActorSnapshot(testMachine, {
          ...setup.input.initial,
          operations: [
            {
              descriptor: testDefinition.operations.nestedItem,
              key: [{ value: 1 }],
              status: "running",
            },
          ],
        }),
      );

      const evidence = makeRuntimeEvidenceOwner({
        app: testApp,
        plan: appPlan(testApp),
        clock: makeTestClock(() => 4_242),
      });

      const delivered: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "actor-engine-defect",
        deliver: (record) =>
          Effect.sync(() => {
            delivered.push(record);
          }),
      });

      const interrupted = yield* makeEvidenceSink({
        id: "actor-engine-interrupted",
        deliver: () => Effect.fail(Interrupt()),
      });

      assert.ok(Result.isSuccess(evidence.journal.attach(sink)));
      assert.ok(Result.isSuccess(evidence.journal.attach(interrupted)));

      const engine = yield* (yield* prepareActorEngine({
        ...setup.input,
        initial,
        acceptEvidence: (publication, before, phase) => {
          const accepted = (
            phase === "prepare" ? evidence.preparePublication : evidence.acceptPublication
          )(setup.input.identity, setup.input.fence, before, publication);

          return accepted;
        },
      })).activate();

      const accepted = engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: parityOccurrence(setup, [{ value: 1 }]),
          outcome: { _tag: "defect", exit: defectExit },
        },
      });

      assert.ok(Result.isSuccess(accepted));
      yield* engine.drain();
      const after = engine.snapshot();
      assert.strictEqual(after.operations[0]?.status, "failed");
      assert.strictEqual(after.revision, 1);
      assert.strictEqual(after.observedStoreRevision, 0);
      const drained = yield* evidence.journal.drain();
      assert.deepStrictEqual(
        drained.attachments.map((result) => result.status),
        ["drained", "failed"],
      );
      assert.strictEqual(delivered.length, 1);
      const record = delivered[0];
      assert.ok(record !== undefined);

      if (record._tag === "turn") {
        assert.strictEqual(record.provenance.actor.key, setup.input.identity.key);
        assert.strictEqual(record.provenance.actor.incarnation, setup.input.identity.incarnation);
        assert.strictEqual(record.publicationRevision, after.revision);
        assert.strictEqual(record.store.revision, after.observedStoreRevision);
        assert.strictEqual(record.cause._tag, "projection");

        if (record.cause._tag === "projection") {
          const fact = record.cause.fact;
          assert.strictEqual(fact._tag, "completion-projection");

          if (fact._tag === "completion-projection") {
            assert.strictEqual(fact.completion.outcome._tag, "defect");
            assert.strictEqual(fact.completion.outcome.exit, defectExit);
          }
        }
      } else {
        assert.fail("Expected a turn evidence record");
      }

      yield* evidence.close();
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("processes absolute timer projections once", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const engine = yield* (yield* prepareActorEngine({
        ...setup.input,
        onSnapshot: (snapshot) => published.push(snapshot),
      })).activate();

      const fact = {
        _tag: "timer-projection" as const,
        fence: setup.input.fence,
        name: "poll",
        startedAt: 10,
        dueAt: 20,
      };

      assert.ok(Result.isSuccess(engine.dispatchFact(fact)));
      assert.ok(Result.isSuccess(engine.dispatchFact(fact)));
      yield* engine.drain();
      assert.strictEqual(published.length, 1);
      assert.deepStrictEqual(engine.snapshot().timers, [
        { name: "poll", startedAt: 10, dueAt: 20 },
      ]);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("fences typed stream projections to their operation occurrence", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const { engine, setup } = yield* startParityEngine(scope);
      const occurrence = parityOccurrence(setup, [3], 3);
      assert.ok(
        Result.isSuccess(
          engine.dispatchFact({
            _tag: "stream-projection",
            fact: { fence: occurrence, value: "chunk" },
          }),
        ),
      );
      assert.ok(
        Result.isSuccess(
          engine.dispatchFact({
            _tag: "stream-projection",
            fact: {
              fence: { ...occurrence, actor: { ...setup.input.fence, generation: 1 } },
              value: "late",
            },
          }),
        ),
      );
      yield* engine.drain();
      assert.strictEqual(engine.snapshot().operations[0]?.status, "running");
      assert.deepStrictEqual(engine.snapshot().operations[0]?.key, [3]);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("serializes context projection before a later event turn", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const contextOpened = resultSuccess(contextConsumerDefinition.E.opened());
      const seen: unknown[] = [];
      let activeEngine: ActorEngine<typeof contextConsumerDefinition> | undefined;

      const setup = makeContextInput(scope, () =>
        Effect.sync(() => seen.push(activeEngine?.snapshot().context)),
      );

      activeEngine = yield* prepareActorEngine({
        ...setup.input,
        onCommand: () => Effect.sync(() => seen.push(activeEngine?.snapshot().context)),
      }).pipe(Effect.flatMap((prepared) => prepared.activate()));

      const engine = activeEngine;

      const providers = [
        {
          fence: setup.input.fence,
          slot: "left",
          revision: 1,
          value: contextProviderDefinition.S.changed,
        },
        {
          fence: setup.input.fence,
          slot: "right",
          revision: 1,
          value: contextProviderDefinition.S.changed,
        },
      ];

      const carrier: ContextProjectionCarrier = {
        providers,
        issueOnly: false,
        selectorDefects: [],
      };

      assert.ok(
        Result.isSuccess(
          engine.dispatchFact({
            _tag: "context-projection",
            provider: { ...providers[0]!, value: carrier },
            projection: carrier,
          }),
        ),
      );
      engine.send(contextOpened);
      yield* engine.drain();
      assert.deepStrictEqual(engine.snapshot().context, {
        left: contextProviderDefinition.S.changed,
        right: contextProviderDefinition.S.changed,
      });
      assert.strictEqual(seen.length, 1);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("orders lifecycle suspension before later commands", () =>
    Effect.gen(function* () {
      const received: string[] = [];
      const runtime = runtimeSetup({ app: testApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const initial = resultSuccess(
        prepareActorSnapshot(testMachine, {
          state: testDefinition.S.ready,
          memory: {},
          context: {},
          lifecycle: "prepared",
          operations: [],
          timers: [],
          issues: [],
          revision: 0,
          observedStoreRevision: 0,
        }),
      );

      const actor = yield* assembly.createActor({
        ref: actorRef(testMachine, "suspended"),
        initial,
        onCommand: (command) => Effect.sync(() => received.push(command.type)),
      });

      yield* Effect.provideContext(
        actor.lifecycle.command({ _tag: "actor:suspend", cause: { _tag: "attachment" } }),
        assembly.context,
      );
      const before = actor.engine.snapshot();
      const rejected = actor.engine.dispatch(opened);
      assert.strictEqual(rejected.admitted, false);
      const completion = yield* Effect.exit(Deferred.await(rejected.completion));
      assert.ok(Exit.isFailure(completion));

      if (Exit.isFailure(completion)) {
        const reason = completion.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);

        assert.strictEqual(reason.error.code, "InvariantViolation");
        assert.deepStrictEqual(reason.error.path, ["mailbox", "closed"]);
      }

      const after = actor.engine.snapshot();
      assert.strictEqual(after.lifecycle, "suspended");
      assert.strictEqual(after.state, before.state);
      assert.strictEqual(after.revision, before.revision);
      assert.deepStrictEqual(received, []);
      assert.throws(() => actor.handle.send(opened));
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("isolates a throwing snapshot callback from committed actor truth", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");

      const observerFailure = Failure({
        code: "InvariantViolation" as const,
        path: ["subscriber"],
        details: {},
        summary: "subscriber failed",
        help: "Inspect the subscriber.",
      });

      let storeCalls = 0;
      const setup = makeInput(scope, () => Effect.void);

      const engine = yield* (yield* prepareActorEngine({
        ...setup.input,
        store: {
          commit: () => {
            storeCalls += 1;

            return Result.succeed({ revision: 1, changed: [] });
          },
        },
        onSnapshot: () => {
          // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- this observer deliberately defects after publication.
          throw observerFailure;
        },
      })).activate();

      const exit = yield* Effect.exit(Deferred.await(engine.dispatch(opened).completion));
      assert.ok(Exit.isSuccess(exit));
      assert.strictEqual(storeCalls, 1);
      assert.strictEqual(engine.snapshot().revision, 1);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("commits evidence when no snapshot subscriber is attached", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      let evidence = 0;
      const setup = makeInput(scope, () => Effect.void);

      const engine = yield* (yield* prepareActorEngine({
        ...setup.input,
        acceptEvidence: () => Result.succeed(++evidence),
      })).activate();

      const receipt = yield* Deferred.await(engine.dispatch(opened).completion);
      assert.strictEqual(evidence, 1);
      assert.deepStrictEqual(receipt, { publicationRevision: 1, evidenceSequence: 1 });
      assert.strictEqual(engine.snapshot().revision, 1);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("abandons a prepared engine without publication", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const published: ActorSnapshot<typeof testDefinition>[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const prepared = yield* prepareActorEngine({
        ...setup.input,
        onSnapshot: (snapshot) => published.push(snapshot),
      });

      prepared.send(opened);
      prepared.send(closed);
      prepared.abandon();
      assert.deepStrictEqual(published, []);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("closes engine resources after interrupting owned work", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const entered = yield* Deferred.make<void>();
      const hold = yield* Deferred.make<void>();

      const { engine } = yield* startParityEngine(scope, () =>
        Effect.gen(function* () {
          yield* Deferred.succeed(entered, undefined);
          yield* Deferred.await(hold);
        }),
      );

      const pending = engine.dispatch(opened);
      yield* Deferred.await(entered);
      yield* engine.shutdown();
      const late = engine.dispatch(closed);
      assert.strictEqual(late.admitted, false);
      assert.ok(Exit.isSuccess(yield* Effect.exit(Deferred.await(pending.completion))));
      yield* Deferred.succeed(hold, undefined);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("coalesces equal-revision passive projections", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const published: ActorSnapshot<typeof contextConsumerDefinition>[] = [];
      const setup = makeContextInput(scope, () => Effect.void);

      const engine = yield* prepareActorEngine({
        ...setup.input,
        onSnapshot: (snapshot) => published.push(snapshot),
      }).pipe(Effect.flatMap((prepared) => prepared.activate()));

      const providers = [
        {
          fence: setup.input.fence,
          slot: "left",
          revision: 1,
          value: contextProviderDefinition.S.changed,
        },
        {
          fence: setup.input.fence,
          slot: "right",
          revision: 1,
          value: contextProviderDefinition.S.changed,
        },
      ];

      const carrier: ContextProjectionCarrier = {
        providers,
        issueOnly: false,
        selectorDefects: [],
      };

      const fact = {
        _tag: "context-projection" as const,
        provider: { ...providers[0]!, value: carrier },
        projection: carrier,
      };

      assert.ok(Result.isSuccess(engine.dispatchFact(fact)));
      assert.ok(Result.isSuccess(engine.dispatchFact(fact)));
      yield* engine.drain();
      assert.strictEqual(published.length, 1);
      assert.strictEqual(engine.snapshot().revision, 1);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("serializes owner disposal through the actor engine lane", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const entered = yield* Deferred.make<void>();
      const hold = yield* Deferred.make<void>();

      const { engine } = yield* startParityEngine(scope, () =>
        Effect.gen(function* () {
          yield* Deferred.succeed(entered, undefined);
          yield* Deferred.await(hold);
        }),
      );

      engine.send(opened);
      yield* Deferred.await(entered);
      const shutdown = yield* Effect.forkChild(engine.shutdown(), { startImmediately: true });
      yield* Effect.yieldNow;
      assert.strictEqual(engine.dispatch(closed).admitted, false);
      yield* Deferred.succeed(hold, undefined);
      yield* Fiber.join(shutdown);
      assert.strictEqual(engine.snapshot().revision, 1);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("publishes complete actor snapshots", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const { engine } = yield* startParityEngine(scope);
      const snapshot = engine.snapshot();
      assert.strictEqual(snapshot.lifecycle, "prepared");
      assert.deepStrictEqual(snapshot.operations, []);
      assert.deepStrictEqual(snapshot.timers, []);
      assert.deepStrictEqual(snapshot.issues, []);
      assert.strictEqual("send" in snapshot, false);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("prepares evidence before the atomic actor and store cut", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const order: string[] = [];
      const setup = makeInput(scope, () => Effect.void);

      const engine = yield* (yield* prepareActorEngine({
        ...setup.input,
        acceptEvidence: () => {
          order.push("evidence");

          return Result.succeed(1);
        },
        store: {
          commit: () => {
            order.push("store");

            return Result.succeed({ revision: 1, changed: [] });
          },
        },
        onSnapshot: () => order.push("snapshot"),
      })).activate();

      yield* Deferred.await(engine.dispatch(opened).completion);
      yield* engine.drain();
      assert.deepStrictEqual(order, ["evidence", "store", "snapshot"]);
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("matches nested operation keys structurally", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const { engine, setup } = yield* startParityEngine(scope);
      const first = parityOccurrence(setup, [{ value: 7 }], 1);
      const equal = parityOccurrence(setup, [{ value: 7 }], 2);
      engine.dispatchFact({
        _tag: "completion-projection",
        completion: { fence: first, outcome: { _tag: "success", value: 7 } },
      });
      engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: equal,
          outcome: {
            _tag: "failure",
            error: Failure({
              code: "SchemaValidation" as const,
              path: [],
              details: {},
              summary: "duplicate",
              help: "Ignore duplicate.",
            }),
          },
        },
      });
      yield* engine.drain();
      assert.strictEqual(engine.snapshot().operations.length, 1);
      assert.strictEqual(engine.snapshot().operations[0]?.status, "failed");
      yield* engine.shutdown();
      yield* Scope.close(scope, Exit.void);
    }),
  );
});

describe("pending regression scenarios", () => {
  // SETUP: Activate one real ActorEngine, hold its first onCommand at a Deferred, then dispatch that executing command and fill exactly ACTOR_MAILBOX_CAPACITY waiting command slots.
  // ACTION: Dispatch one additional command and retain both the admitted flag and its private completion; release the executing command and drain the engine.
  // ASSERT: One executing command plus 64 waiting commands run once in FIFO order; the next admission is admitted=false, its completion fails with path ["mailbox","full"], no rejected command runs, and the rejection changes no snapshot, store, or evidence sequence.
  it.todo("rejects admission when 64 commands wait behind one executing command");

  // SETUP: Extend the existing one-shot clock defect fixture with a candidate that would run an action, a counting store, snapshots, evidence, and an onCommand counter; retain the pre-turn snapshot for comparison.
  // ACTION: Dispatch through the failing preflight, await its failed acknowledgement and drain; dispatch the same event again after the clock succeeds.
  // ASSERT: The failed attempt invokes no store commit or user work, preserves state/memory/operations and observedStoreRevision, emits exactly one issue-only active publication with committed prior truth, and cancels its reserved evidence; the retry creates exactly one normal cut and one acknowledgement.
  // SETUP: Extend the existing ordering fixture with a real store owner returning a nonempty owned changed-ref set and a final store revision different from the prior revision, a publication observer, and gated user work; capture the acknowledgement handle before dispatch.
  // ACTION: Dispatch one event, observe nonsequenced evidence preparation, store commit, publication, acknowledgement and user-work start as separate checkpoints; drain the resulting record only after acknowledgement.
  // ASSERT: Evidence preparation precedes the single actor/store cut; final snapshot and delivered evidence contain the actual committed store revision and changed refs. Acknowledgement completes after publication/evidence acceptance and before user work or sink delivery; finalization never reruns projection/copy callbacks or exposes a partial candidate.
  // Setup: Use a real engine with an attached evidence sink; retain its snapshot, private machine-turn revision and last accepted evidence sequence.
  // Action: Apply one changed passive context/store projection, await its private publication ticket and drain evidence; then exercise a separate contained issue-only cut.
  // Assert: The passive projection publishes one complete owned snapshot with public revision plus one, unchanged machine-turn revision/evidence sequence, and no record. Its ticket contains that exact cut; the separate issue-only cut follows its TurnRecord rule.
  it.effect(
    "publishes a passive projection without allocating evidence or machine-turn revision",
    () =>
      Effect.gen(function* () {
        const scope = yield* Scope.make("sequential");
        const setup = makeInput(scope, () => Effect.void);

        const evidence = makeRuntimeEvidenceOwner({
          app: testApp,
          plan: appPlan(testApp),
          clock: makeTestClock(() => 4_242),
        });

        const records: EvidenceRecord[] = [];

        const sink = yield* makeEvidenceSink({
          id: "passive-cut",
          deliver: (record) => Effect.sync(() => records.push(record)),
        });

        assert.ok(Result.isSuccess(evidence.journal.attach(sink)));
        const published: ActorSnapshot<typeof testDefinition>[] = [];

        const engine = yield* (yield* prepareActorEngine({
          ...setup.input,
          onSnapshot: (snapshot) => published.push(snapshot),
          acceptEvidence: (publication, before, phase) =>
            (phase === "prepare" ? evidence.preparePublication : evidence.acceptPublication)(
              setup.input.identity,
              setup.input.fence,
              before,
              publication,
            ),
        })).activate();

        const initial = engine.snapshot();

        const fact: ProjectionFact = {
          _tag: "store-projection",
          fact: { fence: setup.input.fence, revision: 1, changed: [] },
        };

        assert.ok(Result.isSuccess(engine.dispatchFact(fact)));
        yield* engine.drain();
        assert.strictEqual(published.length, 1);
        assert.strictEqual(published[0]?.revision, initial.revision + 1);
        assert.strictEqual(published[0]?.observedStoreRevision, 1);
        assert.strictEqual(engine.machineTurnRevision(), 0);
        assert.strictEqual(evidence.journal.sequence(), 0);
        assert.ok(Result.isSuccess(engine.dispatchFact(fact)));
        yield* engine.drain();
        assert.strictEqual(published.length, 1);
        assert.strictEqual(evidence.journal.sequence(), 0);
        yield* evidence.journal.drain();
        assert.deepStrictEqual(records, []);
        yield* evidence.close();
        yield* engine.shutdown();
        yield* Scope.close(scope, Exit.void);
      }),
  );

  // Setup: Use the selected internal ActorPublication and mailbox owners with consuming Scopes to establish subscriptions separately while prepared, active, suspended and disposed; control activation and turns with owned acknowledgement barriers. Prepared subscription is a selected internal production seam, not a current PreparedActorEngine API.
  // Action: Observe prepared replay and activation, attach an active subscriber after a turn, subscribe anew while suspended, then dispose and subscribe anew to terminal truth.
  // Assert: Prepared subscriptions replay prepared and become live on activation; active subscriptions replay the latest complete cut and follow later publications; newly suspended subscriptions replay suspended once and complete; newly disposed subscriptions replay disposed once and complete. Close every consuming Scope without timers or GC assertions.
  it.todo(
    "replays the correct lifecycle truth to prepared active suspended and disposed subscribers",
  );
});
