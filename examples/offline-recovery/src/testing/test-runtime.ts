import { Effect, Stream } from "effect";

import * as flow from "flow-state";
import { createControlledStream } from "flow-state/testing";

import { OfflineApp } from "../app/app";
import type {
  CommentRejected,
  Connectivity,
  ConnectivityUnavailable,
  Movie,
  MovieId,
  MovieUnavailable,
  OutboxEntry,
  PersistenceUnavailable,
} from "../domain/offline";
import { movieResource, outboxResource } from "../features/offline/resources";
import { createOfflineServicesLayer, emptyOutbox, fixtureMovie } from "../services/layers";

export function createConnectivityControls(count: number) {
  const controls = Array.from({ length: count }, (_, index) =>
    createControlledStream<Connectivity, ConnectivityUnavailable>(`offline.connectivity.${index}`),
  );
  let subscriptions = 0;
  const stream = Stream.unwrap(
    Effect.sync(() => {
      const control = controls[subscriptions++];
      if (control === undefined) throw new Error(`missing connectivity control ${subscriptions}`);
      return control.stream();
    }),
  );
  return { controls, stream, subscriptions: () => subscriptions };
}

export function createPersistControls() {
  const calls: Array<OutboxEntry> = [];
  const entries: Array<{
    readonly signal: AbortSignal;
    readonly succeed: () => void;
  }> = [];
  const persist = (entry: OutboxEntry): Effect.Effect<OutboxEntry, PersistenceUnavailable> =>
    Effect.promise((signal) => {
      calls.push(entry);
      return new Promise<OutboxEntry>((resolve) => {
        entries.push({ signal, succeed: () => resolve(entry) });
      });
    });
  return {
    calls,
    entries,
    persist,
    succeedAt: (index: number) => {
      const entry = entries[index];
      if (entry === undefined) throw new Error(`missing persistence attempt ${index}`);
      entry.succeed();
    },
  };
}

export type TestRuntimeOptions = Readonly<{
  readonly connectivity?: ReturnType<typeof createConnectivityControls>["stream"];
  readonly persist?: (entry: OutboxEntry) => Effect.Effect<OutboxEntry, PersistenceUnavailable>;
  readonly getMovie?: (movieId: MovieId) => Effect.Effect<Movie, MovieUnavailable>;
  readonly submit?: (entry: OutboxEntry) => Effect.Effect<unknown, CommentRejected>;
  readonly onFinalize?: () => void;
  readonly outbox?: ReadonlyArray<OutboxEntry>;
  readonly seedMovie?: boolean;
}>;

export function createOfflineTestRuntime(options: TestRuntimeOptions = {}) {
  const submit = options.submit;
  const runtime = flow.runtime(
    OfflineApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [
        createOfflineServicesLayer({
          connectivity: options.connectivity ?? Stream.never,
          ...(options.getMovie === undefined ? {} : { getMovie: options.getMovie }),
          ...(options.persist === undefined ? {} : { persist: options.persist }),
          ...(submit === undefined
            ? {}
            : {
                submit: (entry: OutboxEntry) =>
                  Effect.map(submit(entry), () => ({
                    ...fixtureMovie,
                    comment: entry.comment,
                    revision: fixtureMovie.revision + 1,
                  })),
              }),
          ...(options.onFinalize === undefined ? {} : { onFinalize: options.onFinalize }),
        }),
      ],
    }),
  );
  runtime.resources.seedResources([
    ...(options.seedMovie === false
      ? []
      : [{ ref: movieResource.ref("movie-1"), value: fixtureMovie }]),
    {
      ref: outboxResource.ref(),
      value: options.outbox === undefined ? emptyOutbox : { pending: options.outbox },
    },
  ]);
  return runtime;
}
