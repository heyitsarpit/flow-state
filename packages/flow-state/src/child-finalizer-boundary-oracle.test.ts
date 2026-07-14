import { Deferred, Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";

describe("child finalizer boundary oracle", () => {
  it("preserves failed cleanup through flush and blocks child replacement", async () => {
    const acquired = Effect.runSync(Deferred.make<void>());
    const finalizerError = new Error("child replacement cleanup failed");
    let finalizerRuns = 0;

    const childMachine = flow.machine<{}, never, "running">({
      id: "child.finalizer.failure.child",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.stream({
            id: "Child.finalizer.failure.stream",
            subscribe: () =>
              Stream.callback<never, never>(() =>
                Effect.gen(function* () {
                  yield* Effect.addFinalizer(() =>
                    Effect.sync(() => {
                      finalizerRuns += 1;
                      throw finalizerError;
                    }),
                  );
                  yield* Deferred.succeed(acquired, undefined);
                }),
              ),
          }),
        },
      },
    });
    const childId = "child.finalizer.failure.binding";
    const parentMachine = flow.machine<{}, Readonly<{ readonly type: "REENTER" }>, "running">({
      id: "child.finalizer.failure.parent",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.child({
            id: childId,
            machine: childMachine,
          }),
          on: {
            REENTER: {
              target: "running",
              reenter: true,
            },
          },
        },
      },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("ChildFinalizerFailure", {
              machines: { parent: parentMachine },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );
    const actor = runtime.orchestrators.start(parentMachine, {
      id: "child.finalizer.failure.parent.actor",
      policy: "keep-alive",
    });

    try {
      await Effect.runPromise(Deferred.await(acquired));

      actor.send({ type: "REENTER" });

      await expect(actor.flush()).rejects.toThrow(finalizerError.message);
      await expect(actor.flush()).rejects.toThrow(finalizerError.message);
      expect(finalizerRuns).toBe(1);
      expect(actor.children()[childId]).toBeUndefined();
      expect(
        actor
          .receipts()
          .filter((receipt) => receipt.type === "child:start" && receipt.id === childId),
      ).toHaveLength(1);
    } finally {
      await runtime.dispose().catch(() => undefined);
    }
  });
});
