import { assert, describe, it } from "@effect/vitest";
import { Cause, Clock, Context, Deferred, Effect, Exit, Fiber, Layer, Scope } from "effect";

import { app } from "../../app/app.js";
import { makeRuntimeAssembly } from "../runtime-assembly.js";
import { RuntimeEvidence, makeRuntimeServicesLayer } from "../runtime-services.js";
import { makeFlowRuntimeShell } from "../runtime-shell.js";

class Provider extends Context.Service<Provider, string>()("runtime-next/test/AssemblyProvider") {}

describe("runtime-next shell owner", () => {
  it.effect("provides one clock and evidence capability in the runtime service layer", () =>
    Effect.gen(function* () {
      const clock = yield* Effect.service(Clock.Clock);
      const evidence = { drain: Effect.void };
      const scope = yield* Scope.make();

      const context = yield* Layer.buildWithScope(
        makeRuntimeServicesLayer({ clock, evidence }),
        scope,
      );

      assert.strictEqual(Context.get(context, Clock.Clock), clock);
      assert.strictEqual(Context.get(context, RuntimeEvidence), evidence);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("retains the assembled provider context behind public void readiness", () =>
    Effect.gen(function* () {
      let acquisitions = 0;

      const application = app({
        id: "runtime-next/assembled-context",
        persistenceVersion: "1",
        modules: [],
      });

      const assembly = makeRuntimeAssembly({
        app: application,
        layer: Layer.effect(
          Provider,
          Effect.sync(() => {
            acquisitions += 1;

            return "acquired-provider";
          }),
        ),
      });

      assert.strictEqual(yield* assembly.runtime.ready(), undefined);
      const first = yield* assembly.readyContext;
      const second = yield* assembly.readyContext;
      assert.strictEqual(first, second);
      assert.strictEqual(
        yield* Effect.provideContext(first)(Effect.service(Provider)),
        "acquired-provider",
      );
      assert.strictEqual(acquisitions, 1);
      yield* assembly.runtime.dispose();
    }),
  );

  it.effect("drains a long chain of late registrations without recursive close", () =>
    Effect.gen(function* () {
      const length = 2_000;
      let disposed = 0;
      const shell = makeFlowRuntimeShell({ bootstrap: () => Effect.void });

      const participant = {
        dispose: () =>
          Effect.gen(function* () {
            disposed += 1;

            if (disposed < length) {
              const registered = yield* shell.registerActor(participant);
              assert.ok(registered.accepted);
            }
          }),
      };

      yield* shell.registerActor(participant);
      yield* shell.close();
      assert.strictEqual(disposed, length);
    }),
  );

  it.effect("retains bootstrap rollback failure when close wins readiness", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const rollbackStarted = yield* Deferred.make<void>();
      const rollbackGate = yield* Deferred.make<void>();
      const rollbackDefect = new Error("bootstrap-rollback");

      const shell = makeFlowRuntimeShell({
        bootstrap: (scope) =>
          Effect.gen(function* () {
            yield* Scope.addFinalizer(
              scope,
              Effect.gen(function* () {
                yield* Deferred.succeed(rollbackStarted, undefined);
                yield* Deferred.await(rollbackGate);

                // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- This proof injects a finalizer defect and checks its retained Cause.Die reason.
                return yield* Effect.die(rollbackDefect);
              }),
            );
            yield* Deferred.succeed(started, undefined);

            return yield* Effect.never;
          }),
      });

      const readiness = yield* shell.ready.pipe(Effect.forkChild);
      yield* Deferred.await(started);
      const closing = yield* shell.close().pipe(Effect.forkChild);
      yield* Deferred.await(rollbackStarted);
      const disposed = yield* Effect.exit(shell.ready);
      assert.ok(Exit.isFailure(disposed));
      assert.strictEqual(
        disposed.cause.reasons.find(Cause.isFailReason)?.error.code,
        "RuntimeDisposed",
      );
      yield* Deferred.succeed(rollbackGate, undefined);

      const firstClose = yield* Fiber.await(closing);
      assert.ok(Exit.isFailure(firstClose));
      assert.strictEqual(firstClose.cause.reasons.find(Cause.isDieReason)?.defect, rollbackDefect);
      assert.deepStrictEqual(yield* Effect.exit(shell.close()), firstClose);
      assert.ok(Exit.isFailure(yield* Fiber.await(readiness)));
    }),
  );

  it.effect("bounds a participant that keeps registering during close", () =>
    Effect.gen(function* () {
      let disposed = 0;
      let rejected = 0;
      const shell = makeFlowRuntimeShell({ bootstrap: () => Effect.void });

      const participant = {
        dispose: () =>
          Effect.gen(function* () {
            disposed += 1;
            const registration = yield* shell.registerActor(participant);

            if (!registration.accepted) rejected += 1;
          }),
      };

      yield* shell.registerActor(participant);
      yield* shell.close();
      assert.strictEqual(disposed, 2_049);
      assert.strictEqual(rejected, 1);
      yield* shell.close();
    }),
  );
});
