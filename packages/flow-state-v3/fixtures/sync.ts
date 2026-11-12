import { Schema } from "effect";
import { definition, deny, Flow, machine, transaction } from "../src/index.ts";
import { numberOf, part, Server, type ServerFailure, type ServerModel, served } from "./part.ts";

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

const Sync = definition({
  id: "Git/Sync",
  persist: false,
  states: ["READY", "COOLING"],
  events: { SyncRepo: { repo: Schema.String }, Pushed: { repo: Schema.String } },
  internalEvents: {
    Synced: {},
    Limited: { retryAfterMs: Schema.Number },
    Unsure: Flow.uncertain({}),
    NotSent: { why: Schema.String },
    Cool: {},
  },
  memory: {
    waitMs: Flow.initial(Schema.Number, 0),
    strikes: Flow.initial(Schema.Number, 0),
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
 * for the server's `Retry-After`, and giving up after five strikes; a webhook storm stands for
 * admission (`ad`), round-14's code.
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
  server: { sync: syncServer },
});
