import { Schema } from "effect";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { BankLive } from "./bank-http.ts";
import { type Declined, transfer } from "./contracts.ts";

const Transfers = definition({
  id: "Bank/Transfers",
  persist: true,
  states: ["READY"],
  events: {
    Send: { transferId: Schema.String, cents: Schema.Number },
    Resend: { transferId: Schema.String },
    Abandon: { transferId: Schema.String },
  },
  internalEvents: {
    Done: { receipt: Schema.String },
    Declined: { code: Schema.String },
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
    Nudge: {},
  },
  memory: { notice: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    transfer: transfer.outcomes({
      success: E.Done.from((v: { readonly receipt: string }) => ({ receipt: v.receipt })),
      failure: {
        Declined: E.Declined.from((e: Declined) => ({ code: e.code })),
        NotSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      },
      unknown: E.Unsure,
    }),
  }),
});

const byTransfer = ({ event }: { readonly event: { readonly transferId: string } }) => ({
  transferId: event.transferId,
});

/**
 * One bank account: each transfer is its own keyed write; an unknown one waits for the user to
 * resend it once; a nudge fires 20 seconds after a send.
 */
export const TransfersMachine = machine(Transfers, ({ S, E, O }) => ({
  default: S.READY,
  on: {
    Done: { updateMemory: ({ event }) => ({ notice: `sent ${event.receipt}` }) },
    Declined: { updateMemory: ({ event }) => ({ notice: `declined ${event.code}` }) },
    NotSent: { updateMemory: ({ event }) => ({ notice: `not sent ${event.why}` }) },
    Unsure: { updateMemory: () => ({ notice: "check your statement" }) },
    Nudge: { updateMemory: ({ memory }) => ({ notice: `${memory.notice}, nudged` }) },
  },
  states: {
    READY: {
      on: {
        Send: { actions: [O.transfer.commit(({ event }) => event)] },
        Resend: [
          {
            guard: [O.transfer.retryable(byTransfer, { times: 1 })],
            actions: [O.transfer.retry(byTransfer)],
          },
          {},
        ],
        Abandon: { actions: [O.transfer.cancel(byTransfer)] },
      },
      schedules: { nudge: { schedule: "20 seconds", send: E.Nudge, armOn: ["Send"] } },
    },
  },
}));

/**
 * The bank app: one machine.
 */
export const bank = app({ id: "bank", machines: { transfers: TransfersMachine } });

/**
 * The bank app's real setup: the bank over HTTP, persisted, each capture written at once. A Story
 * never builds its services.
 */
export const bankSetup = runtimeSetup({
  app: bank,
  services: BankLive("https://bank.example"),
  scope: "bank",
  persistence: { captureMs: 0 },
});

/**
 * The account most stories use.
 */
export const account = actorRef(TransfersMachine, "acct-1");

/**
 * A second account of the same machine.
 */
export const savings = actorRef(TransfersMachine, "acct-2");
