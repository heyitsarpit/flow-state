import { Deferred, Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "flow-state";
import { test } from "flow-state/testing";

import { OfflineApp } from "../app/app";
import { offlineMachine } from "../features/offline/machine";
import { movieResource, outboxResource } from "../features/offline/resources";
import { drainOutbox } from "../features/offline/transactions";
import { outboxWorker } from "../features/offline/worker";
import { createOfflineServicesLayer, fixtureMovie } from "../services/layers";
import { createOfflineTestRuntime } from "./test-runtime";

const persisted = {
  id: "persisted-1",
  movieId: "movie-1",
  comment: "Persisted while offline",
} as const;

describe("offline boot recovery", () => {
  it("round-trips durable outbox data and starts new work after test rehydration", async () => {
    const source = test.app(OfflineApp).rehydrate(offlineMachine, {
      snapshot: offlineMachine.getInitialSnapshot(),
      resources: [
        { ref: outboxResource.ref(), value: { pending: [persisted] } },
        { ref: movieResource.ref("movie-1"), value: fixtureMovie },
      ],
      provide: createOfflineServicesLayer(),
    });
    const boot = source.runtime.dehydrateBoot();
    await source.dispose();
    const submissions: Array<string> = [];
    const started = Effect.runSync(Deferred.make<void>());
    const gate = Effect.runSync(Deferred.make<void>());
    const services = createOfflineServicesLayer({
      connectivity: Stream.never,
      submit: (entry) =>
        Effect.sync(() => {
          submissions.push(entry.id);
          return { ...fixtureMovie, comment: entry.comment, revision: 2 };
        }).pipe(
          Effect.tap(() => Deferred.succeed(started, undefined)),
          Effect.flatMap((movie) => Effect.as(Deferred.await(gate), movie)),
        ),
    });
    const harness = test.app(OfflineApp).rehydrate(offlineMachine, {
      id: "offline.rehydrated",
      snapshot: offlineMachine.getInitialSnapshot(),
      boot,
      provide: services,
    });

    try {
      expect(harness.runtime.resources.get(outboxResource.ref())?.value).toEqual({
        pending: [persisted],
      });
      harness.send({ type: "START" });
      harness.send({ type: "ONLINE" });
      await harness.until(() => submissions.length === 1, { maxTicks: 20, maxFibers: 10 });
      await Effect.runPromise(Deferred.await(started));
      Effect.runSync(Deferred.succeed(gate, undefined));
      await harness.until(
        () => harness.runtime.resources.get(outboxResource.ref())?.value?.pending.length === 0,
        { maxTicks: 20, maxFibers: 10 },
      );

      expect(submissions).toEqual(["persisted-1"]);
      expect(harness.runtime.resources.get(outboxResource.ref())?.value).toEqual({ pending: [] });
      const child = harness.runtime.orchestrators.get(`offline.rehydrated/${outboxWorker.id}`);
      expect(
        child
          ?.receipts()
          .filter(
            (receipt) => receipt.type === "transaction:start" && receipt.id === drainOutbox.id,
          ),
      ).toHaveLength(1);

      harness.send({ type: "ONLINE" });
      await harness.flush();
      expect(submissions).toEqual(["persisted-1"]);
    } finally {
      await harness.dispose();
    }
  });

  it("rejects interrupted transaction state instead of claiming that boot resumes it", async () => {
    const runtime = createOfflineTestRuntime();
    const boot = runtime.dehydrateBoot();
    await runtime.dispose();
    const destination = flow.runtime(
      OfflineApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [createOfflineServicesLayer()],
      }),
    );

    try {
      destination.hydrateBoot(boot);
      expect(destination.dehydrateBoot().actors).toEqual([]);
      expect(destination.resources.get(outboxResource.ref())?.value).toEqual({ pending: [] });
    } finally {
      await destination.dispose();
    }
  });
});
