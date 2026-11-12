import { Schema } from "effect";
import { definition, deny, Flow, machine, transaction } from "../src/index.ts";
import { part, Server, type ServerFailure, type ServerModel, served, textOf } from "./part.ts";

const transferServer = {
  answers: [
    { weight: 6, answer: { _tag: "ok", value: {} } },
    { weight: 2, answer: { _tag: "fail", tag: "Declined", fields: { code: "insufficient" } } },
    { weight: 1, answer: { _tag: "fail", tag: "AlreadyDone", fields: {} } },
  ],
  classify: (tag, _fields, mayHaveApplied) => tag === "AlreadyDone" && mayHaveApplied,
} as const satisfies ServerModel;

const transfer = transaction({
  id: "Bank/transfer",
  input: { transferId: Schema.String, iban: Schema.String, cents: Schema.Number },
  key: ["transferId"],
  concurrency: "reject",
  services: [Server],
  commit: served("transfer", transferServer),
});

const Transfers = definition({
  id: "Bank/Transfers",
  persist: true,
  states: ["READY"],
  events: {
    Send: { transferId: Schema.String, iban: Schema.String, cents: Schema.Number },
    Resend: { transferId: Schema.String },
    Abandon: { transferId: Schema.String },
  },
  internalEvents: {
    Done: {},
    Declined: { code: Schema.String },
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: { notice: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    transfer: transfer.outcomes({
      success: E.Done,
      failure: {
        Declined: E.Declined.from((e: ServerFailure) => ({ code: textOf(e, "code") })),
        AlreadyDone: E.Declined.from(() => ({ code: "duplicate" })),
        NotSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      },
      unknown: E.Unsure,
    }),
  }),
});

const byTransfer = ({ event }: { readonly event: { readonly transferId: string } }) => ({
  transferId: event.transferId,
});

const TransfersMachine = machine(Transfers, ({ S, O }) => ({
  default: S.READY,
  on: {
    Send: {
      guard: [({ event }) => event.cents > 0 || deny("Zero")],
      actions: [O.transfer.commit(({ event }) => event)],
    },
    Resend: [
      {
        guard: [O.transfer.retryable(byTransfer, { times: 1 })],
        actions: [O.transfer.retry(byTransfer)],
      },
      {},
    ],
    Abandon: { actions: [O.transfer.cancel(byTransfer)] },
    Unsure: { updateMemory: () => ({ notice: "Check your statement before sending again." }) },
    NotSent: { updateMemory: ({ event }) => ({ notice: event.why }) },
    Done: { updateMemory: () => ({ notice: "" }) },
    Declined: { updateMemory: ({ event }) => ({ notice: `Declined (${event.code}).` }) },
  },
}));

const send = (transferId: string, cents: number) => ({
  transferId,
  iban: "DE89370400440532013000",
  cents,
});

/**
 * S16 money transfers (fixture catalogue): many transfers in flight on one account actor, each
 * keyed by its own id; the app never resends one on its own, so an unknown transfer waits for the
 * user. Two accounts drive two actors of one machine (F1).
 */
export const transfers = part({
  name: "transfers",
  sketch: "S16",
  composite: "C",
  machine: TransfersMachine,
  actors: ["acct-1", "acct-2"],
  user: {
    READY: [
      {
        kind: "send",
        name: "send",
        codes: ["rj", "ky", "wa"],
        weight: 6,
        thinkMs: 800,
        event: "Send",
        burst: 1,
        payloads: [send("t1", 500), send("t2", 1200), send("t3", 90)],
      },
      {
        kind: "send",
        name: "send-zero",
        codes: ["gd"],
        weight: 1,
        thinkMs: 400,
        event: "Send",
        burst: 1,
        payloads: [send("t4", 0)],
      },
      {
        kind: "send",
        name: "resend",
        codes: ["rt"],
        weight: 2,
        thinkMs: 3000,
        event: "Resend",
        burst: 1,
        payloads: [{ transferId: "t1" }, { transferId: "t2" }],
      },
      {
        kind: "send",
        name: "abandon",
        codes: ["cm"],
        weight: 1,
        thinkMs: 1500,
        event: "Abandon",
        burst: 1,
        payloads: [{ transferId: "t1" }, { transferId: "t3" }],
      },
      { kind: "release", name: "leave", codes: ["gr"], weight: 1, thinkMs: 2000 },
      { kind: "forget", name: "forget", codes: ["dp"], weight: 1, thinkMs: 2000 },
    ],
  },
  server: { transfer: transferServer },
});
