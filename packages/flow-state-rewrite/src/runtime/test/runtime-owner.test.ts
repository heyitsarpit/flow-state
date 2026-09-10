import { assert, describe, it } from "@effect/vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Result, type Types } from "effect";

import { app, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import { makeRuntimeOwner } from "../runtime-owner.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { actorRef } from "../actor-ref.js";
import { prepareActorSnapshot } from "../actor-engine.js";
import { runtimeOwner, runtimeSetup } from "../runtime.js";

class FirstService extends Context.Service<FirstService, string>()(
  "RuntimeOwnerTest/FirstService",
) {}

class SecondService extends Context.Service<SecondService, number>()(
  "RuntimeOwnerTest/SecondService",
) {}

type OrderedFirst = { readonly id: "first" };
type OrderedSecond = { readonly id: "second" };
type OrderedThird = { readonly id: "third" };

class OrderedFirstService extends Context.Service<OrderedFirstService, OrderedFirst>()(
  "RuntimeOwnerTest/OrderedFirstService",
) {}

class OrderedSecondService extends Context.Service<OrderedSecondService, OrderedSecond>()(
  "RuntimeOwnerTest/OrderedSecondService",
) {}

class OrderedThirdService extends Context.Service<OrderedThirdService, OrderedThird>()(
  "RuntimeOwnerTest/OrderedThirdService",
) {}

const HandleDefinitionResult = definition({
  id: "runtime-owner/handle",
  states: ["ready"],
  events: { opened: "bare" },
});
const HandleDefinition = Result.getOrThrow(HandleDefinitionResult);
const HandleMachine = Result.getOrThrow(
  machine(HandleDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: { on: { opened: { target: S.ready } } } },
  })),
);
const HandleApp = app({
  id: "runtime-owner/handle-app",
  persistenceVersion: "1",
  modules: [module({ id: "runtime-owner/handle-module", machines: { handle: HandleMachine } })],
});
const HandleEvent = Result.getOrThrow(HandleDefinition.E.opened());
const initialHandleSnapshot = () =>
  Result.getOrThrow(
    prepareActorSnapshot(HandleMachine, {
      state: HandleDefinition.S.ready,
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

type Probe = {
  readonly acquisitions: Array<string>;
  readonly cleanups: Array<string>;
  readonly visible: Array<Readonly<{ first: string; second: number }>>;
};

const makeProviderPlan = (
  probe: Probe,
  firstGate: Deferred.Deferred<void>,
  secondEntered: Deferred.Deferred<void>,
  secondGate: Deferred.Deferred<void>,
) => [
  {
    service: FirstService,
    acquire: Effect.acquireRelease(
      Effect.gen(function* () {
        probe.acquisitions.push("first");
        yield* Deferred.await(firstGate);
        return "first-service";
      }),
      () => Effect.sync(() => probe.cleanups.push("first")),
    ),
  },
  {
    service: SecondService,
    acquire: Effect.acquireRelease(
      Effect.gen(function* () {
        probe.acquisitions.push("second");
        yield* Deferred.succeed(secondEntered, undefined);
        yield* Deferred.await(secondGate);
        return 2;
      }),
      () => Effect.sync(() => probe.cleanups.push("second")),
      { interruptible: true },
    ),
  },
];

describe("runtime owner", () => {
  it.effect("publishes only a complete context and rolls back partial acquisition", () =>
    Effect.gen(function* () {
      const successProbe: Probe = { acquisitions: [], cleanups: [], visible: [] };
      const firstGate = yield* Deferred.make<void>();
      const secondEntered = yield* Deferred.make<void>();
      const secondGate = yield* Deferred.make<void>();
      const successOwner = makeRuntimeOwner({
        providers: makeProviderPlan(successProbe, firstGate, secondEntered, secondGate),
        expose: Effect.gen(function* () {
          yield* Effect.acquireRelease(Effect.succeed(undefined), () =>
            Effect.sync(() => successProbe.cleanups.push("exposure")),
          );
          const exposed = {
            first: yield* Effect.service(FirstService),
            second: yield* Effect.service(SecondService),
          };
          return yield* Effect.sync(() => {
            successProbe.visible.push(exposed);
            return exposed;
          });
        }),
      });
      type SuccessExposure = { first: string; second: number };
      type SuccessReady = ReturnType<typeof successOwner.ready>;
      type SuccessReadyProof = Types.Equals<
        SuccessReady,
        Effect.Effect<SuccessExposure, never, never>
      >;
      const successReadyProof: SuccessReadyProof = true;
      void successReadyProof;

      const ready = yield* Effect.forkChild(Effect.exit(successOwner.ready()), {
        startImmediately: true,
      });
      yield* Deferred.succeed(firstGate, undefined);
      yield* Deferred.await(secondEntered);

      assert.deepStrictEqual(successProbe, {
        acquisitions: ["first", "second"],
        cleanups: [],
        visible: [],
      });

      yield* Deferred.succeed(secondGate, undefined);
      const readyExit = yield* Fiber.join(ready);
      assert.ok(Exit.isSuccess(readyExit));
      if (Exit.isSuccess(readyExit)) {
        assert.deepStrictEqual(readyExit.value, { first: "first-service", second: 2 });
      }
      assert.deepStrictEqual(successProbe.visible, [{ first: "first-service", second: 2 }]);
      assert.strictEqual(yield* Effect.exit(successOwner.ready()), readyExit);
      yield* successOwner.close();
      assert.deepStrictEqual(successProbe.cleanups, ["exposure", "second", "first"]);
      yield* successOwner.close();
      assert.deepStrictEqual(successProbe.cleanups, ["exposure", "second", "first"]);

      const failureProbe: Probe = { acquisitions: [], cleanups: [], visible: [] };
      const failureFirstGate = yield* Deferred.make<void>();
      const failureSecondEntered = yield* Deferred.make<void>();
      const failureSecondGate = yield* Deferred.make<void>();
      yield* Deferred.succeed(failureFirstGate, undefined);
      yield* Deferred.succeed(failureSecondGate, undefined);
      const failureOwner = makeRuntimeOwner({
        providers: makeProviderPlan(
          failureProbe,
          failureFirstGate,
          failureSecondEntered,
          failureSecondGate,
        ),
        expose: Effect.fail("exposure-failed" as const),
      });
      const failureExit = yield* Effect.exit(failureOwner.ready());

      assert.ok(Exit.isFailure(failureExit));
      if (Exit.isFailure(failureExit)) {
        const typedFailure = failureExit.cause.reasons.find(Cause.isFailReason);
        assert.strictEqual(typedFailure?.error, "exposure-failed");
      }
      assert.deepStrictEqual(failureProbe, {
        acquisitions: ["first", "second"],
        cleanups: ["second", "first"],
        visible: [],
      });
      assert.strictEqual(yield* Effect.exit(failureOwner.ready()), failureExit);

      const acquisitionFailureProbe: Probe = { acquisitions: [], cleanups: [], visible: [] };
      const acquisitionFailureOwner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.acquireRelease(
              Effect.sync(() => {
                acquisitionFailureProbe.acquisitions.push("first");
                return "first-service";
              }),
              () => Effect.sync(() => acquisitionFailureProbe.cleanups.push("first")),
            ),
          },
          {
            service: SecondService,
            acquire: Effect.fail("acquisition-failed" as const),
          },
        ],
        expose: Effect.fail("exposure-failed" as const),
      });
      const acquisitionFailureExit = yield* Effect.exit(acquisitionFailureOwner.ready());

      assert.ok(Exit.isFailure(acquisitionFailureExit));
      if (Exit.isFailure(acquisitionFailureExit)) {
        const typedFailure = acquisitionFailureExit.cause.reasons.find(Cause.isFailReason);
        assert.strictEqual(typedFailure?.error, "acquisition-failed");
      }
      assert.deepStrictEqual(acquisitionFailureProbe, {
        acquisitions: ["first"],
        cleanups: ["first"],
        visible: [],
      });

      const defectProbe: Probe = { acquisitions: [], cleanups: [], visible: [] };
      const defectFirstGate = yield* Deferred.make<void>();
      const defectSecondEntered = yield* Deferred.make<void>();
      const defectSecondGate = yield* Deferred.make<void>();
      yield* Deferred.succeed(defectFirstGate, undefined);
      yield* Deferred.succeed(defectSecondGate, undefined);
      const defect = new Error("exposure-defect");
      const defectOwner = makeRuntimeOwner({
        providers: makeProviderPlan(
          defectProbe,
          defectFirstGate,
          defectSecondEntered,
          defectSecondGate,
        ),
        expose: Effect.die(defect),
      });
      const defectExit = yield* Effect.exit(defectOwner.ready());
      const cachedDefectExit = yield* Effect.exit(defectOwner.ready());

      assert.strictEqual(cachedDefectExit, defectExit);
      assert.ok(Exit.isFailure(defectExit));
      if (Exit.isFailure(defectExit)) {
        assert.strictEqual(Cause.hasDies(defectExit.cause), true);
        const defectReason = defectExit.cause.reasons.find(Cause.isDieReason);
        assert.ok(defectReason !== undefined);
        assert.strictEqual(defectReason.defect, defect);
        assert.strictEqual(defectExit.cause.reasons.length, 1);
        assert.strictEqual(Cause.hasFails(defectExit.cause), false);
        assert.strictEqual(Cause.hasInterrupts(defectExit.cause), false);
      }
      assert.deepStrictEqual(defectProbe, {
        acquisitions: ["first", "second"],
        cleanups: ["second", "first"],
        visible: [],
      });
      yield* defectOwner.close();
      assert.deepStrictEqual(defectProbe.cleanups, ["second", "first"]);

      const interruptionProbe: Probe = { acquisitions: [], cleanups: [], visible: [] };
      const interruptionFirstGate = yield* Deferred.make<void>();
      const interruptionSecondEntered = yield* Deferred.make<void>();
      const interruptionSecondGate = yield* Deferred.make<void>();
      const interruptionOwner = makeRuntimeOwner({
        providers: makeProviderPlan(
          interruptionProbe,
          interruptionFirstGate,
          interruptionSecondEntered,
          interruptionSecondGate,
        ),
        expose: Effect.succeed({ first: "unreachable", second: 0 }),
      });
      const interruptionFiber = yield* Effect.forkChild(interruptionOwner.ready(), {
        startImmediately: true,
      });
      yield* Deferred.succeed(interruptionFirstGate, undefined);
      yield* Deferred.await(interruptionSecondEntered);
      yield* Fiber.interrupt(interruptionFiber);
      const interruptionExit = yield* Fiber.await(interruptionFiber);
      const cachedInterruptionExit = yield* Effect.exit(interruptionOwner.ready());

      assert.strictEqual(cachedInterruptionExit, interruptionExit);
      assert.ok(Exit.isFailure(interruptionExit));
      assert.ok(Exit.hasInterrupts(interruptionExit));
      if (Exit.isFailure(interruptionExit)) {
        assert.strictEqual(Cause.hasInterruptsOnly(interruptionExit.cause), true);
        assert.strictEqual(Cause.hasFails(interruptionExit.cause), false);
        assert.strictEqual(Cause.hasDies(interruptionExit.cause), false);
      }
      assert.deepStrictEqual(interruptionProbe, {
        acquisitions: ["first", "second"],
        cleanups: ["first"],
        visible: [],
      });
      const interruptionCloseExit = yield* Effect.exit(interruptionOwner.close());
      assert.deepStrictEqual(interruptionCloseExit, interruptionExit);
      assert.deepStrictEqual(interruptionProbe.cleanups, ["first"]);
    }),
  );

  it.effect("R05 ARCH-007A SEM-027 concurrent ready callers share one terminal acquisition", () =>
    Effect.gen(function* () {
      const waiterAcquisitionEntered = yield* Deferred.make<void>();
      const waiterAcquisitionGate = yield* Deferred.make<void>();
      let waiterAcquisitions = 0;
      const waiterOwner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.acquireRelease(
              Effect.gen(function* () {
                waiterAcquisitions += 1;
                yield* Deferred.succeed(waiterAcquisitionEntered, undefined);
                yield* Deferred.await(waiterAcquisitionGate);
                return "waiter-service";
              }),
              () => Effect.void,
            ),
          },
        ],
        expose: Effect.service(FirstService),
      });
      const leader = yield* Effect.forkChild(Effect.exit(waiterOwner.ready()), {
        startImmediately: true,
      });
      yield* Deferred.await(waiterAcquisitionEntered);
      const waiter = yield* Effect.forkChild(Effect.exit(waiterOwner.ready()), {
        startImmediately: true,
      });
      yield* Fiber.interrupt(waiter);
      const waiterExit = yield* Fiber.await(waiter);
      assert.ok(Exit.isFailure(waiterExit));
      if (Exit.isFailure(waiterExit)) {
        assert.strictEqual(Cause.hasInterruptsOnly(waiterExit.cause), true);
        assert.strictEqual(Cause.hasFails(waiterExit.cause), false);
        assert.strictEqual(Cause.hasDies(waiterExit.cause), false);
      }
      assert.strictEqual(waiterAcquisitions, 1);
      yield* Deferred.succeed(waiterAcquisitionGate, undefined);
      const leaderExit = yield* Fiber.join(leader);
      assert.ok(Exit.isSuccess(leaderExit));
      assert.strictEqual(yield* Effect.exit(waiterOwner.ready()), leaderExit);
      assert.strictEqual(waiterAcquisitions, 1);
      yield* waiterOwner.close();

      const callerCount = 4;
      const acquisitionEntered = yield* Deferred.make<void>();
      const acquisitionGate = yield* Deferred.make<void>();
      let acquisitions = 0;
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.acquireRelease(
              Effect.gen(function* () {
                acquisitions += 1;
                yield* Deferred.succeed(acquisitionEntered, undefined);
                yield* Deferred.await(acquisitionGate);
                return "shared-service";
              }),
              () => Effect.void,
            ),
          },
        ],
        expose: Effect.service(FirstService),
      });
      const callers = yield* Effect.all(
        Array.from({ length: callerCount }, () =>
          Effect.forkChild(Effect.exit(owner.ready()), { startImmediately: true }),
        ),
        { concurrency: 1 },
      );

      yield* Deferred.await(acquisitionEntered);
      assert.strictEqual(acquisitions, 1);
      yield* Deferred.succeed(acquisitionGate, undefined);

      const successExits = yield* Effect.all(
        callers.map((caller) => Fiber.join(caller)),
        {
          concurrency: callerCount,
        },
      );
      const successExit = successExits[0];
      assert.ok(successExit !== undefined);
      assert.ok(Exit.isSuccess(successExit));
      for (const callerExit of successExits.slice(1)) {
        assert.strictEqual(callerExit, successExit);
      }
      assert.strictEqual(yield* Effect.exit(owner.ready()), successExit);
      assert.strictEqual(acquisitions, 1);
      yield* owner.close();

      const failureEntered = yield* Deferred.make<void>();
      const failureGate = yield* Deferred.make<void>();
      let failureAcquisitions = 0;
      const failureOwner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.gen(function* () {
              failureAcquisitions += 1;
              yield* Deferred.succeed(failureEntered, undefined);
              yield* Deferred.await(failureGate);
              return yield* Effect.fail("shared-failure" as const);
            }),
          },
        ],
        expose: Effect.succeed("unreachable"),
      });
      const failureCallers = yield* Effect.all(
        Array.from({ length: callerCount }, () =>
          Effect.forkChild(Effect.exit(failureOwner.ready()), { startImmediately: true }),
        ),
        { concurrency: 1 },
      );

      yield* Deferred.await(failureEntered);
      assert.strictEqual(failureAcquisitions, 1);
      yield* Deferred.succeed(failureGate, undefined);

      const failureExits = yield* Effect.all(
        failureCallers.map((caller) => Fiber.join(caller)),
        { concurrency: callerCount },
      );
      const failureExit = failureExits[0];
      assert.ok(failureExit !== undefined);
      assert.ok(Exit.isFailure(failureExit));
      if (Exit.isFailure(failureExit)) {
        const typedFailure = failureExit.cause.reasons.find(Cause.isFailReason);
        assert.strictEqual(typedFailure?.error, "shared-failure");
      }
      for (const callerExit of failureExits.slice(1)) {
        assert.strictEqual(callerExit, failureExit);
      }
      assert.strictEqual(yield* Effect.exit(failureOwner.ready()), failureExit);
      assert.strictEqual(failureAcquisitions, 1);
    }),
  );

  it.effect("acquires providers in declaration order with predecessor services installed", () =>
    Effect.gen(function* () {
      const firstService: OrderedFirst = { id: "first" };
      const secondService: OrderedSecond = { id: "second" };
      const thirdService: OrderedThird = { id: "third" };
      const trace: Array<string> = [];
      const firstGate = yield* Deferred.make<void>();
      const secondEntered = yield* Deferred.make<void>();
      const secondGate = yield* Deferred.make<void>();
      const thirdEntered = yield* Deferred.make<void>();
      const thirdGate = yield* Deferred.make<void>();
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: OrderedFirstService,
            acquire: Effect.acquireRelease(
              Effect.gen(function* () {
                trace.push("start1");
                yield* Deferred.await(firstGate);
                trace.push("end1");
                return firstService;
              }),
              () => Effect.sync(() => trace.push("release1")),
            ),
          },
          {
            service: OrderedSecondService,
            acquire: Effect.acquireRelease(
              Effect.gen(function* () {
                trace.push("start2");
                const first = yield* Effect.service(OrderedFirstService);
                assert.strictEqual(first, firstService);
                yield* Deferred.succeed(secondEntered, undefined);
                yield* Deferred.await(secondGate);
                trace.push("end2");
                return secondService;
              }),
              () => Effect.sync(() => trace.push("release2")),
            ),
          },
          {
            service: OrderedThirdService,
            acquire: Effect.acquireRelease(
              Effect.gen(function* () {
                trace.push("start3");
                yield* Deferred.succeed(thirdEntered, undefined);
                yield* Deferred.await(thirdGate);
                trace.push("end3");
                return thirdService;
              }),
              () => Effect.sync(() => trace.push("release3")),
            ),
          },
        ],
        expose: Effect.gen(function* () {
          return {
            first: yield* Effect.service(OrderedFirstService),
            second: yield* Effect.service(OrderedSecondService),
            third: yield* Effect.service(OrderedThirdService),
          };
        }),
      });
      const ready = yield* Effect.forkChild(Effect.exit(owner.ready()), {
        startImmediately: true,
      });

      yield* Deferred.succeed(firstGate, undefined);
      yield* Deferred.await(secondEntered);
      assert.deepStrictEqual(trace, ["start1", "end1", "start2"]);

      yield* Deferred.succeed(secondGate, undefined);
      yield* Deferred.await(thirdEntered);
      assert.deepStrictEqual(trace, ["start1", "end1", "start2", "end2", "start3"]);

      yield* Deferred.succeed(thirdGate, undefined);
      const readyExit = yield* Fiber.join(ready);
      assert.ok(Exit.isSuccess(readyExit));
      assert.deepStrictEqual(trace, ["start1", "end1", "start2", "end2", "start3", "end3"]);
      assert.deepStrictEqual(yield* Effect.exit(owner.ready()), readyExit);
      yield* owner.close();
      assert.deepStrictEqual(trace, [
        "start1",
        "end1",
        "start2",
        "end2",
        "start3",
        "end3",
        "release3",
        "release2",
        "release1",
      ]);
      yield* owner.close();
      assert.deepStrictEqual(trace, [
        "start1",
        "end1",
        "start2",
        "end2",
        "start3",
        "end3",
        "release3",
        "release2",
        "release1",
      ]);

      const typedFailureTrace: Array<string> = [];
      const typedFailureOwner = makeRuntimeOwner({
        providers: [
          {
            service: OrderedFirstService,
            acquire: Effect.acquireRelease(
              Effect.sync(() => {
                typedFailureTrace.push("start1");
                return firstService;
              }),
              () => Effect.sync(() => typedFailureTrace.push("release1")),
            ),
          },
          {
            service: OrderedSecondService,
            acquire: Effect.fail("provider-2-failed" as const),
          },
          {
            service: OrderedThirdService,
            acquire: Effect.sync(() => {
              typedFailureTrace.push("start3");
              return thirdService;
            }),
          },
        ],
        expose: Effect.succeed(undefined),
      });
      const typedFailureExit = yield* Effect.exit(typedFailureOwner.ready());
      assert.ok(Exit.isFailure(typedFailureExit));
      if (Exit.isFailure(typedFailureExit)) {
        const typedFailure = typedFailureExit.cause.reasons.find(Cause.isFailReason);
        assert.strictEqual(typedFailure?.error, "provider-2-failed");
      }
      assert.deepStrictEqual(typedFailureTrace, ["start1", "release1"]);
      assert.strictEqual(yield* Effect.exit(typedFailureOwner.ready()), typedFailureExit);

      const defectTrace: Array<string> = [];
      const defect = new Error("provider-2-defect");
      const defectOwner = makeRuntimeOwner({
        providers: [
          {
            service: OrderedFirstService,
            acquire: Effect.acquireRelease(
              Effect.sync(() => {
                defectTrace.push("start1");
                return firstService;
              }),
              () => Effect.sync(() => defectTrace.push("release1")),
            ),
          },
          {
            service: OrderedSecondService,
            acquire: Effect.die(defect),
          },
          {
            service: OrderedThirdService,
            acquire: Effect.sync(() => {
              defectTrace.push("start3");
              return thirdService;
            }),
          },
        ],
        expose: Effect.succeed(undefined),
      });
      const defectExit = yield* Effect.exit(defectOwner.ready());
      const cachedDefectExit = yield* Effect.exit(defectOwner.ready());
      assert.strictEqual(cachedDefectExit, defectExit);
      assert.ok(Exit.isFailure(defectExit));
      if (Exit.isFailure(defectExit)) {
        assert.strictEqual(Cause.hasDies(defectExit.cause), true);
        const defectReason = defectExit.cause.reasons.find(Cause.isDieReason);
        assert.ok(defectReason !== undefined);
        assert.strictEqual(defectReason.defect, defect);
        assert.strictEqual(Cause.hasFails(defectExit.cause), false);
        assert.strictEqual(Cause.hasInterrupts(defectExit.cause), false);
      }
      assert.deepStrictEqual(defectTrace, ["start1", "release1"]);

      const interruptionTrace: Array<string> = [];
      const interruptionEntered = yield* Deferred.make<void>();
      const interruptionGate = yield* Deferred.make<void>();
      const interruptionOwner = makeRuntimeOwner({
        providers: [
          {
            service: OrderedFirstService,
            acquire: Effect.acquireRelease(
              Effect.sync(() => {
                interruptionTrace.push("start1");
                return firstService;
              }),
              () => Effect.sync(() => interruptionTrace.push("release1")),
            ),
          },
          {
            service: OrderedSecondService,
            acquire: Effect.gen(function* () {
              interruptionTrace.push("start2");
              yield* Deferred.succeed(interruptionEntered, undefined);
              yield* Deferred.await(interruptionGate);
              return secondService;
            }),
          },
          {
            service: OrderedThirdService,
            acquire: Effect.sync(() => {
              interruptionTrace.push("start3");
              return thirdService;
            }),
          },
        ],
        expose: Effect.succeed(undefined),
      });
      const interruptionFiber = yield* Effect.forkChild(interruptionOwner.ready(), {
        startImmediately: true,
      });
      yield* Deferred.await(interruptionEntered);
      yield* Fiber.interrupt(interruptionFiber);
      const interruptionExit = yield* Fiber.await(interruptionFiber);
      const cachedInterruptionExit = yield* Effect.exit(interruptionOwner.ready());
      assert.strictEqual(cachedInterruptionExit, interruptionExit);
      assert.ok(Exit.isFailure(interruptionExit));
      if (Exit.isFailure(interruptionExit)) {
        assert.strictEqual(Cause.hasInterruptsOnly(interruptionExit.cause), true);
        assert.strictEqual(Cause.hasFails(interruptionExit.cause), false);
        assert.strictEqual(Cause.hasDies(interruptionExit.cause), false);
      }
      assert.deepStrictEqual(interruptionTrace, ["start1", "start2", "release1"]);
    }),
  );

  it.effect("disposal wins bootstrap and cleans the acquired prefix once in reverse order", () =>
    Effect.gen(function* () {
      const secondAcquisitionGate = yield* Deferred.make<void>();
      const thirdAcquisitionEntered = yield* Deferred.make<void>();
      const thirdAcquisitionGate = yield* Deferred.make<void>();
      const secondCleanupEntered = yield* Deferred.make<void>();
      const secondCleanupGate = yield* Deferred.make<void>();
      const firstCleanupEntered = yield* Deferred.make<void>();
      const firstCleanupGate = yield* Deferred.make<void>();
      const trace: Array<string> = [];
      const visible: Array<string> = [];
      const cleanupDefect = new Error("second-cleanup-defect");

      const owner = makeRuntimeOwner({
        providers: [
          {
            service: OrderedFirstService,
            acquire: Effect.acquireRelease(
              Effect.sync(() => {
                trace.push("acquire:first");
                return { id: "first" } as const;
              }),
              () =>
                Effect.gen(function* () {
                  trace.push("release:first:start");
                  yield* Deferred.succeed(firstCleanupEntered, undefined);
                  yield* Deferred.await(firstCleanupGate);
                  trace.push("release:first:end");
                }),
            ),
          },
          {
            service: OrderedSecondService,
            acquire: Effect.acquireRelease(
              Effect.gen(function* () {
                trace.push("acquire:second:start");
                yield* Deferred.await(secondAcquisitionGate);
                trace.push("acquire:second:end");
                return { id: "second" } as const;
              }),
              () =>
                Effect.gen(function* () {
                  trace.push("release:second:start");
                  yield* Deferred.succeed(secondCleanupEntered, undefined);
                  yield* Deferred.await(secondCleanupGate);
                  trace.push("release:second:end");
                  yield* Effect.die(cleanupDefect);
                }),
              { interruptible: true },
            ),
          },
          {
            service: OrderedThirdService,
            acquire: Effect.acquireRelease(
              Effect.gen(function* () {
                trace.push("acquire:third:start");
                yield* Deferred.succeed(thirdAcquisitionEntered, undefined);
                yield* Deferred.await(thirdAcquisitionGate);
                return { id: "third" } as const;
              }),
              () => Effect.sync(() => trace.push("release:third")),
              { interruptible: true },
            ),
          },
        ],
        expose: Effect.sync(() => {
          visible.push("exposed");
          return "exposed";
        }),
      });

      const readyLeader = yield* Effect.forkChild(owner.ready(), {
        startImmediately: true,
      });
      yield* Deferred.succeed(secondAcquisitionGate, undefined);
      yield* Deferred.await(thirdAcquisitionEntered);
      const readyWaiter = yield* Effect.forkChild(Effect.exit(owner.ready()), {
        startImmediately: true,
      });

      const disposeLeader = yield* Effect.forkChild(Effect.exit(owner.close()), {
        startImmediately: true,
      });
      const disposeWaiter = yield* Effect.forkChild(Effect.exit(owner.close()), {
        startImmediately: true,
      });
      yield* Deferred.succeed(thirdAcquisitionGate, undefined);
      yield* Deferred.succeed(secondCleanupGate, undefined);
      yield* Deferred.succeed(firstCleanupGate, undefined);

      const readyLeaderExit = yield* Fiber.await(readyLeader);
      const readyWaiterExit = yield* Fiber.join(readyWaiter);
      const disposeLeaderExit = yield* Fiber.join(disposeLeader);
      const disposeWaiterExit = yield* Fiber.join(disposeWaiter);

      assert.strictEqual(readyWaiterExit, readyLeaderExit);
      assert.ok(Exit.isFailure(readyLeaderExit));
      if (Exit.isFailure(readyLeaderExit)) {
        assert.strictEqual(Cause.hasInterrupts(readyLeaderExit.cause), true);
        assert.strictEqual(Cause.hasFails(readyLeaderExit.cause), false);
        assert.strictEqual(Cause.hasDies(readyLeaderExit.cause), true);
        const cleanupReason = readyLeaderExit.cause.reasons.find(
          (reason) => Cause.isDieReason(reason) && reason.defect === cleanupDefect,
        );
        assert.ok(cleanupReason !== undefined);
      }
      assert.strictEqual(disposeWaiterExit, disposeLeaderExit);
      assert.ok(Exit.isFailure(disposeLeaderExit));
      if (Exit.isFailure(disposeLeaderExit) && Exit.isFailure(readyLeaderExit)) {
        assert.strictEqual(disposeLeaderExit.cause, readyLeaderExit.cause);
      }
      assert.strictEqual(yield* Effect.exit(owner.ready()), readyLeaderExit);
      assert.strictEqual(yield* Effect.exit(owner.close()), disposeLeaderExit);
      assert.deepStrictEqual(trace, [
        "acquire:first",
        "acquire:second:start",
        "acquire:second:end",
        "acquire:third:start",
        "release:second:start",
        "release:second:end",
        "release:first:start",
        "release:first:end",
      ]);
      assert.deepStrictEqual(visible, []);
    }),
  );

  it.effect("preserves every terminal Cause lane without retry", () =>
    Effect.gen(function* () {
      const thrownDefect = new Error("thrown-defect");
      const mixedDefect = new Error("mixed-defect");
      const typedCause = Cause.fail("typed-failure");
      const interruptCause = Cause.interrupt(17);
      const typedAndInterruptCause = Cause.fromReasons([
        Cause.makeInterruptReason(17),
        Cause.makeFailReason("typed-and-interrupted"),
      ]);
      const mixedCause = Cause.fromReasons([
        Cause.makeInterruptReason(17),
        Cause.makeFailReason("mixed-failure"),
        Cause.makeDieReason(mixedDefect),
      ]);
      const emptyCause = Cause.empty;

      type TerminalClassification = "defect" | "typed" | "interruption" | "invariant-defect";
      const cases: ReadonlyArray<{
        readonly effect: Effect.Effect<never, string>;
        readonly expectedCause: Cause.Cause<string>;
        readonly expectedClassification: TerminalClassification;
      }> = [
        {
          effect: Effect.failCause(typedCause),
          expectedCause: typedCause,
          expectedClassification: "typed",
        },
        {
          effect: Effect.sync(() => {
            // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- this fixture proves callback throws remain defects.
            throw thrownDefect;
          }),
          expectedCause: Cause.die(thrownDefect),
          expectedClassification: "defect",
        },
        {
          effect: Effect.failCause(interruptCause),
          expectedCause: interruptCause,
          expectedClassification: "interruption",
        },
        {
          effect: Effect.failCause(typedAndInterruptCause),
          expectedCause: typedAndInterruptCause,
          expectedClassification: "typed",
        },
        {
          effect: Effect.failCause(mixedCause),
          expectedCause: mixedCause,
          expectedClassification: "defect",
        },
        {
          effect: Effect.failCause(emptyCause),
          expectedCause: emptyCause,
          expectedClassification: "invariant-defect",
        },
      ];

      const classify = (cause: Cause.Cause<unknown>) => {
        if (Cause.hasDies(cause)) return "defect";
        if (Cause.hasFails(cause)) return "typed";
        if (Cause.hasInterruptsOnly(cause)) return "interruption";
        return "invariant-defect";
      };

      for (const scenario of cases) {
        let acquisitions = 0;
        const owner = makeRuntimeOwner({
          providers: [
            {
              service: FirstService,
              acquire: Effect.sync(() => {
                acquisitions += 1;
                return "service";
              }),
            },
          ],
          expose: scenario.effect,
        });

        const firstExit = yield* Effect.exit(owner.ready());
        const repeatedExit = yield* Effect.exit(owner.ready());
        assert.strictEqual(repeatedExit, firstExit);
        assert.strictEqual(acquisitions, 1);
        assert.ok(Exit.isFailure(firstExit));
        if (Exit.isFailure(firstExit)) {
          assert.strictEqual(classify(firstExit.cause), scenario.expectedClassification);
          assert.deepStrictEqual(firstExit.cause, scenario.expectedCause);
          assert.strictEqual(firstExit.cause.reasons.length, scenario.expectedCause.reasons.length);

          for (const [index, expectedReason] of scenario.expectedCause.reasons.entries()) {
            const actualReason = firstExit.cause.reasons[index];
            if (actualReason === undefined) {
              assert.fail(`Missing terminal Cause reason at index ${index}`);
            }
            assert.strictEqual(actualReason._tag, expectedReason._tag);
            if (Cause.isFailReason(expectedReason) && Cause.isFailReason(actualReason)) {
              assert.strictEqual(actualReason.error, expectedReason.error);
            }
            if (Cause.isDieReason(expectedReason) && Cause.isDieReason(actualReason)) {
              assert.strictEqual(actualReason.defect, expectedReason.defect);
            }
            if (Cause.isInterruptReason(expectedReason) && Cause.isInterruptReason(actualReason)) {
              assert.strictEqual(actualReason.fiberId, expectedReason.fiberId);
            }
          }
        }
      }

      const primaryAcquisitionFailure = { _tag: "primary-acquisition-failure" } as const;
      const primaryAcquisitionCause = Cause.fail(primaryAcquisitionFailure);
      const typedCleanupFailure = { _tag: "typed-cleanup-failure" } as const;
      const typedCleanupCause = Cause.fail(typedCleanupFailure);
      const cleanupDefect = new Error("cleanup-defect");
      const cleanupDefectCause = Cause.die(cleanupDefect);
      const cleanupInterruptionCause = Cause.interrupt(23);
      const cleanupCases = [
        {
          cleanup: "success",
          expectedCause: primaryAcquisitionCause,
          expectedClassification: "typed",
        },
        {
          cleanup: "defect",
          expectedCause: Cause.combine(primaryAcquisitionCause, cleanupDefectCause),
          expectedClassification: "defect",
        },
        {
          cleanup: "typed",
          expectedCause: Cause.combine(primaryAcquisitionCause, typedCleanupCause),
          expectedClassification: "typed",
        },
        {
          cleanup: "interruption",
          expectedCause: Cause.combine(primaryAcquisitionCause, cleanupInterruptionCause),
          expectedClassification: "typed",
        },
      ] as const;

      for (const cleanupCase of cleanupCases) {
        let acquisitions = 0;
        let cleanupRuns = 0;
        const acquireService = Effect.sync(() => {
          acquisitions += 1;
          return "service";
        });
        const typedCleanupRelease = () => {
          cleanupRuns += 1;
          return Effect.fail(typedCleanupFailure);
        };
        const normalCleanupRelease = () =>
          Effect.gen(function* () {
            cleanupRuns += 1;
            if (cleanupCase.cleanup === "defect") {
              yield* Effect.die(cleanupDefect);
            }
            if (cleanupCase.cleanup === "interruption") {
              yield* Effect.failCause(cleanupInterruptionCause);
            }
          });
        const acquireWithRelease =
          cleanupCase.cleanup === "typed"
            ? Effect.acquireRelease(
                acquireService,
                // @ts-expect-error rc.112 finalizer errors are typed as never, but this fixture proves the runtime Cause is retained.
                typedCleanupRelease,
              )
            : Effect.acquireRelease(acquireService, normalCleanupRelease);
        const owner = makeRuntimeOwner({
          providers: [
            {
              service: FirstService,
              acquire: acquireWithRelease,
            },
            {
              service: SecondService,
              acquire: Effect.failCause(primaryAcquisitionCause),
            },
          ],
          expose: Effect.succeed(undefined),
        });

        const firstExit = yield* Effect.exit(owner.ready());
        const repeatedExit = yield* Effect.exit(owner.ready());
        assert.strictEqual(repeatedExit, firstExit);
        assert.strictEqual(acquisitions, 1);
        assert.strictEqual(cleanupRuns, 1);
        assert.ok(Exit.isFailure(firstExit));
        if (Exit.isFailure(firstExit)) {
          assert.strictEqual(classify(firstExit.cause), cleanupCase.expectedClassification);
          assert.deepStrictEqual(firstExit.cause, cleanupCase.expectedCause);
          assert.strictEqual(
            firstExit.cause.reasons.length,
            cleanupCase.expectedCause.reasons.length,
          );

          for (const [index, expectedReason] of cleanupCase.expectedCause.reasons.entries()) {
            const actualReason = firstExit.cause.reasons[index];
            if (actualReason === undefined) {
              assert.fail(`Missing cleanup Cause reason at index ${index}`);
            }
            assert.strictEqual(actualReason._tag, expectedReason._tag);
            if (Cause.isFailReason(expectedReason) && Cause.isFailReason(actualReason)) {
              assert.strictEqual(actualReason.error, expectedReason.error);
            }
            if (Cause.isDieReason(expectedReason) && Cause.isDieReason(actualReason)) {
              assert.strictEqual(actualReason.defect, expectedReason.defect);
            }
          }
        }
      }
    }),
  );

  it.effect("constructs an inert owner shell with exact input identities", () =>
    Effect.gen(function* () {
      let acquisitions = 0;
      const owner = makeRuntimeOwner({
        providers: [{ kind: "succeed", service: FirstService, value: "inert" }],
        expose: Effect.sync(() => {
          acquisitions += 1;
          return "exposed";
        }),
      });
      assert.strictEqual(acquisitions, 0);
      assert.ok(owner.ready);
      assert.ok(owner.close);
      yield* owner.close();
      assert.strictEqual(acquisitions, 0);
    }),
  );

  it.effect("starts one readiness leader for one owner", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const gate = yield* Deferred.make<void>();
      let acquisitions = 0;
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.gen(function* () {
              acquisitions += 1;
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(gate);
              return "ready";
            }),
          },
        ],
        expose: Effect.service(FirstService),
      });
      const ready = yield* Effect.forkChild(owner.ready());
      yield* Deferred.await(entered);
      assert.strictEqual(acquisitions, 1);
      yield* Deferred.succeed(gate, undefined);
      assert.strictEqual(yield* Fiber.join(ready), "ready");
      yield* owner.close();
    }),
  );

  it.effect("joins concurrent readiness callers on one terminal", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const gate = yield* Deferred.make<void>();
      let acquisitions = 0;
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.gen(function* () {
              acquisitions += 1;
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(gate);
              return "shared";
            }),
          },
        ],
        expose: Effect.service(FirstService),
      });
      const first = yield* Effect.forkChild(owner.ready());
      yield* Deferred.await(entered);
      const second = yield* Effect.forkChild(owner.ready());
      yield* Deferred.succeed(gate, undefined);
      assert.strictEqual(yield* Fiber.join(first), "shared");
      assert.strictEqual(yield* Fiber.join(second), "shared");
      assert.strictEqual(acquisitions, 1);
      yield* owner.close();
    }),
  );

  it.effect("caches successful readiness and preserves the assembled context", () =>
    Effect.gen(function* () {
      const service = "stable";
      let acquisitions = 0;
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.sync(() => {
              acquisitions += 1;
              return service;
            }),
          },
        ],
        expose: Effect.service(FirstService),
      });
      const first = yield* owner.ready();
      const second = yield* owner.ready();
      assert.strictEqual(first, service);
      assert.strictEqual(second, service);
      assert.strictEqual(acquisitions, 1);
      yield* owner.close();
    }),
  );

  it.effect("caches typed readiness failure without retry", () =>
    Effect.gen(function* () {
      let attempts = 0;
      const failure = "typed-ready-failure" as const;
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.sync(() => {
              attempts += 1;
              return Effect.fail(failure);
            }).pipe(Effect.flatten),
          },
        ],
        expose: Effect.service(FirstService),
      });
      const first = yield* Effect.exit(owner.ready());
      const second = yield* Effect.exit(owner.ready());
      assert.deepStrictEqual(second, first);
      assert.strictEqual(attempts, 1);
      assert.ok(Exit.isFailure(first));
      yield* owner.close();
    }),
  );

  it.effect("retains a readiness defect and cleans the acquired prefix once", () =>
    Effect.gen(function* () {
      const cleaned: string[] = [];
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.acquireRelease(Effect.succeed("first"), () =>
              Effect.sync(() => cleaned.push("first")),
            ),
          },
          { service: SecondService, acquire: Effect.die("defect") },
        ],
        expose: Effect.succeed(undefined),
      });
      // SAFETY: The empty context deliberately violates the service requirement to prove defect classification.
      const result = yield* Effect.exit(
        Effect.provideContext(owner.ready(), Context.empty() as Context.Context<FirstService>),
      );
      assert.ok(Exit.isFailure(result));
      if (Exit.isFailure(result)) assert.strictEqual(Cause.hasDies(result.cause), true);
      assert.deepStrictEqual(cleaned, ["first"]);
      yield* owner.close();
    }),
  );

  it.effect("caches interrupted readiness and interrupts owned work", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const gate = yield* Deferred.make<void>();
      let cleaned = 0;
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.acquireRelease(
              Effect.gen(function* () {
                yield* Deferred.succeed(entered, undefined);
                return "acquired";
              }),
              () =>
                Effect.sync(() => {
                  cleaned += 1;
                }),
              { interruptible: true },
            ),
          },
        ],
        expose: Effect.gen(function* () {
          yield* Deferred.await(gate);
          return yield* Effect.service(FirstService);
        }),
      });
      const fiber = yield* Effect.forkChild(owner.ready(), { startImmediately: true });
      yield* Deferred.await(entered);
      yield* Fiber.interrupt(fiber);
      const result = yield* Fiber.await(fiber);
      assert.ok(Exit.isFailure(result));
      assert.strictEqual(cleaned, 1);
      const closed = yield* Effect.exit(owner.close());
      assert.ok(Exit.isFailure(closed));
    }),
  );

  it.effect("disposes a failed owner without reopening admission", () =>
    Effect.gen(function* () {
      let attempts = 0;
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.sync(() => {
              attempts += 1;
              return Effect.fail("failed" as const);
            }).pipe(Effect.flatten),
          },
        ],
        expose: Effect.service(FirstService),
      });
      const failed = yield* Effect.exit(owner.ready());
      const closed = yield* Effect.exit(owner.close());
      const repeated = yield* Effect.exit(owner.close());
      const readyAgain = yield* Effect.exit(owner.ready());
      assert.ok(Exit.isFailure(failed));
      assert.ok(Exit.isSuccess(closed));
      assert.deepStrictEqual(repeated, closed);
      assert.deepStrictEqual(readyAgain, failed);
      assert.strictEqual(attempts, 1);
    }),
  );

  it.effect("blocks owner disposal while dependent leases remain", () =>
    Effect.gen(function* () {
      const blocked = Failure({
        code: "BlockedByDependents",
        path: ["owner"],
        details: {},
        summary: "dependent lease",
        help: "release dependent",
      });
      const owner = makeRuntimeOwner({
        providers: [],
        expose: Effect.succeed(undefined),
        close: Effect.fail(blocked),
      });
      yield* owner.ready();
      const result = yield* Effect.exit(owner.close());
      assert.ok(Exit.isFailure(result));
      if (Exit.isFailure(result)) assert.strictEqual(Cause.hasFails(result.cause), true);
    }),
  );

  it.effect("drains evidence before closing an owner", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const owner = makeRuntimeOwner({
        providers: [],
        expose: Effect.succeed(undefined),
        close: Effect.sync(() => order.push("evidence-close")),
      });
      yield* owner.ready();
      yield* owner.close();
      assert.deepStrictEqual(order, ["evidence-close"]);
    }),
  );

  it.effect("interrupts owner-scoped fibers through running handles", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.acquireRelease(
              Effect.gen(function* () {
                yield* Deferred.succeed(entered, undefined);
                yield* Effect.never;
                return "running";
              }),
              () => Effect.sync(() => undefined),
              { interruptible: true },
            ),
          },
        ],
        expose: Effect.service(FirstService),
      });
      const ready = yield* Effect.forkChild(owner.ready(), { startImmediately: true });
      yield* Deferred.await(entered);
      const closed = yield* Effect.exit(owner.close());
      assert.ok(Exit.isFailure(closed));
      if (Exit.isFailure(closed)) assert.strictEqual(Cause.hasInterruptsOnly(closed.cause), true);
      assert.ok(Exit.isFailure(yield* Fiber.await(ready)));
    }),
  );

  it.effect("isolates replacement capabilities across owner instances", () =>
    Effect.gen(function* () {
      const firstValue = "first";
      const secondValue = "second";
      const first = makeRuntimeOwner({
        providers: [{ kind: "succeed", service: FirstService, value: firstValue }],
        expose: Effect.service(FirstService),
      });
      const second = makeRuntimeOwner({
        providers: [{ kind: "succeed", service: FirstService, value: secondValue }],
        expose: Effect.service(FirstService),
      });
      assert.strictEqual(yield* first.ready(), firstValue);
      assert.strictEqual(yield* second.ready(), secondValue);
      assert.notStrictEqual(yield* first.ready(), yield* second.ready());
      yield* first.close();
      yield* second.close();
    }),
  );

  it.effect("acquires implementation providers in dependency order", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const owner = makeRuntimeOwner({
        providers: [
          {
            service: FirstService,
            acquire: Effect.sync(() => {
              order.push("first");
              return "first";
            }),
          },
          {
            service: SecondService,
            acquire: Effect.gen(function* () {
              order.push(yield* Effect.service(FirstService));
              return 2;
            }),
          },
        ],
        expose: Effect.all([Effect.service(FirstService), Effect.service(SecondService)], {
          concurrency: 1,
        }),
      });
      assert.deepStrictEqual(yield* owner.ready(), ["first", 2]);
      assert.deepStrictEqual(order, ["first", "first"]);
      yield* owner.close();
    }),
  );

  it.effect("rejects missing implementation requirements before admission", () =>
    Effect.gen(function* () {
      const owner = makeRuntimeOwner({ providers: [], expose: Effect.service(FirstService) });
      // SAFETY: The empty context deliberately violates the service requirement to prove defect classification.
      const result = yield* Effect.exit(
        Effect.provideContext(owner.ready(), Context.empty() as Context.Context<FirstService>),
      );
      assert.ok(Exit.isFailure(result));
      if (Exit.isFailure(result)) assert.strictEqual(Cause.hasDies(result.cause), true);
      yield* owner.close();
    }),
  );

  it.effect("settles prepared handles when the owner is disposed", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: HandleApp }).construct();
      assert.throws(() => runtimeOwner(runtime).assembly(), /Runtime is not ready/u);
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const ref = actorRef(HandleMachine, "disposed-handle");
      const actor = yield* assembly.createActor({ ref, initial: initialHandleSnapshot() });
      yield* Effect.provideContext(actor.dispose(), assembly.context);
      assert.strictEqual(actor.engine.snapshot().lifecycle, "disposed");
      assert.throws(() => actor.handle.send(HandleEvent), /Actor mailbox admission is closed/u);

      const recreated = yield* Effect.exit(
        assembly.createActor({ ref, initial: initialHandleSnapshot() }),
      );
      assert.ok(Exit.isFailure(recreated));
      if (Exit.isFailure(recreated)) {
        const reason = recreated.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        if (reason !== undefined) assert.strictEqual(reason.error.code, "DisposedActorRef");
      }
      assert.ok(Exit.isSuccess(yield* Effect.exit(runtimeOwner(runtime).close())));
    }),
  );

  it.effect("keeps request and Story setup on the same owner contract", () =>
    Effect.gen(function* () {
      const request = makeRuntimeOwner({
        providers: [{ kind: "succeed", service: FirstService, value: "request" }],
        expose: Effect.service(FirstService),
      });
      const story = makeRuntimeOwner({
        providers: [{ kind: "succeed", service: FirstService, value: "story" }],
        expose: Effect.service(FirstService),
      });
      assert.strictEqual(yield* request.ready(), "request");
      assert.strictEqual(yield* story.ready(), "story");
      yield* request.close();
      yield* story.close();
    }),
  );
});
