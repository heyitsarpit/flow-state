import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import type { RateLimited } from "../../services/git/services.ts";
import { remoteHead } from "../../services/git/operations/reads.ts";
import { sync } from "../../services/git/operations/writes.ts";

const MAX_STRIKES = 5;

export const Sync = definition({
  id: "Git/Sync",
  persist: false,
  states: ["READY", "COOLING"],
  events: {
    SyncRepo: { repo: Schema.String },
    Pushed: { repo: Schema.String },
    Peek: { repo: Schema.String },
  },
  internalEvents: {
    Synced: {},
    Limited: { retryAfterMs: Schema.Number },
    Unsure: Flow.uncertain({}),
    NotSent: { why: Schema.String },
    Cool: {},
    Remote: { head: Schema.String },
    RemoteFailed: {},
  },
  memory: {
    waitMs: Flow.initial(Schema.Number, 0),
    strikes: Flow.initial(Schema.Number, 0),
    head: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    sync: sync.outcomes({
      success: E.Synced,
      failure: {
        RateLimited: E.Limited.from((e: RateLimited) => ({ retryAfterMs: e.retryAfterMs })),
      },
      notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
    remote: remoteHead.outcomes({
      success: E.Remote.from((v: { readonly head: string }) => ({ head: v.head })),
      failure: {
        NoResponse: E.RemoteFailed,
        Defect: E.RemoteFailed,
        Interrupted: E.RemoteFailed,
      },
    }),
  }),
});

const byRepo = ({ event }: { readonly event: { readonly repo: string } }) => ({ repo: event.repo });

/**
 * A rate-limited sync client: one sync per repository at a time, a cooldown for the host's
 * `Retry-After`, and giving up after five strikes; a peek reads the remote head; a webhook storm
 * sends many pushes at once. A local actor, never persisted.
 */
export const SyncMachine = machine(Sync, ({ S, E, O }) => {
  const synced = [{ guard: [O.sync.idle(byRepo)], actions: [O.sync.commit(byRepo)] }, {}];

  return {
    default: S.READY,
    on: {
      Synced: { updateMemory: () => ({ strikes: 0 }) },
      Unsure: {},
      NotSent: {},
      Peek: { actions: [O.remote.lookup(byRepo)] },
      Remote: { updateMemory: ({ event }) => ({ head: event.head }) },
      RemoteFailed: {},
      Limited: [
        {
          target: S.COOLING,
          guard: [({ memory }) => memory.strikes < MAX_STRIKES || deny("GiveUp")],
          updateMemory: ({ memory, event }) => ({
            strikes: memory.strikes + 1,
            waitMs: event.retryAfterMs,
          }),
        },
        { target: S.READY },
      ],
    },
    states: {
      READY: { on: { SyncRepo: synced, Pushed: synced } },
      COOLING: {
        schedules: { cool: { schedule: ({ memory }) => memory.waitMs, send: E.Cool } },
        on: { Cool: { target: S.READY }, SyncRepo: {}, Pushed: {} },
      },
    },
  };
});
