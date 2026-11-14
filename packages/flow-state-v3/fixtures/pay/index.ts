import { part, type UserAction } from "../part.ts";
import { intentServer, orderServer, payServer, placeServer, voidServer } from "./contracts.ts";
import { CellsMachine, PayMachine } from "./machine.ts";

const server = {
  pay: payServer,
  place: placeServer,
  void: voidServer,
  intent: intentServer,
  order: orderServer,
};

const start: UserAction = {
  kind: "send",
  name: "start",
  codes: ["ky"],
  weight: 3,
  thinkMs: 1000,
  event: "Start",
  burst: 1,
  payloads: [{ cartId: "c1", intentId: "pi1" }],
};

const choose: UserAction = {
  kind: "send",
  name: "choose-card",
  codes: ["wa"],
  weight: 1,
  thinkMs: 1500,
  event: "CardChosen",
  burst: 1,
  payloads: [{ paymentMethodId: "visa" }, { paymentMethodId: "amex" }],
};

const pay: UserAction = {
  kind: "send",
  name: "pay",
  codes: ["rj", "ky", "un", "gd"],
  weight: 5,
  thinkMs: 2000,
  event: "PayRequested",
  burst: 1,
  payloads: [{ paymentMethodId: "visa" }],
};

const doubleClick: UserAction = {
  ...pay,
  name: "double-click",
  codes: ["rj"],
  weight: 1,
  burst: 2,
};

const leave: UserAction = {
  kind: "send",
  name: "leave",
  codes: ["cm", "gd"],
  weight: 1,
  thinkMs: 3000,
  event: "Leave",
  burst: 1,
  payloads: [{}],
};

const close: UserAction = {
  kind: "release",
  name: "close",
  codes: ["gr"],
  weight: 1,
  thinkMs: 4000,
};

const reload: UserAction = {
  kind: "dispose",
  name: "reload",
  codes: ["dp", "rl"],
  weight: 1,
  thinkMs: 3000,
};

const waiting: ReadonlyArray<UserAction> = [leave, close, reload];

/**
 * The checkout's Pay (the reference app): one shopper pays a cart's intent, waits out an unknown
 * charge while the machine reads the intent and the order, and leaves, which voids a held
 * authorization. Its server models are the shop API's (`contracts.ts`), whose commits run their
 * `classify`.
 */
export const payPart = part({
  name: "pay",
  sketch: "Pay",
  composite: "A",
  machine: PayMachine,
  actors: ["shopper-1"],
  user: {
    IDLE: [start],
    CARD: [choose, pay, doubleClick, leave, close],
    PAYING: [doubleClick, ...waiting],
    WAITING: waiting,
    UNSURE: [pay, ...waiting],
    PLACING: waiting,
    PAID: [
      start,
      {
        kind: "send",
        name: "done",
        codes: ["gd"],
        weight: 1,
        thinkMs: 2000,
        event: "Done",
        burst: 1,
        payloads: [{}],
      },
    ],
    STUCK: [
      {
        kind: "send",
        name: "check-again",
        codes: ["lk"],
        weight: 2,
        thinkMs: 5000,
        event: "CheckAgain",
        burst: 1,
        payloads: [{}],
      },
      close,
    ],
    LEFT: [start, close],
  },
  server,
});

/**
 * Pay with `AbortPay`, which cancels the intent's `pay`: the suite's `cells` machine. It shares
 * Pay's machine id, so an app mix holds one of the two.
 */
export const cellsPart = part({
  ...payPart,
  name: "cells",
  machine: CellsMachine,
  user: {
    ...payPart.user,
    PAYING: [
      ...payPart.user.PAYING,
      {
        kind: "send",
        name: "abort",
        codes: ["cm"],
        weight: 2,
        thinkMs: 1500,
        event: "AbortPay",
        burst: 1,
        payloads: [{}],
      },
    ],
  },
});
