import { Option } from "effect";
import type { Case, Scenario } from "../dsl/case.ts";
import { Observation } from "../port.ts";
import { Answer } from "../world/network.ts";

const SERIAL = { machine: "Lab/P1All", id: "a" };
const LATEST = { machine: "Lab/P1Latest", id: "a" };
const SWITCH = { machine: "Lab/R15Switch", id: "a" };
const SHOPPER = { machine: "Checkout/Pay", id: "shopper-1" };
const CART = { cartId: "c1", intentId: "pi1" };
const OK = Answer.Ok({ value: {} });

const go = (c: Case, n: number) => c.send("Go", { n });

const search = (c: Case, q: string) => c.send("Go", { q });

const endedAs = (c: Case, operation: string) =>
  c.endings(operation).map((e) => [e.channel, e.reason]);

const attemptsOf = (c: Case, operation: string) =>
  c.world.network
    .requests()
    .filter((r) => r.operation === operation)
    .flatMap((r) => Option.toArray(r.key));

const delivered = (c: Case, operation: string) =>
  c
    .reports()
    .flatMap((o) =>
      Observation.$is("Delivered")(o) && o.operation === operation
        ? [[o.event, Option.getOrElse(o.attempt, () => "")]]
        : [],
    );

const minted = (c: Case, operation: string) =>
  c
    .reports()
    .flatMap((o) => (Observation.$is("Minted")(o) && o.operation === operation ? [o.attempt] : []));

const serialize = (id: string, cites: ReadonlyArray<string>, run: (c: Case) => void) => ({
  id,
  cites,
  fixtures: ["serialize"],
  actor: SERIAL,
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
  serialize("LANE-01", ["WriteLanes R7", "WriteLanes R8"], (c) => {
    c.ensure();
    go(c, 1);
    c.ack();
    go(c, 2);
    go(c, 3);
    c.eq("one send: the queue waits behind the head", attemptsOf(c, "put").length, 1);
    c.answer("put", OK);
    c.ack();
    c.eq("the first queued is promoted and sent", attemptsOf(c, "put").length, 2);
    c.answer("put", OK);
    c.ack();
    c.answer("put", OK);
    c.eq("sent in mint order", attemptsOf(c, "put"), minted(c, "put"));
    c.eq("three successes", endedAs(c, "put"), [
      ["success", "success"],
      ["success", "success"],
      ["success", "success"],
    ]);
  }),
  serialize("LANE-02", ["WriteLanes R6", "WriteLanes R7"], (c) => {
    c.ensure();
    go(c, 0);
    c.ack();
    c.sendMany(Array.from({ length: 65 }, (_, n) => [SERIAL, "Go", { n: n + 1 }] as const));
    c.eq("64 queued behind the head", minted(c, "put").length, 65);
    c.eq("the 65th declines", endedAs(c, "put"), [["failure", "Overloaded"]]);
    c.eq("one send", attemptsOf(c, "put").length, 1);
  }),
  serialize("LANE-03", ["WriteLanes R8", "WriteLanes R15"], (c) => {
    c.ensure();
    go(c, 1);
    c.ack();
    c.answer("put", Answer.Lost());
    go(c, 2);
    c.ack();
    c.eq("an unknown holds the lane and promotes nothing", attemptsOf(c, "put").length, 1);
    c.send("All", {});
    c.eq("the queued commit ends Cancelled", endedAs(c, "put"), [
      ["unknown", "NoResponse"],
      ["failure", "Cancelled"],
    ]);
    c.eq("the hold is released", c.evidence("Released"), 1);
    go(c, 3);
    c.ack();
    c.eq("Idle again: a new commit is sent", attemptsOf(c, "put").length, 2);
  }),
  serialize("LANE-04", ["WriteLanes R15", "WriteLanes R14"], (c) => {
    c.ensure();
    go(c, 1);
    c.ack();
    go(c, 2);
    go(c, 3);
    c.send("All", {});
    const [head, first, second] = minted(c, "put");
    c.eq("the queue in mint order, then the head", delivered(c, "put"), [
      ["No", first],
      ["No", second],
      ["Unsure", head],
    ]);
    c.eq("one send", attemptsOf(c, "put").length, 1);
  }),
  serialize("LANE-05", ["WriteLanes R15", "WriteLanes R14"], (c) => {
    c.ensure();
    c.send("All", {});
    c.state("A");
    c.eq("nothing ends", c.endings("put").length, 0);
    c.eq("nothing released", c.evidence("Released"), 0);
    go(c, 1);
    c.ack();
    c.eq("the lane still takes a commit", attemptsOf(c, "put").length, 1);
  }),
  serialize("LANE-10", ["WriteLanes R14", "WriteLanes R15"], (c) => {
    c.ensure();
    go(c, 1);
    go(c, 2);
    c.send("All", {});
    c.eq("the queued commit ends first", endedAs(c, "put"), [["failure", "Cancelled"]]);
    c.ack();
    c.eq("never sent", attemptsOf(c, "put").length, 0);
    c.eq("the head ends Cancelled once its acknowledgement is stored", endedAs(c, "put"), [
      ["failure", "Cancelled"],
      ["failure", "Cancelled"],
    ]);
    go(c, 3);
    c.ack();
    c.eq("Idle again: a new commit is sent", attemptsOf(c, "put").length, 1);
  }),
  {
    id: "LANE-06",
    cites: ["WriteLanes R7", "WriteLanes R8"],
    fixtures: ["latest"],
    actor: LATEST,
    run: (c) => {
      c.ensure();
      search(c, "a");
      c.ack();
      search(c, "ab");
      search(c, "abc");
      c.eq("the replaced queued commit is superseded", c.evidence("Superseded"), 1);
      c.answer("search", OK);
      c.ack();
      const [head, , last] = minted(c, "search");
      c.eq("the head, then the newest", attemptsOf(c, "search"), [head, last]);
      c.answer("search", OK);
      c.eq("two endings, both successes", c.endings("search").length, 2);
    },
  },
  {
    id: "LANE-07",
    cites: ["WriteLanes R7", "WriteLanes R10"],
    fixtures: ["cancel"],
    actor: SWITCH,
    run: (c) => {
      c.ensure();
      search(c, "a");
      c.ack();
      search(c, "ab");
      c.ack();
      const [first, second] = minted(c, "search");
      c.eq("both reached the wire", attemptsOf(c, "search"), [first, second]);
      c.answer("search", OK);
      c.answer("search", OK);
      c.eq("only the newer one is heard", delivered(c, "search"), [["Ok", second]]);
      c.state("A");
    },
  },
  {
    id: "LANE-08",
    cites: ["WriteLanes R14"],
    fixtures: ["cells"],
    actor: SHOPPER,
    run: (c) => {
      c.ensure();
      c.send("Start", CART);
      c.send("PayRequested", { paymentMethodId: "visa" });
      c.send("AbortPay", {});
      c.ack();
      c.eq("never sent", attemptsOf(c, "pay").length, 0);
      c.eq("ends NotSent Cancelled", endedAs(c, "pay"), [["failure", "Cancelled"]]);
    },
  },
  {
    id: "LANE-09",
    cites: ["WriteLanes R14", "WriteLanes R8"],
    fixtures: ["cells"],
    actor: SHOPPER,
    run: (c) => {
      c.ensure();
      c.send("Start", CART);
      c.send("PayRequested", { paymentMethodId: "visa" });
      c.ack();
      c.answer("pay", Answer.Lost());
      c.state("UNSURE");
      c.send("AbortPay", {});
      c.eq("the hold is released", c.evidence("Released"), 1);
      c.eq("the lane is Idle", Option.getOrUndefined(c.row("pay", { intentId: "pi1" })), undefined);
    },
  },
];
