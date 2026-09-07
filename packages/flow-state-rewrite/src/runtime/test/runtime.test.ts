import { assert, describe, it } from "@effect/vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Result } from "effect";

import { app, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import { Implementation, implementationEntries } from "../../implementation/implementation.js";
import { machine } from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import { runtimeSetup } from "../runtime.js";

/*
 * Proof organization:
 *
 * Fixtures and local builders
 * Type relationships and negative authoring cases
 * Behavior suites grouped by observable law
 *
 * Mutable setup remains local to its scenario.
 */

type Repository = {
  readonly load: () => string;
};

class RepositoryKey extends Context.Service<RepositoryKey, Repository>()(
  "RuntimeTest/Repository",
) {}

class ConfigKey extends Context.Service<ConfigKey, { readonly region: string }>()(
  "RuntimeTest/Config",
) {}

const repository: Repository = {
  load: () => "loaded",
};

const EmptyApp = app({
  id: "runtime-test/empty",
  persistenceVersion: "1",
  modules: [],
});

const requiredResource = resource({
  id: "runtime-test/repository",
  key: (id: string) => [id] as const,
  // RETURN_TYPE: Preserves the fixture's typed failure and RepositoryKey service channels; removal makes its negative proof unused (TS2578).
  lookup: (id: string): Effect.Effect<string, "missing", RepositoryKey> => Effect.succeed(id),
});

const RequiredDefinitionResult = definition({
  id: "runtime-test/required",
  states: ["ready"],
  events: { refresh: "bare" },
  operations: { repository: requiredResource },
});

const requiredMachine = Result.getOrThrow(
  machine(RequiredDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const RequiredApp = app({
  id: "runtime-test/required-app",
  persistenceVersion: "1",
  modules: [module({ id: "runtime-test/module", machines: { required: requiredMachine } })],
});

const completeImplementation = Implementation.succeed(RepositoryKey, repository);

export type _RuntimeSetupApp = ReturnType<typeof runtimeSetup<typeof EmptyApp>>["app"];

// @ts-expect-error RequiredApp still needs RepositoryKey.
runtimeSetup({ app: RequiredApp });

const incompleteImplementation = Implementation.effect(
  RepositoryKey,
  Effect.service(ConfigKey).pipe(Effect.map(() => repository)),
);

// @ts-expect-error This provider graph retains an unsatisfied ConfigKey requirement.
runtimeSetup({ app: RequiredApp, implementation: incompleteImplementation });

const requiredSetup = runtimeSetup({ app: RequiredApp, implementation: completeImplementation });
assert.strictEqual(requiredSetup.app, RequiredApp);

describe("internal implementation runtime", () => {
  describe("readiness acquisition and caching", () => {
    it.effect("reads a plain provider getter only during readiness", () =>
      Effect.gen(function* () {
        const implementation = Implementation.succeed(RepositoryKey, repository);
        const entry = implementationEntries(implementation)[0];
        if (entry === undefined || entry.kind !== "succeed") {
          return yield* Effect.die(new Error("Expected a synchronous implementation entry"));
        }

        let reads = 0;
        Object.defineProperty(entry, "value", {
          configurable: true,
          enumerable: true,
          get: () => {
            reads += 1;
            return repository;
          },
        });

        const setup = runtimeSetup({ app: EmptyApp, implementation });
        assert.strictEqual(reads, 0);
        const runtime = setup.construct();
        assert.strictEqual(reads, 0);
        yield* runtime.ready();
        assert.strictEqual(reads, 1);
      }),
    );

    it.effect("acquires providers lazily in declaration order", () =>
      Effect.gen(function* () {
        const order: Array<string> = [];
        const implementation = Implementation.merge(
          Implementation.effect(
            RepositoryKey,
            Effect.sync(() => {
              order.push("repository");
              return repository;
            }),
          ),
          Implementation.effect(
            ConfigKey,
            Effect.sync(() => {
              order.push("config");
              return { region: "test" };
            }),
          ),
        );
        const setup = runtimeSetup({ app: EmptyApp, implementation });
        assert.deepStrictEqual(order, []);
        const runtime = setup.construct();
        assert.deepStrictEqual(order, []);

        yield* runtime.ready();
        assert.deepStrictEqual(order, ["repository", "config"]);
        yield* runtime.ready();
        assert.deepStrictEqual(order, ["repository", "config"]);
      }),
    );

    it.effect("allocates one readiness cache for each constructed Runtime", () =>
      Effect.gen(function* () {
        let acquisitions = 0;
        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.sync(() => {
            acquisitions += 1;
            return repository;
          }),
        );
        const setup = runtimeSetup({ app: EmptyApp, implementation });
        const first = setup.construct();
        const second = setup.construct();

        assert.strictEqual(acquisitions, 0);
        yield* first.ready();
        assert.strictEqual(acquisitions, 1);
        yield* second.ready();
        assert.strictEqual(acquisitions, 2);
        yield* first.ready();
        yield* second.ready();
        assert.strictEqual(acquisitions, 2);
      }),
    );

    it.effect("stops after the first provider failure and caches its Cause", () =>
      Effect.gen(function* () {
        const failure = { readonly: "runtime-test/failure" } as const;
        const order: Array<string> = [];
        const implementation = Implementation.merge(
          Implementation.effect(
            RepositoryKey,
            Effect.sync(() => {
              order.push("failure");
              return repository;
            }).pipe(Effect.andThen(Effect.fail(failure))),
          ),
          Implementation.effect(
            ConfigKey,
            Effect.sync(() => {
              order.push("skipped");
              return { region: "test" };
            }),
          ),
        );
        const ready = runtimeSetup({ app: EmptyApp, implementation }).construct().ready();

        const first = yield* Effect.exit(ready);
        const second = yield* Effect.exit(ready);
        assert.strictEqual(first, second);
        assert.ok(Exit.isFailure(first));
        if (Exit.isFailure(first)) {
          const typedFailure = first.cause.reasons.find(Cause.isFailReason);
          assert.strictEqual(typedFailure?.error, failure);
          assert.strictEqual(Cause.hasDies(first.cause), false);
        }
        assert.deepStrictEqual(order, ["failure"]);
      }),
    );

    it.effect("shares one in-flight readiness and its cached success", () =>
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let acquisitions = 0;
        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.gen(function* () {
            acquisitions += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return repository;
          }),
        );
        const runtime = runtimeSetup({ app: EmptyApp, implementation }).construct();
        const first = yield* Effect.forkChild(Effect.exit(runtime.ready()), {
          startImmediately: true,
        });
        yield* Deferred.await(entered);
        const second = yield* Effect.forkChild(Effect.exit(runtime.ready()), {
          startImmediately: true,
        });
        assert.strictEqual(acquisitions, 1);
        yield* Deferred.succeed(release, undefined);

        const firstExit = yield* Fiber.join(first);
        const secondExit = yield* Fiber.join(second);
        assert.ok(Exit.isSuccess(firstExit));
        assert.strictEqual(firstExit, secondExit);
        assert.strictEqual(yield* Effect.exit(runtime.ready()), firstExit);
        assert.strictEqual(acquisitions, 1);
      }),
    );

    it.effect("interrupts an acquiring caller and caches interruption", () =>
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let acquisitions = 0;
        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.gen(function* () {
            acquisitions += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return repository;
          }),
        );
        const runtime = runtimeSetup({ app: EmptyApp, implementation }).construct();
        const acquiring = yield* Effect.forkChild(runtime.ready(), { startImmediately: true });
        yield* Deferred.await(entered);

        yield* Fiber.interrupt(acquiring);
        const acquiringExit = yield* Fiber.await(acquiring);
        assert.ok(Exit.isFailure(acquiringExit));
        assert.ok(Exit.hasInterrupts(acquiringExit));
        const cachedExit = yield* Effect.exit(runtime.ready());
        assert.ok(Exit.isFailure(cachedExit));
        assert.ok(Exit.hasInterrupts(cachedExit));
        assert.strictEqual(acquisitions, 1);
      }),
    );

    it.effect("interrupts a readiness waiter without cancelling the acquisition", () =>
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const waiterEntered = yield* Deferred.make<void>();
        let acquisitions = 0;
        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.gen(function* () {
            acquisitions += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return repository;
          }),
        );
        const runtime = runtimeSetup({ app: EmptyApp, implementation }).construct();
        const first = yield* Effect.forkChild(Effect.exit(runtime.ready()), {
          startImmediately: true,
        });
        yield* Deferred.await(entered);
        const waiter = yield* Effect.forkChild(
          Effect.gen(function* () {
            yield* Deferred.succeed(waiterEntered, undefined);
            return yield* Effect.exit(runtime.ready());
          }),
          { startImmediately: true },
        );
        yield* Deferred.await(waiterEntered);
        yield* Effect.yieldNow;

        yield* Fiber.interrupt(waiter);
        const waiterExit = yield* Fiber.await(waiter);
        assert.ok(Exit.isFailure(waiterExit));
        assert.ok(Exit.hasInterrupts(waiterExit));
        assert.strictEqual(acquisitions, 1);

        yield* Deferred.succeed(release, undefined);
        const firstExit = yield* Fiber.join(first);
        assert.ok(Exit.isSuccess(firstExit));
        assert.strictEqual(yield* Effect.exit(runtime.ready()), firstExit);
        assert.strictEqual(acquisitions, 1);
      }),
    );
  });

  describe("setup boundary admission", () => {
    it("rejects a copied App before publishing RuntimeSetup", () => {
      const forgedApp = { ...EmptyApp };

      assert.throws(
        () => runtimeSetup({ app: forgedApp }),
        /^runtimeSetup app must be constructed by app\(\)$/u,
      );
    });

    it("rejects an App-shaped proxy without structural reads", () => {
      let reads = 0;
      const forgedApp = new Proxy(
        { ...EmptyApp },
        {
          get: () => {
            reads += 1;
            throw new Error("App field was read");
          },
        },
      );

      assert.throws(
        () => runtimeSetup({ app: forgedApp }),
        /^runtimeSetup app must be constructed by app\(\)$/u,
      );
      assert.strictEqual(reads, 0);
    });

    it("captures the App before validating a flapping getter", () => {
      const alternateApp = app({
        id: "runtime-test/alternate",
        persistenceVersion: "1",
        modules: [],
      });
      let reads = 0;
      const options = {
        get app() {
          reads += 1;
          return reads === 1 ? EmptyApp : alternateApp;
        },
      };

      const setup = runtimeSetup(options);

      assert.strictEqual(setup.app, EmptyApp);
      assert.strictEqual(reads, 1);
    });
  });

  describe("terminal cause caching", () => {
    it.effect("caches a defect cause as one terminal result", () =>
      Effect.gen(function* () {
        const defect = new Error("runtime-test/defect");
        let calls = 0;
        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.sync(() => {
            calls += 1;
            return repository;
          }).pipe(Effect.andThen(Effect.die(defect))),
        );
        const ready = runtimeSetup({ app: EmptyApp, implementation }).construct().ready();

        const first = yield* Effect.exit(ready);
        const second = yield* Effect.exit(ready);
        assert.strictEqual(first, second);
        assert.strictEqual(Exit.hasDies(first), true);
        if (!Exit.isFailure(first)) {
          return yield* Effect.die(new Error("Expected a terminal defect"));
        }
        const reason = first.cause.reasons[0];
        if (reason === undefined || !Cause.isDieReason(reason)) {
          return yield* Effect.die(new Error("Expected a defect cause"));
        }
        assert.strictEqual(reason.defect, defect);
        assert.strictEqual(calls, 1);
      }),
    );

    it.effect("caches interruption as one terminal result without retrying", () =>
      Effect.gen(function* () {
        let calls = 0;
        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.sync(() => {
            calls += 1;
            return repository;
          }).pipe(Effect.andThen(Effect.interrupt)),
        );
        const ready = runtimeSetup({ app: EmptyApp, implementation }).construct().ready();

        const first = yield* Effect.exit(ready);
        const second = yield* Effect.exit(ready);
        assert.strictEqual(first, second);
        assert.ok(Exit.hasInterrupts(first));
        assert.strictEqual(calls, 1);
      }),
    );
  });
});
