import { Context, Effect, Stream } from "effect";

import type {
  CommentRejected,
  Connectivity,
  ConnectivityUnavailable,
  DurableOutbox,
  Movie,
  MovieId,
  MovieUnavailable,
  OutboxEntry,
  PersistenceUnavailable,
} from "../domain/offline";

export interface ConnectivityServiceShape {
  readonly changes: Stream.Stream<Connectivity, ConnectivityUnavailable>;
}

export class ConnectivityService extends Context.Service<
  ConnectivityService,
  ConnectivityServiceShape
>()("offline-recovery/ConnectivityService") {}

export interface MovieServiceShape {
  readonly get: (movieId: MovieId) => Effect.Effect<Movie, MovieUnavailable>;
  readonly submit: (entry: OutboxEntry) => Effect.Effect<Movie, CommentRejected>;
}

export class MovieService extends Context.Service<MovieService, MovieServiceShape>()(
  "offline-recovery/MovieService",
) {}

export interface OutboxPersistenceShape {
  readonly load: Effect.Effect<DurableOutbox>;
  readonly persist: (entry: OutboxEntry) => Effect.Effect<OutboxEntry, PersistenceUnavailable>;
  readonly acknowledge: (entryIds: ReadonlyArray<string>) => Effect.Effect<void>;
}

export class OutboxPersistence extends Context.Service<OutboxPersistence, OutboxPersistenceShape>()(
  "offline-recovery/OutboxPersistence",
) {}
