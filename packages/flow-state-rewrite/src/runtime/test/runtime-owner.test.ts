import { assert, describe, it } from "@effect/vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, type Types } from "effect";

import { makeRuntimeOwner } from "../runtime-owner.js";

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
      yield* interruptionOwner.close();
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
});
