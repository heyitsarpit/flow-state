import { Option } from "effect";
import type { cellsCheckout } from "../fixtures/cells/machine.ts";
import { checkout, PayMachine, shop, shopSetup } from "../fixtures/pay/machine.ts";
import { Shop, ShopFake, ShopFakeSteadfast } from "../fixtures/pay/server.ts";
import { ShopLive } from "../fixtures/pay/shop-http.ts";
import { runtimeSetup } from "../src/index.ts";
import { shopStory } from "../fixtures/pay/stories.ts";
import type { Evidence } from "../src/host/inspect.ts";
import { type Cut, Story, type StoryRun, type WorldWord } from "../src/host/testing/index.ts";
import { TraceRecord } from "../src/host/trace.ts";

/**
 * The key of the one payment most checkout cases make: `pay`'s key, its intent.
 */
export const KEY = { intentId: "pi1" };

/**
 * The cart the checkout cases start.
 */
export const START = { _tag: "Start", cartId: "c1", intentId: "pi1" } as const;

/**
 * The shopper presses pay.
 */
export const VISA = { _tag: "PayRequested", paymentMethodId: "visa" } as const;

/**
 * How long UNSURE waits before it reads the order and the intent again: its `check` schedule.
 */
export const CHECK = "3 seconds";

/**
 * Pay's own deadline for one send of `pay`.
 */
export const PAY_DEADLINE = "60 seconds";

/**
 * The checkout app over the port fake whose confirm the network never interrupts.
 */
export const steadfastStory = (id: string) =>
  Story.app(shopSetup, { id, fixtures: [ShopFakeSteadfast] });

/**
 * The checkout app with captures coalesced over 5 seconds, as the default host writes them.
 */
export const coalescedStory = (id: string) =>
  Story.app(
    runtimeSetup({
      app: shop,
      services: ShopLive("https://shop.example"),
      scope: "shop",
      persistence: { captureMs: 5000 },
    }),
    { id, fixtures: [ShopFake] },
  );

/**
 * The checkout ensured, its cart started, the given world words applied, and pay pressed: `pay`
 * is on the wire, or answered at once when no word holds or drops it.
 */
export const onWire = (id: string, ...words: ReadonlyArray<WorldWord>) => {
  const started = shopStory(id).ensure(checkout).send(checkout, START);

  return (words.length > 0 ? started.world(...words) : started).send(checkout, VISA);
};

type Shopper = typeof checkout | typeof cellsCheckout;

/**
 * A shopper's leaf state at a cut, `(absent)` when it has none.
 */
export const state = (cut: Cut, ref: Shopper = checkout) => cut.read(ref)?.state ?? "(absent)";

/**
 * A shopper's memory at a cut.
 */
export const memory = (cut: Cut, ref: Shopper = checkout) => cut.read(ref)?.memory;

/**
 * A shopper's `pay` or `void` row for an intent at a cut, undefined when the lane has none.
 */
export const row = (
  cut: Cut,
  ref: Shopper = checkout,
  operation: "pay" | "void" = "pay",
  intentId = "pi1",
) => {
  const snapshot = cut.read(ref);

  if (snapshot === undefined) return undefined;

  return Option.getOrUndefined(
    PayMachine.definition.O[operation].get(snapshot.operations, { intentId }),
  );
};

/**
 * How many charges of an intent the shop holds: keys whose confirm captured it.
 */
export const charges = (cut: Cut, intentId = "pi1") =>
  Object.values(cut.read(Shop).charges).filter((i) => i === intentId).length;

/**
 * How many distinct idempotency keys the shop's confirm received.
 */
export const keys = (cut: Cut) => new Set(cut.read(Shop.confirm).map((c) => c.input.key)).size;

/**
 * Evidence records, as the helpers below read them.
 */
export type Records = ReadonlyArray<Evidence>;

/**
 * The evidence records of a run before one of its checkpoints.
 */
export const before = (run: StoryRun, checkpoint: string) => {
  const at = run.trace.events.findIndex(
    (e) =>
      TraceRecord.$is("Step")(e.record) &&
      e.record.step._tag === "checkpoint" &&
      e.record.step.name === checkpoint,
  );

  return run.trace.events
    .slice(0, at)
    .flatMap((e) => (TraceRecord.$is("Runtime")(e.record) ? [e.record.evidence] : []));
};

/**
 * An operation's endings, as channel and reason.
 */
export const endings = (records: ReadonlyArray<Evidence>, operation: string) =>
  records.flatMap((e) =>
    e._tag === "Ended" && e.operation === operation
      ? [{ channel: e.channel, reason: e.reason }]
      : [],
  );

/**
 * The reason of an operation's last ending.
 */
export const lastReason = (records: ReadonlyArray<Evidence>, operation: string) =>
  endings(records, operation).at(-1)?.reason;

/**
 * The issue codes reported, in order.
 */
export const issues = (records: ReadonlyArray<Evidence>) =>
  records.flatMap((e) => (e._tag === "Issue" ? [e.code] : []));

/**
 * How many lane facts of a kind were recorded.
 */
export const laneFacts = (records: ReadonlyArray<Evidence>, kind: string) =>
  records.filter((e) => e._tag === "Lane" && e.kind === kind).length;

/**
 * The reasons of each denial, in order.
 */
export const denials = (records: ReadonlyArray<Evidence>) =>
  records.flatMap((e) => (e._tag === "Denied" ? [e.reasons] : []));

/**
 * How many Runtime disposals ended.
 */
export const disposals = (records: ReadonlyArray<Evidence>) =>
  records.filter((e) => e._tag === "RuntimeDisposed").length;
