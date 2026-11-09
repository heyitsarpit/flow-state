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

const cellsShopper = Case.useSync((c) => ({ c, shopper: c.actor(Cells, "shopper-1") }));

const pay = (s: Shopper) => s.send("PayRequested", { paymentMethodId: "visa" });

const start = (s: Shopper) => s.send("Start", CART);

const onWire = Effect.gen(function* () {
  const { c, shopper: s } = yield* shopper;
  yield* s.ensure;
  yield* start(s);
  yield* pay(s);
  yield* c.ack;
});

const row = (s: Shopper) => Effect.map(s.row("pay", KEY), Option.getOrUndefined);

const lastReason = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.endings(operation), (endings) => endings.at(-1)?.reason);

const sent = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.requests(operation), (requests) => requests.length);

/**
 * The Pay cases that dispose the Runtime: `PAY-13`, `PAY-15/dispose-held` and the disposal
 * variants of `PAY-16`, with the prototype suite's steps.
 *
 * **Details**
 *
 * - The Port shows no abandoned fiber, stored lane or parked count; those assertions are not here.
 *   A parked ending shows as the ending the next boot delivers in its place (WriteAhead R14).
 * - `waiting-flushed` asserts the disposal ended once the pending write was answered (Actors R23:
 *   disposal waits for the final write), not at once as the prototype case did.
 * - `PAY-16/parked-success-is-delivered` is not here: it needs a yield fault the Port lacks.
 * - `PAY-15/dispose-held` runs on `cells`; the `PAY-16` variants on `pay`, whose steps do not use
 *   `cells`' `AbortPay`.
 */
export const disposalScenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-13",
      cites: ["Actors R22", "Actors R23", "Actors I29", "Actors I30", "WriteAhead R14"],
      fixtures: [Pay],
    },
    {
      "hung-commit": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* s.ensure;
        yield* c.uninterruptible("pay");
        yield* start(s);
        yield* pay(s);
        yield* c.ack;
        yield* c.disposeRuntime;
        yield* c.eq("not yet", yield* c.runtimeDisposals, 0);
        yield* c.advance(5000);
        yield* c.eq("disposed", yield* c.runtimeDisposals, 1);
        yield* c.reload;
        yield* s.state("UNSURE");
        yield* c.eq("reason", yield* lastReason(c, "pay"), "Disposed");
      }),
      "waiting-flushed": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* s.ensure;
        yield* start(s);
        yield* pay(s);
        yield* c.disposeRuntime;
        yield* c.ack;
        yield* c.eq("disposed once the last write is answered", yield* c.runtimeDisposals, 1);
        yield* c.eq("requests", yield* sent(c, "pay"), 0);
        yield* c.reload;
        yield* s.state("CARD");
        yield* c.eq("reason", yield* lastReason(c, "pay"), "Disposed");
        yield* c.eq("no send after boot", yield* sent(c, "pay"), 0);
      }),
      "waiting-flush-lost": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* s.ensure;
        yield* start(s);
        yield* pay(s);
        yield* c.disposeRuntime;
        yield* c.reload;
        yield* s.state("CARD");
        yield* c.eq(
          "nothing on disk, so no Restored after it",
          yield* lastReason(c, "pay"),
          "Disposed",
        );
        yield* c.eq("no send after boot", yield* sent(c, "pay"), 0);
      }),
    },
  ),
  {
    id: "PAY-15/dispose-held",
    cites: ["Actors R22", "Actors I29"],
    fixtures: [Cells],
    run: Effect.gen(function* () {
      const { c, shopper: s } = yield* cellsShopper;
      yield* s.ensure;
      yield* start(s);
      yield* pay(s);
      yield* c.ack;
      yield* c.answer("pay", Answer.Lost());
      yield* c.disposeRuntime;
      yield* c.eq("disposed", yield* c.runtimeDisposals, 1);
      yield* c.reload;
      yield* s.state("UNSURE");
      yield* c.eq("uncertain", (yield* row(s))?.uncertain, true);
    }),
  },
  ...variants(
    {
      id: "PAY-16",
      cites: ["Actors R22", "Actors I29", "Actors I30", "Actors I31", "WriteAhead R14"],
      fixtures: [Pay],
    },
    {
      "settled-during-disposal-parked": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.disposeRuntime;
        yield* c.eq("not yet: the commit may settle", yield* c.runtimeDisposals, 0);
        yield* c.answer("pay", CAPTURABLE);
        yield* c.eq("disposed once the wire is empty", yield* c.runtimeDisposals, 1);
        yield* c.eq("its own ending", (yield* c.endings("pay")).at(-1)?.channel, "success");
        yield* c.reload;
        yield* s.state("PLACING");
        yield* c.eq(
          "no Restored: the parked ending is delivered",
          (yield* c.endings("pay")).some((e) => e.reason === "Restored"),
          false,
        );
      }),
      "on-the-wire-at-the-bound-ends-unknown-disposed": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.disposeRuntime;
        yield* c.advance(4_999);
        yield* c.eq("within the bound", yield* c.runtimeDisposals, 0);
        yield* c.advance(1);
        yield* c.eq("the bound ends it", yield* c.runtimeDisposals, 1);
        yield* c.eq(
          "unknown { Disposed }",
          [(yield* c.endings("pay")).at(-1)?.channel, yield* lastReason(c, "pay")],
          ["unknown", "Disposed"],
        );
        yield* c.reload;
        yield* s.state("UNSURE");
        yield* c.eq(
          "no Restored: the parked ending is delivered",
          (yield* c.endings("pay")).some((e) => e.reason === "Restored"),
          false,
        );
      }),
      "dispose-waiting-resend": Effect.gen(function* () {
        const { c } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Lost());
        yield* c.advance(3000);
        yield* c.answer("order", Answer.Ok({ value: null }));
        yield* c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        yield* c.disposeRuntime;
        yield* c.eq(
          "no Disposed ending",
          (yield* c.endings("pay")).some((e) => e.reason === "Disposed"),
          false,
        );
      }),
      "disposal-ends-with-the-last-fiber": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* s.ensure;
        yield* c.uninterruptible("pay");
        yield* start(s);
        yield* pay(s);
        yield* c.ack;
        yield* c.disposeRuntime;
        yield* c.eq("not yet", yield* c.runtimeDisposals, 0);
        yield* c.answerLate("pay", CAPTURABLE);
        yield* c.eq("finished when it ended", yield* c.runtimeDisposals, 1);
      }),
    },
  ),
];
