import { assert, describe, it } from "@effect/vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Scope } from "effect";

import { app } from "../../app/app.js";
import { Implementation } from "../../implementation/implementation.js";
import { runtimeSetup } from "../runtime.js";
import { makeFlowRuntimeShell } from "../runtime-shell.js";

class First extends Context.Service<First, string>()("runtime-next/test/First") {}

class Second extends Context.Service<Second, string>()("runtime-next/test/Second") {}

const TestApp = app({ id: "runtime-next/readiness", persistenceVersion: "1", modules: [] });

describe("runtime-next readiness", () => {
  // ARCH-007A; SEM-027; RN-READY-001.
  it.effect("RN-READY-001 construction stays inert until readiness", () =>
    Effect.gen(function* () {
      let acquisitions = 0;

      const setup = runtimeSetup({
        app: TestApp,
        implementation: Implementation.effect(
          First,
          Effect.sync(() => {
            acquisitions += 1;

            return "first";
          }),
        ),
      });

      const runtime = setup.construct();
      assert.strictEqual(acquisitions, 0);
      yield* runtime.ready();
      assert.strictEqual(acquisitions, 1);
      yield* runtime.dispose();
    }),
  );

  // ARCH-007A; SEM-027; RN-READY-002.
  it.effect("RN-READY-002 concurrent readiness shares one successful acquisition", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const gate = yield* Deferred.make<void>();
      let attempts = 0;

      const shell = makeFlowRuntimeShell({
        bootstrap: () =>
          Effect.gen(function* () {
            attempts += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(gate);

            return "ready";
          }),
      });

      const leader = yield* shell.ready.pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const waiter = yield* shell.ready.pipe(Effect.forkChild);
      yield* Deferred.succeed(gate, undefined);
      assert.strictEqual(yield* Fiber.join(leader), "ready");
      assert.strictEqual(yield* Fiber.join(waiter), "ready");
      assert.strictEqual(yield* shell.ready, "ready");
      assert.strictEqual(attempts, 1);
      yield* shell.close();
    }),
  );

  // ARCH-007A; STD-05; RN-READY-003.
  it.effect("RN-READY-003 readiness failures retain their terminal Cause", () =>
    Effect.gen(function* () {
      for (const failure of [Effect.fail("typed"), Effect.die(new Error("defect"))]) {
        let attempts = 0;
        let releases = 0;

        const shell = makeFlowRuntimeShell({
          bootstrap: (scope) =>
            Effect.gen(function* () {
              attempts += 1;
              yield* Scope.addFinalizer(
                scope,
                Effect.gen(function* () {
                  releases += 1;

                  return yield* Effect.die(new Error("rollback-defect"));
                }),
              );

              return yield* failure;
            }),
        });

        const first = yield* Effect.exit(shell.ready);
        assert.ok(Exit.isFailure(first));
        assert.strictEqual(first.cause.reasons.length, 2);
        assert.deepStrictEqual(yield* Effect.exit(shell.ready), first);
        assert.strictEqual(attempts, 1);
        assert.strictEqual(releases, 1);
        assert.ok(!(yield* shell.registerActor({ dispose: () => Effect.void })).accepted);
        assert.ok(!(yield* shell.registerProvider(Effect.void)));
        yield* Effect.exit(shell.close());
      }
    }),
  );

  // ARCH-007A; STD-08; RN-READY-004.
  it.effect("RN-READY-004 interrupted readiness leader settles one terminal result", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      let attempts = 0;

      const shell = makeFlowRuntimeShell({
        bootstrap: () =>
          Effect.gen(function* () {
            attempts += 1;
            yield* Deferred.succeed(entered, undefined);

            return yield* Effect.never;
          }),
      });

      const leader = yield* shell.ready.pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      yield* Fiber.interrupt(leader);
      const retained = yield* Effect.exit(shell.ready);
      assert.ok(Exit.isFailure(retained));
      assert.ok(Cause.hasInterrupts(retained.cause));
      assert.strictEqual(attempts, 1);
      yield* Effect.exit(shell.close());
    }),
  );

  // ARCH-007A; STD-08; RN-READY-005.
  it.effect("RN-READY-005 interrupting a readiness waiter does not cancel its leader", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const gate = yield* Deferred.make<void>();
      let attempts = 0;

      const shell = makeFlowRuntimeShell({
        bootstrap: () =>
          Effect.gen(function* () {
            attempts += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(gate);

            return "ready";
          }),
      });

      const leader = yield* shell.ready.pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const waiter = yield* shell.ready.pipe(Effect.forkChild);
      yield* Fiber.interrupt(waiter);
      assert.ok(Exit.isFailure(yield* Fiber.await(waiter)));
      yield* Deferred.succeed(gate, undefined);
      assert.strictEqual(yield* Fiber.join(leader), "ready");
      assert.strictEqual(yield* shell.ready, "ready");
      assert.strictEqual(attempts, 1);
      yield* shell.close();
    }),
  );

  // ARCH-007A; approved correction 5; RN-READY-006.
  it.effect("RN-READY-006 cold close settles readiness without bootstrap", () =>
    Effect.gen(function* () {
      let attempts = 0;

      const shell = makeFlowRuntimeShell({
        bootstrap: () =>
          Effect.sync(() => {
            attempts += 1;
          }),
      });

      yield* shell.close();
      yield* shell.close();
      const ready = yield* Effect.exit(shell.ready);
      assert.ok(Exit.isFailure(ready));
      assert.strictEqual(
        ready.cause.reasons.find(Cause.isFailReason)?.error.code,
        "RuntimeDisposed",
      );
      assert.strictEqual(attempts, 0);
    }),
  );

  // ARCH-007A; STD-06/08; RN-READY-007.
  it.effect("RN-READY-007 close racing bootstrap releases the acquired prefix", () =>
    Effect.gen(function* () {
      const acquired = yield* Deferred.make<void>();
      let releases = 0;

      const shell = makeFlowRuntimeShell({
        bootstrap: (scope) =>
          Effect.gen(function* () {
            yield* Scope.addFinalizer(
              scope,
              Effect.sync(() => {
                releases += 1;
              }),
            );
            yield* Deferred.succeed(acquired, undefined);

            return yield* Effect.never;
          }),
      });

      const readiness = yield* shell.ready.pipe(Effect.forkChild);
      yield* Deferred.await(acquired);
      yield* shell.close();
      assert.ok(Exit.isFailure(yield* Fiber.await(readiness)));
      const later = yield* Effect.exit(shell.ready);
      assert.ok(Exit.isFailure(later));
      assert.strictEqual(
        later.cause.reasons.find(Cause.isFailReason)?.error.code,
        "RuntimeDisposed",
      );
      assert.strictEqual(releases, 1);
    }),
  );

  // ARCH-007A; SEM-027; RN-READY-008.
  it.effect(
    "RN-READY-008 providers acquire in declaration order and publish a complete context",
    () =>
      Effect.gen(function* () {
        const order: string[] = [];

        const first = Layer.effect(
          First,
          Effect.sync(() => {
            order.push("first");

            return "one";
          }),
        );

        const second = Layer.effect(
          Second,
          Effect.gen(function* () {
            const predecessor = yield* Effect.service(First);
            order.push("second");

            return `${predecessor}-two`;
          }),
        );

        const shell = makeFlowRuntimeShell({
          bootstrap: (scope) => Layer.buildWithScope(second.pipe(Layer.provideMerge(first)), scope),
        });

        assert.deepStrictEqual(order, []);
        const context = yield* shell.ready;
        assert.deepStrictEqual(order, ["first", "second"]);
        assert.strictEqual(Context.get(context, First), "one");
        assert.strictEqual(Context.get(context, Second), "one-two");
        yield* shell.close();
      }),
  );

  // ARCH-007A; STD-05/08; RN-READY-009.
  it.effect("RN-READY-009 shutdown retains ordered cleanup and combined Causes", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      let interrupted = 0;

      const shell = makeFlowRuntimeShell<void, never, string>({
        bootstrap: (scope) =>
          Effect.gen(function* () {
            yield* Scope.addFinalizer(
              scope,
              Effect.sync(() => {
                order.push("scope");
              }),
            );
            yield* Effect.never.pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  interrupted += 1;
                }),
              ),
              Effect.forkIn(scope, { startImmediately: true }),
            );
          }),
        quiesce: Effect.sync(() => {
          order.push("quiesce");
        }),
        drain: Effect.sync(() => {
          order.push("drain");
        }),
        ownerClose: Effect.sync(() => {
          order.push("owner");
        }),
      });

      yield* shell.registerActor({
        dispose: () =>
          Effect.sync(() => {
            order.push("actor-one");
          }),
      });
      yield* shell.registerActor({
        dispose: () =>
          Effect.gen(function* () {
            order.push("actor-two");

            return yield* Effect.fail("actor-failure");
          }),
      });
      yield* shell.registerProvider(
        Effect.sync(() => {
          order.push("provider-one");
        }),
      );
      yield* shell.registerProvider(
        Effect.gen(function* () {
          order.push("provider-two");

          return yield* Effect.fail("provider-failure");
        }),
      );
      yield* shell.ready;
      const close = yield* Effect.exit(shell.close());
      assert.ok(Exit.isFailure(close));
      assert.deepStrictEqual(order, [
        "quiesce",
        "actor-two",
        "actor-one",
        "drain",
        "provider-two",
        "provider-one",
        "owner",
        "scope",
      ]);
      assert.strictEqual(interrupted, 1);
      assert.deepStrictEqual(
        close.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error),
        ["actor-failure", "provider-failure"],
      );
      assert.deepStrictEqual(yield* Effect.exit(shell.close()), close);
    }),
  );

  // STD-08; RN-READY-010.
  it.effect("RN-READY-010 shell close joins accepted cleanup participants", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const gate = yield* Deferred.make<void>();
      let calls = 0;
      const shell = makeFlowRuntimeShell({ bootstrap: () => Effect.void });
      yield* shell.registerActor({
        dispose: () =>
          Effect.gen(function* () {
            calls += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(gate);
          }),
      });
      const leader = yield* shell.close().pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const waiter = yield* shell.close().pipe(Effect.forkChild);
      yield* Fiber.interrupt(waiter);
      yield* Deferred.succeed(gate, undefined);
      yield* Fiber.join(leader);
      yield* shell.close();
      assert.strictEqual(calls, 1);
    }),
  );

  // STD-01; RN-READY-011.
  it.effect("RN-READY-011 constructed runtimes own isolated lifetimes", () =>
    Effect.gen(function* () {
      let acquisitions = 0;
      let releases = 0;

      const setup = runtimeSetup({
        app: TestApp,
        implementation: Implementation.effect(
          First,
          Effect.acquireRelease(
            Effect.sync(() => {
              acquisitions += 1;

              return `provider-${acquisitions}`;
            }),
            () =>
              Effect.sync(() => {
                releases += 1;
              }),
          ),
        ),
      });

      const first = setup.construct();
      const second = setup.construct();
      assert.strictEqual(first.app, second.app);
      yield* first.ready();
      yield* second.ready();
      assert.strictEqual(acquisitions, 2);
      yield* first.dispose();
      assert.strictEqual(releases, 1);
      yield* second.ready();
      assert.strictEqual(acquisitions, 2);
      yield* second.dispose();
      assert.strictEqual(releases, 2);
    }),
  );

  // STD-06/08; RN-READY-012.
  it.effect("RN-READY-012 late registrations are drained by runtime close", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const providerEntered = yield* Deferred.make<void>();
      const providerGate = yield* Deferred.make<void>();
      const shell = makeFlowRuntimeShell({ bootstrap: () => Effect.void });
      yield* shell.registerActor({
        dispose: () =>
          Effect.gen(function* () {
            order.push("first");

            const late = yield* shell.registerActor({
              dispose: () =>
                Effect.sync(() => {
                  order.push("late");
                }),
            });

            assert.ok(late.accepted);
          }),
      });
      yield* shell.registerProvider(
        Effect.gen(function* () {
          yield* Deferred.succeed(providerEntered, undefined);
          yield* Deferred.await(providerGate);
        }),
      );
      const closing = yield* shell.close().pipe(Effect.forkChild);
      yield* Deferred.await(providerEntered);
      assert.ok(!(yield* shell.registerActor({ dispose: () => Effect.void })).accepted);
      yield* Deferred.succeed(providerGate, undefined);
      yield* Fiber.join(closing);
      assert.deepStrictEqual(order, ["first", "late"]);
      assert.ok(!(yield* shell.registerActor({ dispose: () => Effect.void })).accepted);
      assert.ok(!(yield* shell.registerProvider(Effect.void)));
      yield* shell.close();
    }),
  );
});
