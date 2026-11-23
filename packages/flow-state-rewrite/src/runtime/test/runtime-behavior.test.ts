import { assert, describe, it } from "@effect/vitest";
import { Context, Effect } from "effect";

import { app } from "../../app/app.js";
import { Implementation } from "../../implementation/implementation.js";
import { runtimeOwner, runtimeSetup } from "../runtime.js";

const emptyApp = app({
  id: "runtime-behavior/app",
  persistenceVersion: "1",
  modules: [],
});

type Service = { value: string };

class ServiceKey extends Context.Service<ServiceKey, Service>()("RuntimeBehavior/Service") {}

describe("runtime behavior paths", () => {
  it.effect("keeps provider construction cold until readiness", () =>
    Effect.gen(function* () {
      let acquisitions = 0;

      const implementation = Implementation.effect(
        ServiceKey,
        Effect.sync(() => {
          acquisitions += 1;

          return { value: "ready" };
        }),
      );

      const runtime = runtimeSetup({ app: emptyApp, implementation }).construct();

      assert.strictEqual(acquisitions, 0);
      yield* runtime.ready();
      assert.strictEqual(acquisitions, 1);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("caches readiness and releases the provider once", () =>
    Effect.gen(function* () {
      let acquisitions = 0;
      let releases = 0;

      const implementation = Implementation.effect(
        ServiceKey,
        Effect.acquireRelease(
          Effect.sync(() => {
            acquisitions += 1;

            return { value: "ready" };
          }),
          () => Effect.sync(() => releases++),
        ),
      );

      const runtime = runtimeSetup({ app: emptyApp, implementation }).construct();

      yield* runtime.ready();
      yield* runtime.ready();
      assert.strictEqual(acquisitions, 1);
      yield* runtimeOwner(runtime).close();
      yield* runtimeOwner(runtime).close();
      assert.strictEqual(releases, 1);
    }),
  );
});
