import { Effect, Layer, Stream } from "effect";

import type { DurableOutbox, Movie, OutboxEntry } from "../domain/offline";
import { ConnectivityService, MovieService, OutboxPersistence } from "./services";

export const fixtureMovie: Movie = {
  id: "movie-1",
  title: "The Offline Runtime",
  comment: "Cached before disconnect",
  revision: 1,
};

export const emptyOutbox: DurableOutbox = { pending: [] };

export type OfflineServiceLayerOptions = Readonly<{
  readonly connectivity?: ConnectivityService["Service"]["changes"];
  readonly getMovie?: MovieService["Service"]["get"];
  readonly submit?: MovieService["Service"]["submit"];
  readonly loadOutbox?: Effect.Effect<DurableOutbox>;
  readonly persist?: OutboxPersistence["Service"]["persist"];
  readonly acknowledge?: OutboxPersistence["Service"]["acknowledge"];
  readonly onFinalize?: () => void;
}>;

export const createOfflineServicesLayer = (options: OfflineServiceLayerOptions = {}) => {
  let persistedOutbox = emptyOutbox;
  const lifecycle = <Service>(service: Service) =>
    Effect.acquireRelease(Effect.succeed(service), () => Effect.sync(() => options.onFinalize?.()));
  return Layer.mergeAll(
    Layer.effect(
      ConnectivityService,
      lifecycle(
        ConnectivityService.of({ changes: options.connectivity ?? Stream.make("offline") }),
      ),
    ),
    Layer.effect(
      MovieService,
      lifecycle(
        MovieService.of({
          get: Effect.fn("OfflineRecovery.MovieService.get")(
            options.getMovie ?? (() => Effect.succeed(fixtureMovie)),
          ),
          submit: Effect.fn("OfflineRecovery.MovieService.submit")(
            options.submit ??
              ((entry: OutboxEntry) =>
                Effect.succeed({
                  ...fixtureMovie,
                  comment: entry.comment,
                  revision: fixtureMovie.revision + 1,
                })),
          ),
        }),
      ),
    ),
    Layer.effect(
      OutboxPersistence,
      lifecycle(
        OutboxPersistence.of({
          load: Effect.fn("OfflineRecovery.OutboxPersistence.load")(
            () => options.loadOutbox ?? Effect.sync(() => persistedOutbox),
          )(),
          persist: Effect.fn("OfflineRecovery.OutboxPersistence.persist")(
            options.persist ??
              ((entry) =>
                Effect.sync(() => {
                  persistedOutbox = { pending: [...persistedOutbox.pending, entry] };
                  return entry;
                })),
          ),
          acknowledge: Effect.fn("OfflineRecovery.OutboxPersistence.acknowledge")(
            options.acknowledge ??
              ((entryIds) =>
                Effect.sync(() => {
                  const acknowledged = new Set(entryIds);
                  persistedOutbox = {
                    pending: persistedOutbox.pending.filter((entry) => !acknowledged.has(entry.id)),
                  };
                })),
          ),
        }),
      ),
    ),
  );
};

export const OfflineServicesLive = createOfflineServicesLayer();
