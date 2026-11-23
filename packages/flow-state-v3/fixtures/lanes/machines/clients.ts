import { Effect, Schema } from "effect";
import { definition, Flow, machine, Outcome, transaction } from "../../../src/index.ts";
import { GitApi } from "../../services/git/services.ts";

const repo = { repo: Schema.String };

// One sync of a repository under a policy, keyed by the repository: a lost answer is unknown.
const syncUnder = (concurrency: "latest" | "serialize" | "cancel") =>
  transaction({
    id: `Lanes/sync-${concurrency}`,
    input: repo,
    key: ["repo"],
    concurrency,
    services: [GitApi],
    commit: (input, { attempt }) =>
      GitApi.use((api) => api.sync(input, { idempotencyKey: attempt.id })).pipe(
        Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
      ),
  });

// A persisted sync client per policy, each written out so its events are its own type: one client's
// event is refused by another. Each event is one turn: a commit, two commits, a retry or a cancel
// and then a commit, a cancel, or a retry, so a commit meets every phase a head can be in, Unsent,
// Resending and Cancelling included.
/**
 * The definition of the sync client whose writes run under `latest`.
 */
export const Latest = definition({
  id: "Lanes/latest",
  persist: true,
  states: ["READY"],
  events: {
    Commit: repo,
    Twice: repo,
    RetryCommit: repo,
    CancelCommit: repo,
    Cancel: repo,
    Retry: repo,
  },
  internalEvents: {
    Synced: {},
    Limited: {},
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: {},
  operations: ({ E }) => ({
    sync: syncUnder("latest").outcomes({
      success: E.Synced,
      failure: { RateLimited: E.Limited },
      notSent: E.NotSent.from((e) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

const latestByRepo = ({ event }: { readonly event: typeof Latest.E.Commit.Type }) => ({
  repo: event.repo,
});

/**
 * The sync client whose writes run under `latest`.
 */
export const LatestMachine = machine(Latest, ({ S, O }) => ({
  default: S.READY,
  on: {
    Commit: { actions: [O.sync.commit(latestByRepo)] },
    Twice: { actions: [O.sync.commit(latestByRepo), O.sync.commit(latestByRepo)] },
    RetryCommit: { actions: [O.sync.retry(latestByRepo), O.sync.commit(latestByRepo)] },
    CancelCommit: { actions: [O.sync.cancel(latestByRepo), O.sync.commit(latestByRepo)] },
    Cancel: { actions: [O.sync.cancel(latestByRepo)] },
    Retry: { actions: [O.sync.retry(latestByRepo)] },
    Synced: {},
    Limited: {},
    NotSent: {},
    Unsure: {},
  },
}));

/**
 * The definition of the sync client whose writes run under `serialize`.
 */
export const Serialize = definition({
  id: "Lanes/serialize",
  persist: true,
  states: ["READY"],
  events: {
    Commit: repo,
    Twice: repo,
    RetryCommit: repo,
    CancelCommit: repo,
    Cancel: repo,
    Retry: repo,
  },
  internalEvents: {
    Synced: {},
    Limited: {},
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: {},
  operations: ({ E }) => ({
    sync: syncUnder("serialize").outcomes({
      success: E.Synced,
      failure: { RateLimited: E.Limited },
      notSent: E.NotSent.from((e) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

const serializeByRepo = ({ event }: { readonly event: typeof Serialize.E.Commit.Type }) => ({
  repo: event.repo,
});

/**
 * The sync client whose writes run under `serialize`.
 */
export const SerializeMachine = machine(Serialize, ({ S, O }) => ({
  default: S.READY,
  on: {
    Commit: { actions: [O.sync.commit(serializeByRepo)] },
    Twice: { actions: [O.sync.commit(serializeByRepo), O.sync.commit(serializeByRepo)] },
    RetryCommit: { actions: [O.sync.retry(serializeByRepo), O.sync.commit(serializeByRepo)] },
    CancelCommit: { actions: [O.sync.cancel(serializeByRepo), O.sync.commit(serializeByRepo)] },
    Cancel: { actions: [O.sync.cancel(serializeByRepo)] },
    Retry: { actions: [O.sync.retry(serializeByRepo)] },
    Synced: {},
    Limited: {},
    NotSent: {},
    Unsure: {},
  },
}));

/**
 * The definition of the sync client whose writes run under `cancel`.
 */
export const Cancel = definition({
  id: "Lanes/cancel",
  persist: true,
  states: ["READY"],
  events: {
    Commit: repo,
    Twice: repo,
    RetryCommit: repo,
    CancelCommit: repo,
    Cancel: repo,
    Retry: repo,
  },
  internalEvents: {
    Synced: {},
    Limited: {},
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: {},
  operations: ({ E }) => ({
    sync: syncUnder("cancel").outcomes({
      success: E.Synced,
      failure: { RateLimited: E.Limited },
      notSent: E.NotSent.from((e) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

const cancelByRepo = ({ event }: { readonly event: typeof Cancel.E.Commit.Type }) => ({
  repo: event.repo,
});

/**
 * The sync client whose writes run under `cancel`.
 */
export const CancelMachine = machine(Cancel, ({ S, O }) => ({
  default: S.READY,
  on: {
    Commit: { actions: [O.sync.commit(cancelByRepo)] },
    Twice: { actions: [O.sync.commit(cancelByRepo), O.sync.commit(cancelByRepo)] },
    RetryCommit: { actions: [O.sync.retry(cancelByRepo), O.sync.commit(cancelByRepo)] },
    CancelCommit: { actions: [O.sync.cancel(cancelByRepo), O.sync.commit(cancelByRepo)] },
    Cancel: { actions: [O.sync.cancel(cancelByRepo)] },
    Retry: { actions: [O.sync.retry(cancelByRepo)] },
    Synced: {},
    Limited: {},
    NotSent: {},
    Unsure: {},
  },
}));
