// Converted Pay with what round 1 flattened away: its real summary trait (order-summary.trait.ts), its 3-D Secure subroutine
// (three-ds.subroutine.ts) with the nested resumable Countdown (countdown.trait.ts), and `authenticate`. pay.machine.ts
// otherwise: the base fixture is reused, bugs and all (D36). Differences, each a stated gap: `reserveShipping` is `latest`,
// not `cancel` (round 5); no ADDRESS; `activities` absent (round 4); PayRequested stays beside PayPressed so old scripts read
// the same machine, and is what `onPay` fills.
import { Effect } from "effect";
import type { Fixture } from "../harness.ts";
import type { Api } from "../fake-world.ts";
import { deny, type Fragment, type Node, type Op } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";
import { payFixture } from "./pay.compiled.ts";

const D = "Checkout/Pay";
const f = fixtureOf(D);
const three = fixtureOf("ThreeDS");
const cd = fixtureOf("Countdown");
const sum = fixtureOf("OrderSummary");

export const LENGTH_MS = 5 * 60_000;
const Countdown: Fragment = {
  id: "Countdown",
  root: "root",
  default: "root",
  nodes: {
    root: {
      id: "root",
      on: cd.on("", {
        Shown: [{}],
        Expired: [{ notify: [{ name: "onExpired" }] }],
      }),
      schedules: [
        {
          id: "expire",
          send: "Expired",
          schedule: { ms: LENGTH_MS },
          armOn: ["Shown"],
          disarmOn: [],
        },
      ],
    },
  },
  memory: { initial: cd.slot("memory.initial", () => ({})) },
};
const ThreeDS: Fragment = {
  id: "ThreeDS",
  root: "root",
  default: "OPEN",
  nodes: {
    root: {
      id: "root",
      on: three.on("", {
        Answered: [
          {
            exit: {
              name: "Passed",
              from: three.slot("on.Answered.exit", ({ event }: any) => ({ authId: event.authId })),
            },
          },
        ],
        Failed: [
          {
            exit: {
              name: "Declined",
              from: three.slot("on.Failed.exit", ({ event }: any) => ({ code: event.code })),
            },
          },
        ],
      }),
      schedules: [],
    },
    OPEN: {
      id: "OPEN",
      parent: "root",
      default: "BANK",
      on: three.on("states.OPEN", {
        Help: [
          { target: "HELP", patch: ({ memory }: any) => ({ helpOpened: memory.helpOpened + 1 }) },
        ],
      }),
      schedules: [],
      placements: [
        {
          name: "countdown",
          fragment: "Countdown",
          resumable: true,
          callbacks: {
            onExpired: three.alts("states.OPEN.traits.countdown.callbacks.onExpired", [
              { target: "EXPIRED" },
            ]),
          },
        },
      ],
    },
    BANK: {
      id: "BANK",
      parent: "OPEN",
      on: three.on("states.OPEN.states.BANK", {
        BankShown: [{ raises: [{ to: "countdown", event: "Shown" }] }],
      }),
      schedules: [],
    },
    EXPIRED: {
      id: "EXPIRED",
      parent: "OPEN",
      on: three.on("states.OPEN.states.EXPIRED", { GiveUp: [{ exit: { name: "TimedOut" } }] }),
      schedules: [
        { id: "leave", send: "GiveUp", schedule: { ms: 2000 }, armOn: ["entry"], disarmOn: [] },
      ],
    },
    HELP: {
      id: "HELP",
      parent: "root",
      on: three.on("states.HELP", { CloseHelp: [{ target: "OPEN", history: true }] }),
      schedules: [],
    },
  },
  memory: {
    initial: three.slot("memory.initial", (i: any) => ({ intentId: i.intentId, helpOpened: 0 })),
  },
};
const OrderSummary: Fragment = {
  id: "OrderSummary",
  root: "root",
  default: "root",
  nodes: {
    root: {
      id: "root",
      on: sum.on("", {
        Quote: [
          {
            patch: () => ({ shipping: null, problem: null }),
            members: sum.commit("shipping", ({ memory, event }: any) => ({
              cartId: memory.cartId,
              postcode: event.postcode,
            })),
          },
        ],
        Quoted: [{ patch: ({ event }: any) => ({ shipping: event.slot }) }],
        NotDeliverable: [
          { patch: ({ event }: any) => ({ problem: `We don't deliver to ${event.postcode}` }) },
        ],
        QuoteFailed: [{ patch: () => ({ problem: "Couldn't get delivery options" }) }],
        QuoteUnsure: [{ members: sum.member("shipping", "cancel") }],
        PayPressed: [
          {
            tokens: [{ port: "mayPay" }],
            guards: [({ memory }: any) => memory.shipping !== null || deny("NoDelivery")],
            notify: [
              {
                name: "onPay",
                from: sum.slot("on.PayPressed.notify", ({ memory, event }: any) => ({
                  paymentMethodId: event.paymentMethodId,
                  shippingSlotId: memory.shipping?.slotId ?? "",
                })),
              },
            ],
          },
        ],
      }),
      schedules: [],
    },
  },
  memory: {
    initial: sum.slot("memory.initial", (i: any) => ({
      cartId: i.cartId,
      shipping: null,
      problem: null,
    })),
  },
};

const cart = ({ memory }: any) => ({ cartId: memory.cartId, intentId: memory.intentId });
const intent = ({ memory }: any) => ({ intentId: memory.intentId });
const withCard = ({ memory, event }: any) => ({
  intentId: memory.intentId,
  paymentMethodId: event.paymentMethodId,
});
const place = (p: string, i = 0) => [
  { op: "place", verb: "commit" as const, input: f.slot(`${p}.actions[${i}]`, cart) },
];

const make = (api: Api) => {
  const c = payFixture.make(api);
  const baseNodes = c.nodes;
  const root = baseNodes["root"]!;
  const startAlts = (base: string) =>
    f
      .alts(base, [
        {
          target: "CARD",
          tokens: [{ op: "shipping", verb: "idle" }],
          patch: ({ event }: any) => ({
            cartId: event.cartId,
            intentId: event.intentId,
            address: {
              name: "Ada Lovelace",
              line1: "12 Canal St",
              postcode: "N1 9GU",
              email: "ada@example.com",
            },
            receipt: null,
            authorized: false,
            afterUnsure: false,
            busyTries: 0,
            notice: "",
          }),
          raises: [] as never,
        },
      ])
      .map((a) => ({
        ...a,
        raises: [
          {
            to: "summary",
            event: "Quote",
            from: f.slot(`${base}[0].raise[0]`, () => ({ postcode: "N1 9GU" })),
          },
        ],
      }));
  const onPay = f.alts("traits.summary.callbacks.onPay", [
    { tokens: [{ node: "PAYING" }], members: f.commit("pay", withCard) },
    {
      target: "PAYING",
      patch: ({ event }: any) => ({ paymentMethodId: event.paymentMethodId, notice: "" }),
      members: f.commit("pay", withCard),
    },
  ]);
  const placement = {
    name: "summary",
    fragment: "OrderSummary",
    input: f.slot("traits.summary.input", ({ memory }: any) => ({ cartId: memory.cartId })),
    resetOn: f.slot("traits.summary.resetOn", ({ memory }: any) => memory.cartId),
    guards: {
      mayPay: f.slot(
        "traits.summary.guards.mayPay",
        ({ memory }: any) => memory.totalCents <= 50_000 || deny("GuestLimit"),
      ),
    },
    callbacks: { onPay },
  };
  const challenge = {
    name: "CHALLENGE",
    fragment: "ThreeDS",
    input: f.slot("states.CHALLENGE.input", intent),
    exits: {
      Passed: f.alts("states.CHALLENGE.exits.Passed", [
        { target: "PLACING", patch: () => ({ authorized: true }), members: (p) => place(p) },
      ]),
      Declined: f.alts("states.CHALLENGE.exits.Declined", [
        {
          target: "CARD",
          patch: ({ event }: any) => ({ notice: `Your bank declined the check (${event.code}).` }),
        },
      ]),
      TimedOut: f.alts("states.CHALLENGE.exits.TimedOut", [
        {
          target: "CARD",
          patch: () => ({ notice: "The bank's check timed out. You can pay again." }),
        },
      ]),
    },
  };
  const toChallenge = {
    target: "CHALLENGE",
    guards: [({ event }: any) => event.status === "requires_action" || deny("NoChallenge")],
    patch: ({ event }: any) => ({ clientSecret: event.clientSecret }),
    members: f.commit("authenticate", ({ memory, event }: any) => ({
      intentId: memory.intentId,
      clientSecret: event.clientSecret,
    })),
  };
  const nodes: Record<string, Node> = {
    ...baseNodes,
    root: {
      ...root,
      placements: [placement],
      on: {
        ...root.on,
        ...f.on("", {
          Quoted: [{}],
          Authenticated: [
            {
              target: "PLACING",
              tokens: [{ node: "CARD" }],
              patch: () => ({ authorized: true, notice: "" }),
              members: (p) => place(p),
            },
            {
              tokens: [{ node: "LEFT" }],
              patch: () => ({ authorized: true }),
              members: f.commit("void", intent),
            },
            { patch: () => ({ authorized: true }) },
          ],
          AuthFailed: [{}],
          AuthUnsure: [{ members: f.member("authenticate", "cancel", intent) }],
        }),
      },
    },
    IDLE: {
      ...baseNodes["IDLE"]!,
      on: { ...baseNodes["IDLE"]!.on, Start: startAlts("states.IDLE.on.Start") },
    },
    PAID: {
      ...baseNodes["PAID"]!,
      on: { ...baseNodes["PAID"]!.on, Start: startAlts("states.PAID.on.Start") },
    },
    LEFT: {
      ...baseNodes["LEFT"]!,
      on: { ...baseNodes["LEFT"]!.on, Start: startAlts("states.LEFT.on.Start") },
    },
    PAYING: {
      ...baseNodes["PAYING"]!,
      on: {
        ...baseNodes["PAYING"]!.on,
        Confirmed: [
          ...f.alts("states.PAYING.on.Confirmed", [toChallenge]),
          ...baseNodes["PAYING"]!.on["Confirmed"]!,
        ],
      },
    },
    CHALLENGE: {
      id: "CHALLENGE",
      parent: "root",
      subroutine: challenge,
      schedules: [],
      on: f.on("states.CHALLENGE", {
        Authenticated: [
          {
            raises: [
              {
                to: "CHALLENGE",
                event: "Answered",
                from: f.slot("states.CHALLENGE.on.Authenticated.raise", ({ event }: any) => ({
                  authId: event.authId,
                })),
              },
            ],
          },
        ],
        AuthFailed: [
          {
            raises: [
              {
                to: "CHALLENGE",
                event: "Failed",
                from: f.slot("states.CHALLENGE.on.AuthFailed.raise", ({ event }: any) => ({
                  code: event.code,
                })),
              },
            ],
          },
        ],
      }),
    },
  };
  const ops: Record<string, Op> = {
    ...c.ops,
    shipping: {
      id: "shipping",
      contract: "Checkout/reserve-shipping",
      kind: "write",
      fragment: "OrderSummary",
      key: f.slot("operations.shipping.key", (i: any) => ({ cartId: i.cartId })),
      concurrency: "latest",
      commit: (input, { attempt }) =>
        api
          .call("shipping", input, { idempotencyKey: attempt.id })
          .pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: f.mapped("shipping", "success", "Quoted", (slot) => ({ slot })),
        failure: {
          NotDeliverable: f.mapped("shipping", "failure.NotDeliverable", "NotDeliverable", (e) => ({
            postcode: e.postcode,
          })),
          NotSent: { event: "QuoteFailed" },
        },
        unknown: { event: "QuoteUnsure" },
      },
    },
    authenticate: {
      id: "authenticate",
      contract: "Checkout/authenticate",
      kind: "write",
      key: f.slot("operations.authenticate.key", (i: any) => ({ intentId: i.intentId })),
      concurrency: "reject",
      commit: (input, { attempt }) =>
        api
          .call("authenticate", input, { idempotencyKey: attempt.id })
          .pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: f.mapped("authenticate", "success", "Authenticated", (v) => ({
          authId: v.intentId,
        })),
        failure: {
          ChallengeFailed: f.mapped(
            "authenticate",
            "failure.ChallengeFailed",
            "AuthFailed",
            (e) => ({ code: e.code }),
          ),
          NotSent: f.mapped("authenticate", "failure.NotSent", "AuthFailed", () => ({
            code: "not_sent",
          })),
        },
        unknown: { event: "AuthUnsure" },
      },
    },
  };
  return { ...c, nodes, ops, fragments: { Countdown, ThreeDS, OrderSummary } };
};
export const payFullFixture: Fixture = { ...payFixture, make };
