// A COPY of Pay's fixture with convergence-2's P1-P5 fixes applied, plus what convergence-3 promised and round 2's file did not
// have: P5's half, P6, `Start` idle on every operation that holds money (rule 56's default guard), and a void a reload took is
// sent again rather than called released. The converted machine is untouched and the suite's Pay is pinned. Proposed.
import type { Fixture } from "../harness.ts";
import { deny, type Compiled } from "./compiled.ts";
import { payFixture } from "./pay.compiled.ts";
import { fixtureOf } from "./build.ts";

const { alts, slot } = fixtureOf("Checkout/Pay");
const intentKey = (path: string) =>
  slot(path, ({ memory }: any) => ({ intentId: memory.intentId }));
const voidHoldOf = (intent: (a: any) => string) => (p: string) => [
  {
    op: "void",
    verb: "commit" as const,
    input: slot(`${p}.actions[0]`, (a: any) => ({ intentId: intent(a) })),
  },
];
const capturable = ({ event }: any) =>
  event.status === "requires_capture" || event.status === "succeeded" || deny("NotAuthorized");

export const payFixedFixture: Fixture = {
  ...payFixture,
  make: (api) => {
    const c = payFixture.make(api);
    const root = c.nodes["root"]!;
    const paying = c.nodes["PAYING"]!;
    const carry = (o: Compiled["ops"][string]) =>
      // P3: Confirmed names its intent, so a late one voids what it names.
      ({
        ...o,
        outcomes: {
          ...o.outcomes,
          success: {
            event: "Confirmed",
            from: slot("operations.pay.success", (v: any, x: any) => ({
              status: v.status,
              clientSecret: v.clientSecret,
              afterUnsure: v.afterUnsure,
              intentId: x.key.intentId,
            })),
          },
        },
      });
    const lateConfirmedVoids = alts("on.Confirmed", [
      {
        guards: [
          capturable,
          ({ memory, event }) => event.intentId !== memory.intentId || deny("Mine"),
        ],
        members: voidHoldOf(({ event }) => event.intentId),
      },
      {
        tokens: [{ node: "LEFT" }],
        guards: [capturable],
        patch: () => ({ authorized: true }),
        members: voidHoldOf(({ memory }) => memory.intentId),
      },
      {
        target: "PLACING",
        tokens: [{ node: "IDLE" }],
        guards: [capturable],
        patch: () => ({ authorized: true }),
        members: (p) => [
          {
            op: "place",
            verb: "commit",
            input: slot(`${p}.actions[0]`, ({ memory }: any) => ({
              cartId: memory.cartId,
              intentId: memory.intentId,
            })),
          },
        ],
      },
      {
        // Same intent, a new PAYING pressed behind it: resolve by placing is rule 15's call; record the authorization.
        patch: ({ event, memory }) =>
          event.intentId === memory.intentId ? { authorized: true } : {},
      },
    ]);
    // P1: Leave never voids while the order is on the wire or held.
    const placeIdle = (p: string) => ({
      op: "place",
      verb: "idle" as const,
      key: slot(p, ({ memory }: any) => ({ cartId: memory.cartId })),
    });
    const leave = alts("on.Leave", [
      {
        target: "LEFT",
        tokens: [placeIdle("on.Leave[0].guard[0]")],
        guards: [
          ({ memory }) => (memory.authorized && memory.receipt === null) || deny("NothingHeld"),
        ],
        members: voidHoldOf(({ memory }) => memory.intentId),
      },
      { target: "LEFT", guards: [({ memory }) => !memory.authorized || deny("OrderOnTheWire")] },
    ]);
    // P2: a late Placed records the receipt without moving; the current one moves.
    const receipt = root.on["Placed"]![0]!.patch!;
    const placed = alts("on.Placed", [
      { target: "PAID", tokens: [{ node: "PLACING" }], patch: (x) => receipt.run(x) },
      { patch: (x) => receipt.run(x) },
    ]);
    // P4, P5: pressing Pay needs an idle lane; a held charge is reconciled in UNSURE instead.
    const pressPay = alts("on.PayRequested", [
      {},
      {
        target: "PAYING",
        tokens: [
          { node: "CARD" },
          { op: "pay", verb: "idle", key: intentKey("on.PayRequested[1].guard[0]") },
        ],
        patch: ({ event }) => ({ paymentMethodId: event.paymentMethodId, notice: "" }),
        members: () => root.on["PayRequested"]![1]!.members,
      },
    ]);
    // P6: a press with an authorization already in hand is not a new charge.
    const notAuthorized = ({ memory }: any) => !memory.authorized || deny("AlreadyAuthorized");
    const pressPayFixed = [
      root.on["PayRequested"]![0]!,
      { ...pressPay[1]!, guards: [...pressPay[1]!.guards, slot("on.PayRequested[1].guard[1]", notAuthorized)] },
    ];
    // Rule 56's default guard, which the real `start` has only for the shipping quote: one token per operation that holds money.
    const startGuarded = c.nodes["IDLE"]!.on["Start"]!.map((a) => ({
      ...a,
      tokens: [
        { op: "pay", verb: "idle" as const },
        { op: "void", verb: "idle" as const },
        { op: "place", verb: "idle" as const },
      ],
    }));
    const withStart = (n: string) => ({
      ...c.nodes[n]!,
      on: { ...c.nodes[n]!.on, Start: startGuarded },
    });
    // P5's half: CARD handles a hold a reload restored, by reconciling it, instead of leaving it with no owner.
    const unsure = root.on["PayUnsure"]!;
    // The root of what SEARCH-PAY reports: a void lost by a reload is not "released". It goes again.
    const voidNotSent = alts("on.VoidNotSent", [
      {
        guards: [({ event }) => event.why === "Restored" || deny("NotRestored")],
        members: voidHoldOf(({ event }) => event.intentId),
      },
      { patch: () => ({ notice: "We couldn't release the hold on your card. Please contact us." }) },
    ]);
    const voidOp = c.ops["void"]!;
    return {
      ...c,
      ops: {
        ...c.ops,
        pay: carry(c.ops["pay"]!),
        void: {
          ...voidOp,
          outcomes: {
            ...voidOp.outcomes,
            failure: {
              ...voidOp.outcomes.failure,
              NotSent: {
                event: "VoidNotSent",
                from: slot("operations.void.failure.NotSent", (e: any, x: any) => ({
                  why: e.why,
                  intentId: x.input.intentId,
                })),
              },
            },
          },
        },
      },
      nodes: {
        ...c.nodes,
        root: {
          ...root,
          on: {
            ...root.on,
            Confirmed: lateConfirmedVoids,
            Leave: leave,
            Placed: placed,
            PayRequested: pressPayFixed,
            PayUnsure: unsure,
            VoidNotSent: voidNotSent,
          },
        },
        PAYING: { ...paying },
        IDLE: withStart("IDLE"),
        PAID: withStart("PAID"),
        LEFT: withStart("LEFT"),
      },
    };
  },
};
