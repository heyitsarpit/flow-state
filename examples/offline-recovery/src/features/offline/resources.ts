import { Effect } from "effect";

import * as flow from "flow-state";

import type { DurableOutbox, Movie, MovieId, MovieUnavailable } from "../../domain/offline";
import { MovieService, OutboxPersistence } from "../../services/services";

export const movieResource = flow.resource<
  [MovieId],
  Movie,
  MovieUnavailable,
  Effect.Effect<Movie, MovieUnavailable, MovieService>,
  "offline.movie"
>({
  id: "offline.movie",
  key: (movieId) => flow.createKey("offline", "movie", movieId),
  lookup: (movieId) => Effect.flatMap(MovieService, (service) => service.get(movieId)),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});

export const outboxResource = flow.resource<
  [],
  DurableOutbox,
  never,
  Effect.Effect<DurableOutbox, never, OutboxPersistence>,
  "offline.outbox"
>({
  id: "offline.outbox",
  key: () => flow.createKey("offline", "outbox"),
  lookup: () => Effect.flatMap(OutboxPersistence, (persistence) => persistence.load),
  freshness: { staleAfter: "1 day", onInvalidate: "active" },
});
