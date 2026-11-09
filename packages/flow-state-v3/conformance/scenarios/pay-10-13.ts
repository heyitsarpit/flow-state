import { Effect, Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { Case, type Scenario, variants } from "../dsl/case.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

type Shopper = Actor<typeof Pay>;

const shopper = Case.useSync((c) => ({ c, shopper: c.actor(Pay, "shopper-1") }));
const cells = Case.useSync((c) => ({ c, shopper: c.actor(Cells, "shopper-1") }));

const pay = (s: Shopper) => s.send("PayRequested", { paymentMethodId: "visa" });
const start = (s: Shopper) => s.send("Start", CART);

const row = (s: Shopper) => Effect.map(s.row("pay", KEY), Option.getOrUndefined);

const lastReason = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.endings(operation), (endings) => endings.at(-1)?.reason);

const sent = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.requests(operation), (requests) => requests.length);

const onWire = Effect.gen(function* () {
  const { c, shopper: s } = yield* cells;
  yield* s.ensure;
  yield* start(s);
  yield* pay(s);
  yield* c.ack;
});

/**
 * The Pay cases `PAY-10` and `PAY-12`, ported from the prototype suite with the same steps and
 * expectations; the variants that need slot or module faults or the scheduler's shuffle are not
 * here, and `PAY-13` (Runtime disposal) is in `disposal.ts`.
 */
export const pay1013Scenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-10",
      cites: ["WriteAhead R13", "WriteLanes R3"],
      fixtures: [Pay],
    },
    {
      refuse: Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* s.ensure;
        yield* start(s);
        yield* pay(s);
        yield* c.answerStorage("refuse", Option.none());
        yield* c.eq("requests", yield* sent(c, "pay"), 0);
        yield* s.state("CARD");
        yield* c.eq("evidence", yield* c.evidence("StorageFailure"), 1);
      }),
      hang: Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* s.ensure;
        yield* start(s);
        yield* pay(s);
        yield* c.answerStorage("hang", Option.none());
        yield* c.advance(9999);
        yield* s.state("PAYING");
        yield* c.advance(1);
        yield* c.eq("requests", yield* sent(c, "pay"), 0);
        yield* s.state("PAYING");
        yield* c.eq("pending", (yield* row(s))?.pending, true);
        yield* c.eq("no refusal", yield* c.evidence("StorageFailure"), 0);
        yield* c.eq("evidence", yield* c.evidence("StorageSilent"), 1);
        yield* c.eq("notice", (yield* s.memory).notice, "Still confirming with your bank…");
      }),
    },
  ),
  ...variants(
    {
      id: "PAY-12",
      cites: ["WriteLanes R2", "WriteLanes R14", "WriteLanes R10"],
      fixtures: [Cells],
    },
    {
      defect: Effect.gen(function* () {
        const { c, shopper: s } = yield* cells;
        yield* onWire;
        yield* c.answer("pay", Answer.Die({ message: "boom" }));
        yield* s.state("UNSURE");
        yield* c.eq("reason", yield* lastReason(c, "pay"), "Defect");
        yield* c.eq("issue", yield* c.issues, ["Defect"]);
      }),
      sync: Effect.gen(function* () {
        const { c, shopper: s } = yield* cells;
        yield* s.ensure;
        yield* c.answerAtOnce("pay", CAPTURABLE);
        yield* start(s);
        yield* pay(s);
        yield* c.ack;
        yield* s.state("PLACING");
        yield* c.eq("endings", (yield* c.endings("pay")).length, 1);
      }),
      "cancel-on-wire": Effect.gen(function* () {
        const { c, shopper: s } = yield* cells;
        yield* onWire;
        yield* s.send("AbortPay", {});
        yield* s.state("UNSURE");
        yield* c.eq("reason", yield* lastReason(c, "pay"), "Cancelled");
        yield* c.eq("uncertain", (yield* row(s))?.uncertain, true);
      }),
    },
  ),
];
