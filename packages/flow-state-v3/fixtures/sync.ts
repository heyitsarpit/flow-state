import { Schema } from "effect";
import { definition, deny, Flow, machine, resource, transaction } from "../src/index.ts";
import {
  lookedUp,
  numberOf,
  part,
  Server,
  type ServerFailure,
  type ServerModel,
  served,
  textOf,
} from "./part.ts";

const MAX_STRIKES = 5;

const syncServer = {
  answers: [
    { weight: 5, answer: { _tag: "ok", value: {} } },
    { weight: 2, answer: { _tag: "fail", tag: "RateLimited", fields: { retryAfterMs: 2000 } } },
    { weight: 1, answer: { _tag: "fail", tag: "RateLimited", fields: { retryAfterMs: 9000 } } },
  ],
  classify: () => false,
} as const satisfies ServerModel;

const sync = transaction({
  id: "Git/sync",
  input: { repo: Schema.String },
  key: ["repo"],
  concurrency: "reject",
  services: [Server],
  commit: served("sync", syncServer),
});

const remoteServer = {
  answers: [
    { weight: 4, answer: { _tag: "ok", value: { head: "a1b2c3" } } },
    { weight: 1, answer: { _tag: "fail", tag: "ServerError", fields: {} } },
  ],
  classify: () => false,
} as const satisfies ServerModel;

const remoteHead = resource({
  id: "Git/remote-head",
  input: { repo: Schema.String },
  key: ["repo"],
  services: [Server],
  staleTime: 0,
  gcTime: 0,
  lookup: lookedUp("remote"),
});

const Sync = definition({
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
        RateLimited: E.Limited.from((e: ServerFailure) => ({
          retryAfterMs: numberOf(e, "retryAfterMs", 1000),
        })),
        NotSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      },
      unknown: E.Unsure,
    }),
    remote: remoteHead.outcomes({
      success: E.Remote.from((v: Schema.Json) => ({ head: textOf(v, "head") })),
      failure: {
        NoResponse: E.RemoteFailed,
        ServerError: E.RemoteFailed,
        Defect: E.RemoteFailed,
        Interrupted: E.RemoteFailed,
      },
    }),
  }),
});

const byRepo = ({ event }: { readonly event: { readonly repo: string } }) => ({ repo: event.repo });

const SyncMachine = machine(Sync, ({ S, E, O }) => {
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
      READY: {
        on: {
          SyncRepo: synced,
          Pushed: synced,
        },
      },
      COOLING: {
        schedules: { cool: { schedule: ({ memory }) => memory.waitMs, send: E.Cool } },
        on: { Cool: { target: S.READY }, SyncRepo: {}, Pushed: {} },
      },
    },
  };
});

const repos = [{ repo: "flow" }, { repo: "effect" }, { repo: "docs" }, { repo: "site" }];

/**
 * S10 rate-limited sync client (fixture catalogue): one sync per repository at a time, a cooldown
 * for the server's `Retry-After`, and giving up after five strikes; a peek reads the remote head
 * (`lk`); a webhook storm stands for admission (`ad`).
 */
export const syncClient = part({
  name: "sync",
  sketch: "S10",
  composite: "I",
  machine: SyncMachine,
  actors: ["client"],
  user: {
    READY: [
      {
        kind: "send",
        name: "sync",
        codes: ["rj", "ky", "gd"],
        weight: 6,
        thinkMs: 500,
        event: "SyncRepo",
        payloads: repos,
        burst: 1,
      },
      {
        kind: "send",
        name: "webhook-storm",
        codes: ["ad"],
        weight: 1,
        thinkMs: 0,
        event: "Pushed",
        payloads: repos,
        burst: 64,
      },
      {
        kind: "send",
        name: "peek",
        codes: ["lk"],
        weight: 2,
        thinkMs: 700,
        event: "Peek",
        payloads: repos,
        burst: 1,
      },
      { kind: "release", name: "leave", codes: ["gr"], weight: 1, thinkMs: 4000 },
    ],
    COOLING: [
      {
        kind: "send",
        name: "sync-cooling",
        codes: ["du"],
        weight: 3,
        thinkMs: 1500,
        event: "SyncRepo",
        payloads: repos,
        burst: 1,
      },
      { kind: "dispose", name: "close", codes: ["dp"], weight: 1, thinkMs: 3000 },
    ],
  },
  server: { sync: syncServer, remote: remoteServer },
});
