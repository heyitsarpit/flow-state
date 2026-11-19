import { Effect, Schema } from "effect";
import { definition, Flow, machine, Outcome, transaction } from "../../../src/index.ts";
import { GitApi } from "../../services/git/services.ts";

type Policy = "latest" | "serialize" | "cancel";

const repo = { repo: Schema.String };

const byRepo = ({ event }: { readonly event: { readonly repo: string } }) => ({ repo: event.repo });

// One sync of a repository under a policy, keyed by the repository: a lost answer is unknown.
const syncUnder = (concurrency: Policy) =>
  transaction({
    id: `Lanes/sync-${concurrency}`,
    input: repo,
    key: ["repo"],
    concurrency,
    services: [GitApi],
    commit: (input, { attempt }) =>
      Effect.flatMap(Effect.service(GitApi), (api) =>
        api.sync(input, { idempotencyKey: attempt.id }),
      ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
  });

// A persisted sync client whose writes run under one policy. Each event is one turn: a commit,
// two commits, a retry or a cancel and then a commit, a cancel, or a retry, so a commit meets
// every phase a head can be in, Unsent, Resending and Cancelling included.
const clientUnder = (concurrency: Policy) => {
  const Client = definition({
    id: `Lanes/${concurrency}`,
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
      sync: syncUnder(concurrency).outcomes({
        success: E.Synced,
        failure: { RateLimited: E.Limited },
        notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
        unknown: E.Unsure,
      }),
    }),
  });

  const Machine = machine(Client, ({ S, O }) => ({
    default: S.READY,
    on: {
      Commit: { actions: [O.sync.commit(byRepo)] },
      Twice: { actions: [O.sync.commit(byRepo), O.sync.commit(byRepo)] },
      RetryCommit: { actions: [O.sync.retry(byRepo), O.sync.commit(byRepo)] },
      CancelCommit: { actions: [O.sync.cancel(byRepo), O.sync.commit(byRepo)] },
      Cancel: { actions: [O.sync.cancel(byRepo)] },
      Retry: { actions: [O.sync.retry(byRepo)] },
      Synced: {},
      Limited: {},
      NotSent: {},
      Unsure: {},
    },
  }));

  return { Client, Machine };
};

const latest = clientUnder("latest");
const serialize = clientUnder("serialize");
const cancel = clientUnder("cancel");

/**
 * The definition of the sync client whose writes run under `latest`.
 */
export const Latest = latest.Client;

/**
 * The sync client whose writes run under `latest`.
 */
export const LatestMachine = latest.Machine;

/**
 * The definition of the sync client whose writes run under `serialize`.
 */
export const Serialize = serialize.Client;

/**
 * The sync client whose writes run under `serialize`.
 */
export const SerializeMachine = serialize.Machine;

/**
 * The definition of the sync client whose writes run under `cancel`.
 */
export const Cancel = cancel.Client;

/**
 * The sync client whose writes run under `cancel`.
 */
export const CancelMachine = cancel.Machine;
