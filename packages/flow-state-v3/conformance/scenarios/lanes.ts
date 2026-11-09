import { Effect, Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { Case, type Scenario } from "../dsl/case.ts";
import { Cells } from "../fixtures/pay.ts";
import { Cancel, Latest, Serialize } from "../fixtures/lab.ts";
import { Observation } from "../port.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };
const OK = Answer.Ok({ value: {} });

type Searcher = Pick<Actor<typeof Latest>, "send">;

type Ids = ReadonlyArray<string | undefined>;

const serial = Case.useSync((c) => ({ c, lane: c.actor(Serialize, "a") }));
const latest = Case.useSync((c) => ({ c, lane: c.actor(Latest, "a") }));
const cancel = Case.useSync((c) => ({ c, lane: c.actor(Cancel, "a") }));
const cells = Case.useSync((c) => ({ c, shopper: c.actor(Cells, "shopper-1") }));

const go = (a: Actor<typeof Serialize>, n: number) => a.send("Go", { n });

const search = (a: Searcher, q: string) => a.send("Go", { q });

const endedAs = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.endings(operation), (endings) => endings.map((e) => [e.channel, e.reason]));

const attemptsOf = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.requests(operation), (requests) => requests.flatMap((r) => Option.toArray(r.key)));

const delivered = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.reports, (reports) =>
    reports.flatMap((o) =>
      Observation.$is("Delivered")(o) && o.operation === operation
        ? [[o.event, Option.getOrElse(o.attempt, () => "")]]
        : [],
    ),
  );

const minted = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.reports, (reports) =>
    reports.flatMap((o) =>
      Observation.$is("Minted")(o) && o.operation === operation ? [o.attempt] : [],
    ),
  );

const serialize = (id: string, cites: ReadonlyArray<string>, run: Scenario["run"]) => ({
  id,
  cites,
  fixtures: [Serialize],
  run,
});

/**
 * The lane cases: one per cell of WriteLanes' table that the Pay cases do not reach, on one-lane
 * lab machines under `serialize`, `latest` and `cancel`, and on Pay with its `AbortPay` cancel.
 *
 * **Details**
 *
 * Each case's expectations come from the Requirement it cites; the `lane-cells` oracle checks the
 * cells of unkeyed lanes after every step. `LANE-01` to `LANE-05` and `LANE-10` run `serialize`
 * (`Lab/P1All`, whose `All` runs `cancelAll`), `LANE-06` `latest`, `LANE-07` `cancel`. `LANE-08`
 * and `LANE-09` cancel Pay's keyed write by its history, checked by their own expectations only.
 */
export const laneScenarios: ReadonlyArray<Scenario> = [
  serialize(
    "LANE-01",
    ["WriteLanes R7", "WriteLanes R8"],
    Effect.gen(function* () {
      const { c, lane: a } = yield* serial;
      yield* a.ensure;
      yield* go(a, 1);
      yield* c.ack;
      yield* go(a, 2);
      yield* go(a, 3);
      yield* c.eq(
        "one send: the queue waits behind the head",
        (yield* attemptsOf(c, "put")).length,
        1,
      );
      yield* c.answer("put", OK);
      yield* c.ack;
      yield* c.eq("the first queued is promoted and sent", (yield* attemptsOf(c, "put")).length, 2);
      yield* c.answer("put", OK);
      yield* c.ack;
      yield* c.answer("put", OK);
      yield* c.eq("sent in mint order", yield* attemptsOf(c, "put"), yield* minted(c, "put"));
      yield* c.eq("three successes", yield* endedAs(c, "put"), [
        ["success", "success"],
        ["success", "success"],
        ["success", "success"],
      ]);
    }),
  ),
  serialize(
    "LANE-02",
    ["WriteLanes R6", "WriteLanes R7"],
    Effect.gen(function* () {
      const { c, lane: a } = yield* serial;
      yield* a.ensure;
      yield* go(a, 0);
      yield* c.ack;
      yield* c.send(Array.from({ length: 65 }, (_, n) => a.event("Go", { n: n + 1 })));
      yield* c.eq("64 queued behind the head", (yield* minted(c, "put")).length, 65);
      yield* c.eq("the 65th declines", yield* endedAs(c, "put"), [["failure", "Overloaded"]]);
      yield* c.eq("one send", (yield* attemptsOf(c, "put")).length, 1);
    }),
  ),
  serialize(
    "LANE-03",
    ["WriteLanes R8", "WriteLanes R15"],
    Effect.gen(function* () {
      const { c, lane: a } = yield* serial;
      yield* a.ensure;
      yield* go(a, 1);
      yield* c.ack;
      yield* c.answer("put", Answer.Lost());
      yield* go(a, 2);
      yield* c.ack;
      yield* c.eq(
        "an unknown holds the lane and promotes nothing",
        (yield* attemptsOf(c, "put")).length,
        1,
      );
      yield* a.send("All", {});
      yield* c.eq("the queued commit ends Cancelled", yield* endedAs(c, "put"), [
        ["unknown", "NoResponse"],
        ["failure", "Cancelled"],
      ]);
      yield* c.eq("the hold is released", yield* c.evidence("Released"), 1);
      yield* go(a, 3);
      yield* c.ack;
      yield* c.eq("Idle again: a new commit is sent", (yield* attemptsOf(c, "put")).length, 2);
    }),
  ),
  serialize(
    "LANE-04",
    ["WriteLanes R15", "WriteLanes R14"],
    Effect.gen(function* () {
      const { c, lane: a } = yield* serial;
      yield* a.ensure;
      yield* go(a, 1);
      yield* c.ack;
      yield* go(a, 2);
      yield* go(a, 3);
      yield* a.send("All", {});
      const [head, first, second] = yield* minted(c, "put");
      yield* c.eq<ReadonlyArray<Ids>>(
        "the queue in mint order, then the head",
        yield* delivered(c, "put"),
        [
          ["No", first],
          ["No", second],
          ["Unsure", head],
        ],
      );
      yield* c.eq("one send", (yield* attemptsOf(c, "put")).length, 1);
    }),
  ),
  serialize(
    "LANE-05",
    ["WriteLanes R15", "WriteLanes R14"],
    Effect.gen(function* () {
      const { c, lane: a } = yield* serial;
      yield* a.ensure;
      yield* a.send("All", {});
      yield* a.state("A");
      yield* c.eq("nothing ends", (yield* c.endings("put")).length, 0);
      yield* c.eq("nothing released", yield* c.evidence("Released"), 0);
      yield* go(a, 1);
      yield* c.ack;
      yield* c.eq("the lane still takes a commit", (yield* attemptsOf(c, "put")).length, 1);
    }),
  ),
  serialize(
    "LANE-10",
    ["WriteLanes R14", "WriteLanes R15"],
    Effect.gen(function* () {
      const { c, lane: a } = yield* serial;
      yield* a.ensure;
      yield* go(a, 1);
      yield* go(a, 2);
      yield* a.send("All", {});
      yield* c.eq("the queued commit ends first", yield* endedAs(c, "put"), [
        ["failure", "Cancelled"],
      ]);
      yield* c.ack;
      yield* c.eq("never sent", (yield* attemptsOf(c, "put")).length, 0);
      yield* c.eq(
        "the head ends Cancelled once its acknowledgement is stored",
        yield* endedAs(c, "put"),
        [
          ["failure", "Cancelled"],
          ["failure", "Cancelled"],
        ],
      );
      yield* go(a, 3);
      yield* c.ack;
      yield* c.eq("Idle again: a new commit is sent", (yield* attemptsOf(c, "put")).length, 1);
    }),
  ),
  {
    id: "LANE-06",
    cites: ["WriteLanes R7", "WriteLanes R8"],
    fixtures: [Latest],
    run: Effect.gen(function* () {
      const { c, lane: a } = yield* latest;
      yield* a.ensure;
      yield* search(a, "a");
      yield* c.ack;
      yield* search(a, "ab");
      yield* search(a, "abc");
      yield* c.eq("the replaced queued commit is superseded", yield* c.evidence("Superseded"), 1);
      yield* c.answer("search", OK);
      yield* c.ack;
      const [head, , last] = yield* minted(c, "search");
      yield* c.eq<Ids>("the head, then the newest", yield* attemptsOf(c, "search"), [head, last]);
      yield* c.answer("search", OK);
      yield* c.eq("two endings, both successes", (yield* c.endings("search")).length, 2);
    }),
  },
  {
    id: "LANE-07",
    cites: ["WriteLanes R7", "WriteLanes R10"],
    fixtures: [Cancel],
    run: Effect.gen(function* () {
      const { c, lane: a } = yield* cancel;
      yield* a.ensure;
      yield* search(a, "a");
      yield* c.ack;
      yield* search(a, "ab");
      yield* c.ack;
      const [first, second] = yield* minted(c, "search");
      yield* c.eq<Ids>("both reached the wire", yield* attemptsOf(c, "search"), [first, second]);
      yield* c.answer("search", OK);
      yield* c.answer("search", OK);
      yield* c.eq<ReadonlyArray<Ids>>(
        "only the newer one is heard",
        yield* delivered(c, "search"),
        [["Ok", second]],
      );
      yield* a.state("A");
    }),
  },
  {
    id: "LANE-08",
    cites: ["WriteLanes R14"],
    fixtures: [Cells],
    run: Effect.gen(function* () {
      const { c, shopper: s } = yield* cells;
      yield* s.ensure;
      yield* s.send("Start", CART);
      yield* s.send("PayRequested", { paymentMethodId: "visa" });
      yield* s.send("AbortPay", {});
      yield* c.ack;
      yield* c.eq("never sent", (yield* attemptsOf(c, "pay")).length, 0);
      yield* c.eq("ends NotSent Cancelled", yield* endedAs(c, "pay"), [["failure", "Cancelled"]]);
    }),
  },
  {
    id: "LANE-09",
    cites: ["WriteLanes R14", "WriteLanes R8"],
    fixtures: [Cells],
    run: Effect.gen(function* () {
      const { c, shopper: s } = yield* cells;
      yield* s.ensure;
      yield* s.send("Start", CART);
      yield* s.send("PayRequested", { paymentMethodId: "visa" });
      yield* c.ack;
      yield* c.answer("pay", Answer.Lost());
      yield* s.state("UNSURE");
      yield* s.send("AbortPay", {});
      yield* c.eq("the hold is released", yield* c.evidence("Released"), 1);
      yield* c.eq("the lane is Idle", Option.isNone(yield* s.row("pay", KEY)), true);
    }),
  },
];
