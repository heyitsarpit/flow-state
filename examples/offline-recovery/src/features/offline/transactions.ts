import { Effect, Option } from "effect";

import * as flow from "flow-state";
import type { FlowResourceSnapshot } from "flow-state";

import type {
  CommentRejected,
  DurableOutbox,
  OutboxEntry,
  PersistenceUnavailable,
} from "../../domain/offline";
import { MovieService, OutboxPersistence } from "../../services/services";
import type { OfflineContext } from "./machine-types";
import { movieResource, outboxResource } from "./resources";
import type { WorkerEvent } from "./worker-types";

const isOutbox = (value: unknown): value is DurableOutbox =>
  typeof value === "object" && value !== null && "pending" in value && Array.isArray(value.pending);

export const outboxFromResources = (
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
): DurableOutbox => {
  const snapshot = resources[outboxResource.id];
  return snapshot?.availability === "value" && isOutbox(snapshot.value)
    ? snapshot.value
    : { pending: [] };
};

type LocalQueueParams = Readonly<{
  readonly entry: OutboxEntry;
  readonly nextOutbox: DurableOutbox;
}>;

type QueueSelector = Readonly<{
  readonly context: OfflineContext;
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
}>;

const localQueueTransaction = (index: 0 | 1, id: "offline.queue-first" | "offline.queue-second") =>
  flow.transaction<
    LocalQueueParams,
    OutboxEntry,
    PersistenceUnavailable,
    OutboxPersistence,
    never,
    typeof id,
    readonly [
      { readonly ref: ReturnType<typeof outboxResource.ref>; readonly replace: DurableOutbox },
    ],
    QueueSelector
  >({
    id,
    params: ({ context, resources }) => {
      const drafts = Option.getOrUndefined(context.drafts);
      if (drafts === undefined) return null;
      const entry = drafts[index];
      const current = outboxFromResources(resources);
      return { entry, nextOutbox: { pending: [...current.pending, entry] } };
    },
    preview: {
      apply: ({ params }) => [{ ref: outboxResource.ref(), replace: params.nextOutbox }],
    },
    commit: (params) =>
      Effect.flatMap(OutboxPersistence, (persistence) => persistence.persist(params.entry)),
    scope: { id: "offline.local-queue" },
    queue: { when: () => true, replay: () => true, undo: () => true },
    concurrency: "serialize",
  });

export const queueFirstComment = localQueueTransaction(0, "offline.queue-first");
export const queueSecondComment = localQueueTransaction(1, "offline.queue-second");

type DrainParams = Readonly<{
  readonly entry: OutboxEntry;
  readonly nextOutbox: DurableOutbox;
}>;

type DrainSelector = Readonly<{
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
}>;

export const drainOutbox = flow.transaction<
  DrainParams,
  OutboxEntry,
  CommentRejected,
  MovieService | OutboxPersistence,
  WorkerEvent,
  "offline.drain-one",
  readonly [
    { readonly ref: ReturnType<typeof outboxResource.ref>; readonly replace: DurableOutbox },
  ],
  DrainSelector
>({
  id: "offline.drain-one",
  params: ({ resources }) => {
    const outbox = outboxFromResources(resources);
    const entry = outbox.pending[0];
    return outbox.pending.length === 0
      ? null
      : { entry: entry!, nextOutbox: { pending: outbox.pending.slice(1) } };
  },
  preview: {
    apply: ({ params }) => [{ ref: outboxResource.ref(), replace: params.nextOutbox }],
  },
  commit: (params) =>
    Effect.gen(function* () {
      const movies = yield* MovieService;
      const persistence = yield* OutboxPersistence;
      yield* movies.submit(params.entry);
      yield* persistence.acknowledge([params.entry.id]);
      return params.entry;
    }),
  invalidates: [movieResource.ref("movie-1")],
  routes: flow.outcomes<OutboxEntry, CommentRejected, WorkerEvent>({
    success: () => ({ type: "DRAIN_NEXT" }),
    failure: ["DRAIN_FAILED", "error"],
  }),
  concurrency: "serialize",
});

