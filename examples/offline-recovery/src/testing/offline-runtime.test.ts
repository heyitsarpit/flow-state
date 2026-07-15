import { Deferred, Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { selectView } from "flow-state";

import { CommentRejected, MovieUnavailable } from "../domain/offline";
import { offlineMachine } from "../features/offline/machine";
import { movieResource, outboxResource } from "../features/offline/resources";
import { drainOutbox } from "../features/offline/transactions";
import { offlineView } from "../features/offline/view";
import { outboxWorker } from "../features/offline/worker";
import { fixtureMovie } from "../services/layers";
import {
  createConnectivityControls,
  createOfflineTestRuntime,
  createPersistControls,
} from "./test-runtime";

const restoredEntry = {
  id: "restored-1",
  movieId: "movie-1",
  comment: "Restored offline comment",
} as const;

describe("offline recovery runtime", () => {
  it("keeps cached data offline and serializes two in-process local queue writes", async () => {
    const persistence = createPersistControls();
    const runtime = createOfflineTestRuntime({ persist: persistence.persist });
    const actor = runtime.orchestrators.start(offlineMachine, { id: "offline.queue" });

    try {
      actor.send({ type: "START" });
      expect(runtime.resources.get(movieResource.ref("movie-1"))?.value).toMatchObject({
        comment: "Cached before disconnect",
      });

      actor.send({ type: "QUEUE_PAIR", first: "first", second: "second" });
      expect(persistence.calls.map((entry) => entry.comment)).toEqual(["first"]);
      expect(actor.receipts().filter((receipt) => receipt.type === "transaction:queue")).toEqual([
        expect.objectContaining({ id: "offline.queue-second", queueKey: "offline.local-queue" }),
      ]);
      expect(runtime.resources.get(outboxResource.ref())?.value?.pending).toHaveLength(1);

      persistence.succeedAt(0);
      await actor.flush();
      await actor.flush();
      expect(persistence.calls.map((entry) => entry.comment)).toEqual(["first", "second"]);
      expect(runtime.resources.get(outboxResource.ref())?.value?.pending).toHaveLength(2);

      persistence.succeedAt(1);
      await actor.flush();
      expect(
        actor.receipts().filter((receipt) => receipt.type === "transaction:dequeue"),
      ).toHaveLength(1);
    } finally {
      await runtime.dispose();
    }
  });

  it("shows a typed movie failure and retries the state-owned read after re-entry", async () => {
    let attempts = 0;
    const lookupStarted = Effect.runSync(Deferred.make<void>());
    const lookupGate = Effect.runSync(Deferred.make<void>());
    const runtime = createOfflineTestRuntime({
      seedMovie: false,
      getMovie: (movieId) => {
        attempts += 1;
        return attempts === 1
          ? Deferred.succeed(lookupStarted, undefined).pipe(
              Effect.andThen(Deferred.await(lookupGate)),
              Effect.andThen(Effect.fail(new MovieUnavailable({ movieId, message: "offline" }))),
            )
          : Effect.succeed({
              id: movieId,
              title: "Recovered movie",
              comment: "Loaded after reconnect",
              revision: 2,
            });
      },
    });
    const actor = runtime.orchestrators.start(offlineMachine, { id: "offline.resource-retry" });

    try {
      actor.send({ type: "START" });
      await Effect.runPromise(Deferred.await(lookupStarted));
      expect(runtime.resources.get(movieResource.ref("movie-1"))).toMatchObject({
        status: "loading",
        availability: "empty",
        activity: "fetching",
      });
      Effect.runSync(Deferred.succeed(lookupGate, undefined));
      await actor.flush();
      expect(actor.getSnapshot().resources[movieResource.id]).toMatchObject({
        status: "failure",
        error: { _tag: "MovieUnavailable" },
      });

      actor.send({ type: "ONLINE" });
      await actor.flush();
      expect(attempts).toBe(2);
      expect(actor.getSnapshot().resources[movieResource.id]).toMatchObject({
        status: "success",
        value: { comment: "Loaded after reconnect" },
      });
    } finally {
      await runtime.dispose();
    }
  });

  it("cancels active and queued local work and rolls back its optimistic outbox layer", async () => {
    const persistence = createPersistControls();
    const runtime = createOfflineTestRuntime({ persist: persistence.persist });
    const actor = runtime.orchestrators.start(offlineMachine, { id: "offline.cancel" });

    try {
      actor.send({ type: "START" });
      actor.send({ type: "QUEUE_PAIR", first: "first", second: "second" });
      actor.send({ type: "CANCEL_QUEUE" });
      await actor.flush();

      expect(actor.getSnapshot().value).toBe("offline");
      expect(persistence.entries[0]?.signal.aborted).toBe(true);
      expect(persistence.calls).toHaveLength(1);
      expect(runtime.resources.get(outboxResource.ref())?.value).toEqual({ pending: [] });
      expect(
        actor
          .receipts()
          .filter(
            (receipt) =>
              receipt.type === "transaction:rollback-patch" ||
              receipt.type === "transaction:interrupt",
          ),
      ).toEqual(expect.arrayContaining([expect.objectContaining({ id: "offline.queue-first" })]));
    } finally {
      await runtime.dispose();
    }
  });

  it("drains a restored item once across repeated reconnect and finalizes replaced owners", async () => {
    const connectivity = createConnectivityControls(4);
    const submitted: Array<string> = [];
    const submitStarted = Effect.runSync(Deferred.make<void>());
    const submitGate = Effect.runSync(Deferred.make<void>());
    const refreshStarted = Effect.runSync(Deferred.make<void>());
    const refreshGate = Effect.runSync(Deferred.make<void>());
    let finalizers = 0;
    const runtime = createOfflineTestRuntime({
      connectivity: connectivity.stream,
      outbox: [restoredEntry],
      getMovie: () =>
        Deferred.succeed(refreshStarted, undefined).pipe(
          Effect.andThen(Deferred.await(refreshGate)),
          Effect.as({
            ...fixtureMovie,
            comment: "Refreshed after reconnect",
            revision: 2,
          }),
        ),
      submit: (entry) =>
        Effect.sync(() => submitted.push(entry.id)).pipe(
          Effect.andThen(Deferred.succeed(submitStarted, undefined)),
          Effect.andThen(Deferred.await(submitGate)),
        ),
      onFinalize: () => (finalizers += 1),
    });
    const actor = runtime.orchestrators.start(offlineMachine, { id: "offline.connectivity" });

    try {
      actor.send({ type: "START" });
      await actor.flush();
      actor.send({ type: "ONLINE" });
      await Effect.runPromise(Deferred.await(submitStarted));
      const firstChild = runtime.orchestrators.get(`offline.connectivity/${outboxWorker.id}`);
      Effect.runSync(Deferred.succeed(submitGate, undefined));
      await firstChild?.flush();
      await Effect.runPromise(Deferred.await(refreshStarted));
      expect(runtime.resources.get(movieResource.ref("movie-1"))).toMatchObject({
        availability: "value",
        activity: "fetching",
        value: { comment: "Cached before disconnect" },
      });
      Effect.runSync(Deferred.succeed(refreshGate, undefined));
      await firstChild?.flush();
      await actor.flush();
      expect(submitted).toEqual(["restored-1"]);
      expect(runtime.resources.get(outboxResource.ref())?.value).toEqual({ pending: [] });
      expect(runtime.resources.get(movieResource.ref("movie-1"))?.value).toMatchObject({
        comment: "Refreshed after reconnect",
      });
      const firstChildGeneration = actor.children()[outboxWorker.id]?.generation;

      actor.send({ type: "ONLINE" });
      await actor.flush();
      expect(submitted).toEqual(["restored-1"]);
      expect(actor.children()[outboxWorker.id]?.generation).toBe(firstChildGeneration);

      connectivity.controls[0]?.emit("offline");
      await actor.flush();
      expect(actor.getSnapshot().value).toBe("online");

      actor.send({ type: "OFFLINE" });
      await actor.flush();
      expect(
        actor
          .receipts()
          .filter((receipt) => receipt.type === "child:stop" && receipt.id === outboxWorker.id),
      ).toHaveLength(1);

      actor.send({ type: "ONLINE" });
      await actor.flush();
      await runtime.orchestrators.get(`offline.connectivity/${outboxWorker.id}`)?.flush();
      expect(
        (actor.children()[outboxWorker.id]?.generation ?? 0) > (firstChildGeneration ?? 0),
      ).toBe(true);
      expect(submitted).toEqual(["restored-1"]);
    } finally {
      await runtime.dispose();
    }
    expect(finalizers).toBe(3);
  });

  it("surfaces a typed drain failure and retries the same new transaction", async () => {
    let attempts = 0;
    const runtime = createOfflineTestRuntime({
      connectivity: Stream.make("online"),
      outbox: [restoredEntry],
      submit: (entry) => {
        attempts += 1;
        return attempts === 1
          ? Effect.fail(
              new CommentRejected({ entryId: entry.id, message: "server rejected comment" }),
            )
          : Effect.succeed(undefined);
      },
    });
    const actor = runtime.orchestrators.start(offlineMachine, { id: "offline.failure" });

    try {
      actor.send({ type: "START" });
      await actor.flush();
      const childActor = runtime.orchestrators.get(`offline.failure/${outboxWorker.id}`);
      await childActor?.flush();
      await actor.flush();
      expect(childActor?.getSnapshot().transactions[drainOutbox.id]).toMatchObject({
        status: "failure",
        error: { _tag: "CommentRejected" },
      });
      expect(selectView(actor.getSnapshot(), offlineView).failed).toBe(true);
      expect(actor.children()[outboxWorker.id]?.status).toBe("failure");

      expect(actor.retryChild(outboxWorker.id)).toBe(true);
      const retriedChild = runtime.orchestrators.get(`offline.failure/${outboxWorker.id}`);
      await retriedChild?.flush();
      await retriedChild?.flush();
      await actor.flush();
      expect(attempts).toBe(2);
      expect(runtime.resources.get(outboxResource.ref())?.value).toEqual({ pending: [] });
    } finally {
      await runtime.dispose();
    }
  });
});
