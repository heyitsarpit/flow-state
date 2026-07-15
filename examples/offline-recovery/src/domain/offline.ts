import { Data } from "effect";

export type Connectivity = "offline" | "online";
export type MovieId = "movie-1" | "movie-2";

export interface Movie {
  readonly id: MovieId;
  readonly title: string;
  readonly comment: string;
  readonly revision: number;
}

export interface OutboxEntry {
  readonly id: string;
  readonly movieId: MovieId;
  readonly comment: string;
}

export interface DurableOutbox {
  readonly pending: ReadonlyArray<OutboxEntry>;
}

export class MovieUnavailable extends Data.TaggedError("MovieUnavailable")<{
  readonly movieId: MovieId;
  readonly message: string;
}> {}

export class CommentRejected extends Data.TaggedError("CommentRejected")<{
  readonly entryId: string;
  readonly message: string;
}> {}

export class PersistenceUnavailable extends Data.TaggedError("PersistenceUnavailable")<{
  readonly entryId: string;
  readonly message: string;
}> {}

export class ConnectivityUnavailable extends Data.TaggedError("ConnectivityUnavailable")<{
  readonly message: string;
}> {}
