import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Option, Result, Scope } from "effect";

import { definition } from "../../definition/definition.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import { Diagnostic } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import type { ActorOperationRunner, ActorOwnedActionPlan } from "../actor/actor-operation-work.js";
import {
  makeActorFixture,
  makeStoreFixture,
  StoreDefinition,
  StoreMachine,
  storeRunner,
  storeSnapshot,
  type ActorFixtureOptions,
} from "./actor-fixture.js";

type ActorFixtureValue<D extends MachineDefinition> = Effect.Success<
  ReturnType<typeof makeActorFixture<D>>
>;

type ActorFixtureToClose<D extends MachineDefinition, E> = Omit<ActorFixtureValue<D>, "close"> & {
  close: () => Effect.Effect<void, E>;
};

const closeActorFixture = <D extends MachineDefinition, E>(fixture: ActorFixtureToClose<D, E>) =>
  Effect.gen(function* () {
    const closed = yield* Effect.exit(fixture.close());

    if (Exit.isFailure(closed)) {
      yield* Effect.exit(fixture.journal.close());
      yield* Effect.exit(Scope.close(fixture.ownerScope, Exit.void));

      return yield* Effect.failCause(closed.cause);
    }
  });

const withActorFixture = <D extends MachineDefinition, A, E, R>(
  options: ActorFixtureOptions<D>,
  use: (fixture: ActorFixtureValue<D>) => Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(makeActorFixture(options), use, (fixture) =>
    closeActorFixture(fixture).pipe(Effect.orDie),
  );

const DefinitionResult = definition({
  id: "runtime-next/p06-turn-scenario",
  states: ["idle", "active", "done"],
  events: {
    go: (value: number) => ({ value }),
    refuse: () => ({}),
  },
  memory: () => ({ count: 0 }),
});

const Definition = Result.getOrThrow(DefinitionResult);

const callbacks: string[] = [];

let malformedAction = false;

let actionCallbackDefect: Error | undefined;

const Machine = Result.getOrThrow(
  machine(DefinitionResult, ({ S }) => ({
    default: S.idle,
    states: {
      idle: {
        on: {
          go: [
            {
              target: S.active,
              guard: ({ snapshot }) => {
                callbacks.push(`reject:${snapshot.memory.count}`);

                return false;
              },
            },
            {
              target: S.active,
              guard: ({ snapshot }) => {
                callbacks.push(`accept:${snapshot.memory.count}`);

                return true;
              },
              updateMemory: ({ snapshot }) => {
                callbacks.push(`memory:${snapshot.memory.count}`);

                return { count: snapshot.memory.count + 1 };
              },
              actions: () => {
                callbacks.push("actions");

                if (actionCallbackDefect !== undefined) throw actionCallbackDefect;

                if (!malformedAction) return null;
                const invalid: never[] = [];
                Reflect.set(invalid, 0, { kind: "resource-lookup", descriptor: "foreign" });

                return invalid;
              },
            },
          ],
          refuse: { target: S.active, guard: () => false },
        },
      },
      active: {
        redirect: { when: ({ memory }) => memory.count === 1, target: S.done },
      },
      done: {},
    },
  })),
);

let retainedActionPlan: Option.Option<{
  params(): number;
  changeParams(value: number): void;
  mapper(): unknown;
  changeMapper(value: (value: number) => number): void;
  isFrozen(): boolean;
  optionsAreFrozen(): boolean;
}> = Option.none();

let accessorPlanGetterReads = 0;

let signalMutationBarrier: (() => void) | undefined;

const callerMapper = (value: number) => value;

const changedCallerMapper = (value: number) => value + 1;

type CallerLookupOptions = { outcomes: { success: (value: number) => number } };

const PlanMachine = Result.getOrThrow(
  machine(Result.succeed(StoreDefinition), ({ S, E, O }) => ({
    default: S.ready,
    states: {
      ready: {
        on: {
          fetch: {
            target: S.ready,
            updateMemory: ({ snapshot, event }) => {
              if (event.id === 8) signalMutationBarrier?.();

              return { count: snapshot.memory.count + 1 };
            },
            actions: ({ event }) => {
              if (event.id === 101) {
                const plan = O.cache.lookup(event.id);

                Object.defineProperty(plan, "params", {
                  configurable: true,
                  enumerable: true,
                  get: () => {
                    accessorPlanGetterReads += 1;

                    return event.id;
                  },
                });

                return plan;
              }

              if (event.id === 100) {
                const callerOptions = {
                  outcomes: { success: callerMapper },
                } satisfies CallerLookupOptions;

                const plan = O.cache.lookup(event.id, callerOptions);

                retainedActionPlan = Option.some({
                  params: () => plan.params,
                  changeParams: (value) => {
                    plan.params = value;
                  },
                  mapper: () => {
                    const options = plan.options;

                    return options?.outcomes.success;
                  },
                  changeMapper: (value) => {
                    callerOptions.outcomes.success = value;
                  },
                  isFrozen: () => Object.isFrozen(plan),
                  optionsAreFrozen: () =>
                    plan.options === undefined ? false : Object.isFrozen(plan.options),
                });

                const actions: never[] = [];

                Reflect.set(actions, 0, plan);
                Reflect.set(actions, 1, Result.getOrThrow(E.fetch(70)));

                return actions;
              }

              if (event.id === 0) return null;

              const actions: never[] = [];

              Reflect.set(actions, 0, Result.getOrThrow(E.fetch(event.id - 1)));

              return actions;
            },
          },
          start: { target: S.subscribed },
        },
      },
      subscribed: { on: { replace: { target: S.replacement }, stop: { target: S.off } } },
      replacement: { on: { stop: { target: S.off } } },
      off: {},
    },
  })),
);

const actorOwnedPlanReadonlyTypeProof = (plan: ActorOwnedActionPlan<typeof StoreDefinition>) => {
  if (plan.kind === "resource-lookup") {
    // @ts-expect-error Actor-owned plans expose copied structural parameters as deeply readonly.
    plan.params = 999;

    if (plan.options?.outcomes !== undefined) {
      // @ts-expect-error Nested plan configuration is also readonly at the runner boundary.
      plan.options.outcomes.success = callerMapper;
    }
  }
};

void actorOwnedPlanReadonlyTypeProof;

const initial = () => ({
  state: Definition.S.idle,
  memory: { count: 0 },
  context: {},
  lifecycle: "prepared" as const,
  O: {},
  timers: [],
  issues: [],
  revision: 0,
  observedStoreRevision: 0,
});

describe("runtime-next turns", () => {
  it.effect("actor fixture cleanup propagates shutdown failures after fallback cleanup", () =>
    Effect.gen(function* () {
      const shutdownFailure: Error = new Error("actor fixture shutdown failure");
      let cleanupAttempted = false;

      yield* Effect.acquireUseRelease(
        makeActorFixture({ machine: Machine, initial: initial() }),
        (fixture) =>
          Effect.gen(function* () {
            let journalClosed = false;
            let scopeFinalized = false;
            const closeJournal = fixture.journal.close.bind(fixture.journal);

            fixture.journal.close = () =>
              Effect.sync(() => {
                journalClosed = true;
              }).pipe(Effect.andThen(closeJournal()));

            yield* Scope.addFinalizer(
              fixture.ownerScope,
              Effect.sync(() => {
                scopeFinalized = true;
              }),
            );

            const closed = yield* Effect.exit(
              closeActorFixture({
                ...fixture,
                close: () => Effect.fail(shutdownFailure),
              }),
            );

            cleanupAttempted = true;
            assert.ok(Exit.isFailure(closed));
            const failure = Cause.findErrorOption(closed.cause);

            assert.ok(Option.isSome(failure));

            if (Option.isSome(failure)) assert.strictEqual(failure.value, shutdownFailure);
            assert.strictEqual(journalClosed, true);
            assert.strictEqual(scopeFinalized, true);
          }),
        (fixture) =>
          cleanupAttempted ? Effect.void : closeActorFixture(fixture).pipe(Effect.orDie),
      );
    }),
  );

  // Owner: P06.
  // Source: turn-plan.test.ts:215 "freezes one pre-turn snapshot, orders callbacks, and redirects the updated candidate".
  // Source: turn-plan.test.ts:242 "returns a no-op when every guard rejects without running later stages".
  // Source: turn-plan.test.ts:455 "builds a pure event turn candidate from an admitted event".
  // Source: turn-plan.test.ts:485 "orders machine actions and exact store targets".
  // Source: turn-plan.test.ts:500 "preserves authored false and null callback results".
  // Source: turn-plan.test.ts:892 "keeps a valid no-op plan free of synthetic changes".
  // Contract/correction: ARCH-012; refactor.md pure turn planning boundary.
  // Setup: An actor with guards, memory updates, authored false/null values, redirects, and store actions.
  // Action: Dispatch an event and observe callback order, state, memory, and store target.
  // Observable result: Each callback reads the captured pre-turn state as defined; accepted actions run in authored order and updated candidate redirects correctly.
  // Failure/cleanup: A refusing guard yields a no-op without running later callbacks or synthetic publication.
  it.effect("RN-TURN-001 event guards and callbacks use one captured pre-turn state", () =>
    Effect.gen(function* () {
      callbacks.length = 0;
      malformedAction = false;
      actionCallbackDefect = undefined;
      yield* withActorFixture({ machine: Machine, initial: initial() }, (f) =>
        Effect.gen(function* () {
          const actor = yield* f.prepared.activate();
          const receipt = yield* actor.dispatch(Result.getOrThrow(Definition.E.go(7)));

          assert.deepStrictEqual(callbacks, ["reject:0", "accept:0", "memory:0", "actions"]);
          assert.strictEqual(actor.snapshot().state, Definition.S.done);
          assert.strictEqual(actor.snapshot().memory.count, 1);
          assert.strictEqual(receipt.publicationRevision, 2);
          const before = actor.snapshot();
          const noop = yield* actor.dispatch(Result.getOrThrow(Definition.E.refuse()));
          assert.strictEqual(noop.publicationRevision, before.revision);
          assert.strictEqual(actor.snapshot(), before);
        }),
      );
    }),
  );

  // Owner: P06.
  // Source: turn-plan.test.ts:273, 411, 609, 625, 725, 747 "rejects invalid turns and retains typed/defect lanes".
  // Contract/correction: STD-05/06; refactor.md ActorEngine publication cut.
  // Setup: An actor whose action planner can return an invalid batch or throw a retained defect.
  // Action: Dispatch a malformed batch, a throwing action callback, then one valid event.
  // Observable result: Each failure publishes one issue-only revision; Failure and Defect classifications remain distinct and the callback defect keeps its cause.
  // Failure/cleanup: Failed candidates preserve state and memory; fixture release shuts down and joins all work.
  it.effect(
    "RN-TURN-002 failures publish issue-only cuts with typed and defect classifications",
    () =>
      Effect.gen(function* () {
        callbacks.length = 0;
        malformedAction = true;
        actionCallbackDefect = undefined;
        yield* withActorFixture({ machine: Machine, initial: initial() }, (f) =>
          Effect.gen(function* () {
            const actor = yield* f.prepared.activate();

            const rejected = yield* Effect.exit(
              actor.dispatch(Result.getOrThrow(Definition.E.go(7))),
            );

            assert.ok(Exit.isFailure(rejected));

            if (Exit.isFailure(rejected)) {
              const failure = Cause.findErrorOption(rejected.cause);

              assert.ok(Option.isSome(failure));

              if (Option.isSome(failure)) {
                assert.ok(failure.value instanceof Diagnostic);

                if (failure.value instanceof Diagnostic)
                  assert.strictEqual(failure.value.classification, "Failure");
              }
            }

            assert.strictEqual(actor.snapshot().state, Definition.S.idle);
            assert.strictEqual(actor.snapshot().memory.count, 0);
            assert.strictEqual(actor.snapshot().issues.length, 1);
            const failureIssue = actor.snapshot().issues[0];

            assert.ok(failureIssue instanceof Diagnostic);

            if (failureIssue instanceof Diagnostic)
              assert.strictEqual(failureIssue.classification, "Failure");
            assert.strictEqual(actor.snapshot().revision, 2);
            assert.strictEqual(f.journal.sequence(), 2);

            const defect = new Error("actions callback defect");

            malformedAction = false;
            actionCallbackDefect = defect;

            const defected = yield* Effect.exit(
              actor.dispatch(Result.getOrThrow(Definition.E.go(8))),
            );

            assert.ok(Exit.isFailure(defected));

            if (Exit.isFailure(defected)) {
              const foundDefect = Cause.findErrorOption(defected.cause);

              assert.ok(Option.isSome(foundDefect));

              if (Option.isSome(foundDefect)) {
                assert.ok(foundDefect.value instanceof Diagnostic);

                if (foundDefect.value instanceof Diagnostic) {
                  assert.strictEqual(foundDefect.value.classification, "Defect");
                  assert.strictEqual(foundDefect.value.cause, defect);
                }
              }
            }

            assert.strictEqual(actor.snapshot().state, Definition.S.idle);
            assert.strictEqual(actor.snapshot().memory.count, 0);
            assert.strictEqual(actor.snapshot().issues.length, 1);
            const defectIssue = actor.snapshot().issues[0];

            assert.ok(defectIssue instanceof Diagnostic);

            if (defectIssue instanceof Diagnostic) {
              assert.strictEqual(defectIssue.classification, "Defect");
            }

            assert.strictEqual(f.journal.sequence(), 3);

            actionCallbackDefect = undefined;
            const accepted = yield* actor.dispatch(Result.getOrThrow(Definition.E.go(7)));
            assert.strictEqual(accepted.publicationRevision, 4);
            assert.strictEqual(actor.snapshot().state, Definition.S.done);
          }),
        );
      }),
  );

  it.effect("constructed operation accessor rejection never replays its getter", () =>
    Effect.gen(function* () {
      accessorPlanGetterReads = 0;
      let finiteStarts = 0;

      yield* withActorFixture(
        {
          machine: PlanMachine,
          initial: storeSnapshot(),
          store: makeStoreFixture().port,
          operationRunner: {
            runFinite: (plan, signal, occurrence) => {
              finiteStarts += 1;

              return storeRunner.runFinite(plan, signal, occurrence);
            },
            runActivity: (...args) => storeRunner.runActivity(...args),
          },
        },
        (f) =>
          Effect.gen(function* () {
            const actor = yield* f.prepared.activate();

            const rejected = yield* Effect.exit(
              actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(101))),
            );

            assert.ok(Exit.isFailure(rejected));
            assert.strictEqual(accessorPlanGetterReads, 0);
            assert.strictEqual(finiteStarts, 0);
            assert.strictEqual(actor.snapshot().memory.count, 0);
            assert.strictEqual(actor.snapshot().issues.length, 1);
            assert.strictEqual(actor.snapshot().issues[0]?.details.issue, "invalid-action");
            assert.strictEqual(actor.snapshot().revision, 2);
          }),
      );
    }),
  );

  // Owner: P06.
  // Source: turn-plan.test.ts:509 "reconciles activity lifetimes against the prior snapshot".
  // Source: turn-plan.test.ts:538 "cancels removed activity before late completion can apply".
  // Source: turn-plan.test.ts:876 "plans suspension with cancellation before publication".
  // Contract/correction: ARCH-012; refactor.md ActorEngine activities and operation cursors.
  // Setup: An actor with one live activity and a replacement under an operation key.
  // Action: Replace or remove the activity, then deliver old and current completion facts.
  // Observable result: Old work is cancelled first and its late completion has no effect; only the current occurrence updates the actor once.
  // Failure/cleanup: Shutdown joins remaining work and releases its resources.
  it.effect("RN-TURN-003 activity replacement cancels old work before late completion", () =>
    Effect.gen(function* () {
      const store = makeStoreFixture();
      const held = yield* Deferred.make<void>();
      const oldStarted = yield* Deferred.make<void>();
      const currentStarted = yield* Deferred.make<void>();
      const occurrences: Parameters<typeof storeRunner.runFinite>[2][] = [];
      const signals: AbortSignal[] = [];

      yield* withActorFixture(
        {
          machine: StoreMachine,
          initial: storeSnapshot(),
          store: store.port,
          operationRunner: {
            runFinite: (...args) => storeRunner.runFinite(...args),
            runActivity: (_plan, signal, occurrence) => {
              occurrences.push(occurrence);
              signals.push(signal);

              if (occurrences.length === 1) Deferred.doneUnsafe(oldStarted, Effect.void);

              if (occurrences.length === 2) Deferred.doneUnsafe(currentStarted, Effect.void);

              return Deferred.await(held);
            },
          },
        },
        (f) =>
          Effect.gen(function* () {
            const actor = yield* f.prepared.activate();

            yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.start()));
            const retained = actor.snapshot().O.cache;
            yield* Deferred.await(oldStarted);
            const old = occurrences[0];

            assert.ok(old !== undefined);
            yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.replace()));
            yield* Deferred.await(currentStarted);
            const current = occurrences[1];

            assert.ok(current !== undefined);
            assert.notStrictEqual(old, current);
            assert.strictEqual(signals[0]?.aborted, true);
            const replacementRevision = actor.snapshot().revision;

            yield* Result.getOrThrow(
              actor.offerOperationFact({ _tag: "value", occurrence: old, value: 11 }),
            );
            assert.strictEqual(actor.snapshot().revision, replacementRevision);
            yield* Result.getOrThrow(
              actor.offerOperationFact({ _tag: "value", occurrence: current, value: 42 }),
            );
            assert.strictEqual(actor.snapshot().O.cache.getData([7]), 42);
            assert.strictEqual(retained.getState([7]).status, "missing");
            yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.stop()));
            assert.strictEqual(signals[1]?.aborted, true);
            const stoppedRevision = actor.snapshot().revision;

            yield* Result.getOrThrow(
              actor.offerOperationFact({ _tag: "value", occurrence: current, value: 99 }),
            );
            assert.strictEqual(actor.snapshot().revision, stoppedRevision);
            assert.strictEqual(actor.snapshot().O.cache.getData([7]), 42);
          }),
      );
    }),
  );

  // Owner: P06.
  // Source: refactor.md STD-03/11 and ActorEngine publication cut.
  // Contract/correction: Capture an owned action plan before preflight; retain opaque callback identity.
  // Setup: A finite lookup is retained by its caller while a 71-event mapped continuation crosses the 64-event yield.
  // Action: Mutate the caller's plan during that yield, then allow the lookup runner to execute.
  // Observable result: Runner params still match the canonical key and preflight; the original plan remains caller-owned.
  // Failure/cleanup: The admitted fact projects once and actor shutdown joins the runner.
  it.effect("mapped-yield caller mutation cannot diverge a preflight operation plan", () =>
    Effect.gen(function* () {
      retainedActionPlan = Option.none();
      const mutationAt64 = yield* Deferred.make<void>();
      const projected = yield* Deferred.make<void>();
      const mappedSteps: number[] = [];
      const store = makeStoreFixture();

      const port = {
        ...store.port,
        prepareProjection(fact: Parameters<typeof store.port.prepareProjection>[0]) {
          const permit = store.port.prepareProjection(fact);

          if (fact._tag === "terminal") Deferred.doneUnsafe(projected, Effect.void);

          return permit;
        },
      } satisfies typeof store.port;

      const observed: {
        params: number;
        key: unknown;
        mapper: unknown;
      }[] = [];

      const runner: ActorOperationRunner<typeof StoreDefinition> = {
        runFinite: (plan, signal, occurrence) => {
          if (plan.kind === "resource-lookup") {
            observed.push({
              params: plan.params,
              key: occurrence.key[0],
              mapper: plan.options?.outcomes?.success,
            });
          }

          return storeRunner.runFinite(plan, signal, occurrence);
        },
        runActivity: (...args) => storeRunner.runActivity(...args),
      };

      signalMutationBarrier = () => {
        mappedSteps.push(8);
        Deferred.doneUnsafe(mutationAt64, Effect.void);
      };

      const result = yield* Effect.acquireUseRelease(
        makeActorFixture({
          machine: PlanMachine,
          initial: storeSnapshot(),
          store: port,
          operationRunner: runner,
          journalCapacity: 160,
        }),
        (f) =>
          Effect.gen(function* () {
            const actor = yield* f.prepared.activate();

            const mutator = Effect.gen(function* () {
              yield* Deferred.await(mutationAt64);

              if (Option.isNone(retainedActionPlan))
                return yield* Effect.die(new Error("The caller's action plan was not retained"));

              retainedActionPlan.value.changeParams(999);
              retainedActionPlan.value.changeMapper(changedCallerMapper);
            }).pipe(Effect.forkChild);

            const mutationFiber = yield* mutator;

            yield* actor.dispatch(Result.getOrThrow(StoreDefinition.E.fetch(100)));
            yield* Fiber.join(mutationFiber);
            yield* Deferred.await(projected);
            yield* actor.flush();

            return actor.snapshot().O.cache.getData([100]);
          }),
        closeActorFixture,
      );

      signalMutationBarrier = undefined;
      assert.deepStrictEqual(mappedSteps, [8]);
      assert.deepStrictEqual(
        Option.isSome(retainedActionPlan)
          ? [
              retainedActionPlan.value.params(),
              retainedActionPlan.value.mapper() === changedCallerMapper,
              retainedActionPlan.value.isFrozen(),
              retainedActionPlan.value.optionsAreFrozen(),
            ]
          : [],
        [999, true, false, false],
      );
      assert.strictEqual(observed.length, 1);
      assert.deepStrictEqual(observed[0], { params: 100, key: 100, mapper: callerMapper });
      assert.strictEqual(result, 100);
    }),
  );
});
