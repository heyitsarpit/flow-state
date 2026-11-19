import { Schema } from "effect";
import { actorRef, definition, Flow, machine, send } from "../../src/index.ts";

const Account = definition({
  id: "types/Account",
  states: ["OPEN"],
  events: { Credit: { cents: Schema.Number }, Freeze: {} },
  internalEvents: { Settled: {} },
  memory: { accountId: Flow.input(Schema.String), cents: Flow.initial(Schema.Number, 0) },
});

const AccountMachine = machine(Account, ({ S }) => ({ default: S.OPEN }));

const Other = definition({
  id: "types/Other",
  states: ["IDLE"],
  events: { Credit: { cents: Schema.String } },
});

const Payer = definition({
  id: "types/Payer",
  states: ["READY"],
  events: { Pay: { payee: Schema.String, cents: Schema.Number } },
  memory: { paid: Flow.initial(Schema.Number, 0) },
});

const payee = ({ event }: { readonly event: { readonly payee: string } }) =>
  actorRef(AccountMachine, { accountId: event.payee });

// Each form a send takes: the target's token mapped from the turn's input, a constant, a callback.
void machine(Payer, ({ S }) => ({
  default: S.READY,
  on: {
    Pay: {
      actions: [
        send(
          payee,
          Account.E.Credit.from(({ event }) => ({ cents: event.cents })),
        ),
        send(payee, Account.E.Freeze()),
        send(payee, ({ memory }) => Account.E.Credit({ cents: memory.paid })),
      ],
    },
  },
}));

// The mapping reads only the sender's memory and event, and computes the target's payload.
void machine(Payer, ({ S }) => ({
  default: S.READY,
  on: {
    Pay: {
      actions: [
        send(
          payee,
          // @ts-expect-error -- the sender's event has no field `amount`
          Account.E.Credit.from(({ event }) => ({ cents: event.amount })),
        ),
        send(
          payee,
          // @ts-expect-error -- Credit's cents is a number
          Account.E.Credit.from(({ event }) => ({ cents: event.payee })),
        ),
      ],
    },
  },
}));

// Only the target's own public events: an internal event or another definition's token is refused.
void machine(Payer, ({ S }) => ({
  default: S.READY,
  on: {
    Pay: {
      actions: [
        // @ts-expect-error -- Settled is internal to Account
        send(payee, Account.E.Settled()),
        send(
          payee,
          // @ts-expect-error -- Other's Credit is not an event of Account
          Other.E.Credit.from(({ event }) => ({ cents: event.payee })),
        ),
        // @ts-expect-error -- a callback must return one of Account's public events
        send(payee, () => ({ _tag: "Settled" })), // oxlint-disable-line flow-state/no-raw-event -- the type error is the test
      ],
    },
  },
}));
