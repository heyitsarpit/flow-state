// A COPY of Pay's fixture with convergence-2's P1-P5 fixes applied, so the search can say whether they are enough. The
// converted machine is untouched and the suite's Pay is pinned. Proposed, nothing here is decided.
import type { Fixture } from "../harness.ts";
import { deny, type Compiled } from "./compiled.ts";
import { payFixture } from "./pay.compiled.ts";
import { fixtureOf } from "./build.ts";

const { alts, slot } = fixtureOf("Checkout/Pay");
const intentKey = (path: string) =>
  slot(path, ({ memory }: any) => ({ intentId: memory.intentId }));
const voidHoldOf = (intent: (a: any) => string) => (p: string) =>
  [
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
        guards: [capturable, ({ memory, event }) => event.intentId !== memory.intentId || deny("Mine")],
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
        patch: ({ event, memory }) => (event.intentId === memory.intentId ? { authorized: true } : {}),
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
        guards: [({ memory }) => (memory.authorized && memory.receipt === null) || deny("NothingHeld")],
        members: voidHoldOf(({ memory }) => memory.intentId),
      },
      { target: "LEFT", guards: [({ memory }) => !memory.authorized || deny("OrderOnTheWire")] },
    ]);
    // P2: a late Placed records the receipt without moving; the current one moves.
    const placed = alts("on.Placed", [
      {
        target: "PAID",
        tokens: [{ node: "PLACING" }],
        patch: root.on["Placed"]![0]!.patch ? (a) => root.on["Placed"]![0]!.patch!.run(a) : undefined,
      },
      {
        patch: ({ memory, event }) => ({
          receipt: {
            orderId: event.orderId,
            afterUnsure: memory.afterUnsure,
            alreadyPlaced: event.alreadyPlaced,
          },
          authorized: false,
        }),
      },
    ] as never);
    // P4, P5: pressing Pay needs an idle lane; a held charge is reconciled in UNSURE instead.
    const pressPay = alts("on.PayRequested", [
      root.on["PayRequested"]![0] as never,
      {
        target: "PAYING",
        tokens: [{ op: "pay", verb: "idle", key: intentKey("on.PayRequested[1].guard[0]") }],
        patch: ({ event }) => ({ paymentMethodId: event.paymentMethodId, notice: "" }),
        members: root.on["PayRequested"]![1]!.members ? () => root.on["PayRequested"]![1]!.members : undefined,
      },
      {
        target: "UNSURE",
        tokens: [{ op: "pay", verb: "retryable", key: intentKey("on.PayRequested[2].guard[0]") }],
      },
    ] as never);
    const pressPayFixed = [root.on["PayRequested"]![0]!, pressPay[1]!, pressPay[2]!];
    return {
      ...c,
      ops: { ...c.ops, pay: carry(c.ops["pay"]!) },
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
          },
        },
        PAYING: { ...paying },
      },
    };
  },
};
