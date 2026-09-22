import { assert, describe, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Scope } from "effect";

import { Failure } from "../../diagnostic/diagnostic.js";
import { makeActorLease } from "../actor/actor-lease.js";

const blocked = () =>
  Failure({
    code: "BlockedByDependents",
    path: [],
    details: {},
    summary: "Actor has active dependents",
    help: "Dispose dependent actors first.",
  });

describe("runtime-next ActorLease owner", () => {
  it.effect("constructs inertly and leaves a rejected preflight unclaimed", () =>
    Effect.gen(function* () {
      const ownerScope = yield* Scope.make();
      const actor = { name: "actor" };
      let allowed = false;
      let preflights = 0;
      let cleanups = 0;
      let retirements = 0;

      const lease = makeActorLease({
        actor,
        ownerScope,
        preflight: () =>
          Effect.sync(() => {
            preflights += 1;

            return allowed;
          }).pipe(Effect.flatMap((admitted) => (admitted ? Effect.void : Effect.fail(blocked())))),
        cleanup: () => Effect.sync(() => void (cleanups += 1)),
        retire: () => Effect.sync(() => void (retirements += 1)),
      });

      assert.strictEqual(lease.actor, actor);
      const pending = lease.dispose();
      assert.strictEqual(preflights, 0);
      assert.strictEqual(cleanups, 0);
      const rejected = yield* Effect.exit(pending);
      assert.ok(Exit.isFailure(rejected));
      assert.strictEqual(
        rejected.cause.reasons.find(Cause.isFailReason)?.error.code,
        "BlockedByDependents",
      );
      assert.strictEqual(preflights, 1);
      assert.strictEqual(cleanups, 0);

      allowed = true;
      yield* lease.dispose();
      assert.strictEqual(preflights, 2);
      assert.strictEqual(cleanups, 1);
      assert.strictEqual(retirements, 1);

      allowed = false;
      yield* lease.dispose();
      assert.strictEqual(preflights, 2);
      assert.strictEqual(cleanups, 1);
      assert.strictEqual(retirements, 1);
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  it.effect("joins one owner-scoped cleanup after the first waiter is interrupted", () =>
    Effect.gen(function* () {
      const ownerScope = yield* Scope.make();
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let preflights = 0;
      let cleanups = 0;
      let retirements = 0;

      const lease = makeActorLease({
        actor: "actor",
        ownerScope,
        preflight: () => Effect.sync(() => void (preflights += 1)),
        cleanup: () =>
          Effect.gen(function* () {
            cleanups += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
          }),
        retire: () => Effect.sync(() => void (retirements += 1)),
      });

      const first = yield* lease.dispose().pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const second = yield* lease.dispose().pipe(Effect.forkChild);
      yield* Fiber.interrupt(first);
      const interrupted = yield* Fiber.await(first);
      assert.ok(Exit.isFailure(interrupted));
      assert.ok(interrupted.cause.reasons.some(Cause.isInterruptReason));
      assert.strictEqual(cleanups, 1);
      assert.strictEqual(retirements, 0);

      yield* Deferred.succeed(release, undefined);
      assert.ok(Exit.isSuccess(yield* Fiber.await(second)));
      yield* lease.dispose();
      assert.strictEqual(preflights, 1);
      assert.strictEqual(cleanups, 1);
      assert.strictEqual(retirements, 1);
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  it.effect("caches a failed cleanup Cause and never retires it", () =>
    Effect.gen(function* () {
      const ownerScope = yield* Scope.make();

      const failure = Failure({
        code: "CleanupFailed",
        path: [],
        details: {},
        summary: "Cleanup failed",
        help: "Inspect the cleanup cause.",
      });

      const defect = new Error("cleanup finalizer defect");
      let cleanups = 0;
      let retirements = 0;

      const lease = makeActorLease({
        actor: "actor",
        ownerScope,
        preflight: () => Effect.void,
        cleanup: () =>
          Effect.sync(() => void (cleanups += 1)).pipe(
            Effect.andThen(Effect.fail(failure)),
            // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- This proof injects a finalizer defect and checks that the full cleanup Cause survives caching.
            Effect.ensuring(Effect.die(defect)),
          ),
        retire: () => Effect.sync(() => void (retirements += 1)),
      });

      const first = yield* Effect.exit(lease.dispose());
      assert.ok(Exit.isFailure(first));
      assert.strictEqual(first.cause.reasons.find(Cause.isFailReason)?.error, failure);
      assert.strictEqual(first.cause.reasons.find(Cause.isDieReason)?.defect, defect);
      assert.deepStrictEqual(yield* Effect.exit(lease.dispose()), first);
      assert.strictEqual(cleanups, 1);
      assert.strictEqual(retirements, 0);
      yield* Scope.close(ownerScope, Exit.void);
    }),
  );

  it.effect("settles an interrupted owner-scoped cleanup for later callers", () =>
    Effect.gen(function* () {
      const ownerScope = yield* Scope.make();
      const entered = yield* Deferred.make<void>();
      let cleanups = 0;
      let retirements = 0;

      const lease = makeActorLease({
        actor: "actor",
        ownerScope,
        preflight: () => Effect.void,
        cleanup: () =>
          Effect.gen(function* () {
            cleanups += 1;
            yield* Deferred.succeed(entered, undefined);

            return yield* Effect.never;
          }),
        retire: () => Effect.sync(() => void (retirements += 1)),
      });

      const first = yield* lease.dispose().pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      yield* Scope.close(ownerScope, Exit.void);
      const firstExit = yield* Fiber.await(first);
      assert.ok(Exit.isFailure(firstExit));
      assert.ok(firstExit.cause.reasons.some(Cause.isInterruptReason));
      assert.deepStrictEqual(yield* Effect.exit(lease.dispose()), firstExit);
      assert.strictEqual(cleanups, 1);
      assert.strictEqual(retirements, 0);
    }),
  );
});
