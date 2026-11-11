import { Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import type { Case, Scenario } from "../dsl/case.ts";
import { Cells } from "../fixtures/pay.ts";
import { Cancel, Latest, Release, Serialize } from "../fixtures/one-lane.ts";
import { Address } from "../dsl/oracle.ts";
import { Observation } from "../port.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };
const OK = Answer.Ok({ value: {} });

type Searcher = Pick<Actor<typeof Latest>, "send">;

type Ids = ReadonlyArray<string | undefined>;

const serial = (c: Case) => c.actor(Serialize, "a");
const latest = (c: Case) => c.actor(Latest, "a");
const cancel = (c: Case) => c.actor(Cancel, "a");
const cells = (c: Case) => c.actor(Cells, "shopper-1");

const go = (a: Actor<typeof Serialize>, n: number) => a.send("Go", { n });

const search = (a: Searcher, q: string) => a.send("Go", { q });

const endedAs = (c: Case, operation: string) =>
  c.endings(operation).map((e) => [e.channel, e.reason]);

const attemptsOf = (c: Case, operation: string) =>
  c.requests(operation).flatMap((r) => Option.toArray(r.key));

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

const released = (c: Case) => c.actor(Release, "a");

const toTrait = (c: Case, n: number) =>
  c.send([
    {
      actor: { machine: Release.machine, id: "a" },
      event: "Go",
      payload: { n },
      to: Address.Part({ path: ["t"] }),
    },
  ]);

const serialize = (id: string, cites: ReadonlyArray<string>, run: Scenario["run"]) => ({
  id,
  cites,
  fixtures: [Serialize],
  run,
});

/**
 * The lane cases: one per cell of WriteLanes' table that the Pay cases do not reach, on one-lane
 * machines under `serialize`, `latest` and `cancel`, and on Pay with its `AbortPay` cancel.
 *
 * **Details**
 *
 * Each case's expectations come from the Requirement it cites; the `lane-queue` oracle checks the
 * cells of unkeyed lanes after every step. `LANE-01` to `LANE-05` and `LANE-10` run `serialize`
 * (`Lab/P1All`, whose `All` runs `cancelAll`), `LANE-06` `latest`, `LANE-07` `cancel`. `LANE-08`
 * and `LANE-09` cancel Pay's keyed write by its history, checked by their own expectations only.
 */
export const lanePoliciesScenarios: ReadonlyArray<Scenario> = [
  serialize("LANE-01", ["WriteLanes R7", "WriteLanes R8"], (c) => {
    const a = serial(c);
    a.ensure();
    go(a, 1);
    c.ack();
    go(a, 2);
    go(a, 3);
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
    const a = serial(c);
    a.ensure();
    go(a, 0);
    c.ack();
    c.send(Array.from({ length: 65 }, (_, n) => a.event("Go", { n: n + 1 })));
    c.eq("64 queued behind the head", minted(c, "put").length, 65);
    c.eq("the 65th declines", endedAs(c, "put"), [["failure", "Overloaded"]]);
    c.eq("one send", attemptsOf(c, "put").length, 1);
  }),
  serialize("LANE-03", ["WriteLanes R8", "WriteLanes R15"], (c) => {
    const a = serial(c);
    a.ensure();
    go(a, 1);
    c.ack();
    c.answer("put", Answer.Lost());
    go(a, 2);
    c.ack();
    c.eq("an unknown holds the lane and promotes nothing", attemptsOf(c, "put").length, 1);
    a.send("All", {});
    c.eq("the queued commit ends Cancelled", endedAs(c, "put"), [
      ["unknown", "NoResponse"],
      ["failure", "Cancelled"],
    ]);
    c.eq("the hold is released", c.evidence("Released"), 1);
    go(a, 3);
    c.ack();
    c.eq("Idle again: a new commit is sent", attemptsOf(c, "put").length, 2);
  }),
  serialize("LANE-04", ["WriteLanes R15", "WriteLanes R14"], (c) => {
    const a = serial(c);
    a.ensure();
    go(a, 1);
    c.ack();
    go(a, 2);
    go(a, 3);
    a.send("All", {});
    const [head, first, second] = minted(c, "put");
    c.eq<ReadonlyArray<Ids>>("the queue in mint order, then the head", delivered(c, "put"), [
      ["No", first],
      ["No", second],
      ["Unsure", head],
    ]);
    c.eq("one send", attemptsOf(c, "put").length, 1);
  }),
  serialize("LANE-05", ["WriteLanes R15", "WriteLanes R14"], (c) => {
    const a = serial(c);
    a.ensure();
    a.send("All", {});
    a.state("A");
    c.eq("nothing ends", c.endings("put").length, 0);
    c.eq("nothing released", c.evidence("Released"), 0);
    go(a, 1);
    c.ack();
    c.eq("the lane still takes a commit", attemptsOf(c, "put").length, 1);
  }),
  serialize("LANE-10", ["WriteLanes R14", "WriteLanes R15"], (c) => {
    const a = serial(c);
    a.ensure();
    go(a, 1);
    go(a, 2);
    a.send("All", {});
    c.eq("the queued commit ends first", endedAs(c, "put"), [["failure", "Cancelled"]]);
    c.ack();
    c.eq("never sent", attemptsOf(c, "put").length, 0);
    c.eq("the head ends Cancelled once its acknowledgement is stored", endedAs(c, "put"), [
      ["failure", "Cancelled"],
      ["failure", "Cancelled"],
    ]);
    go(a, 3);
    c.ack();
    c.eq("Idle again: a new commit is sent", attemptsOf(c, "put").length, 1);
  }),
  {
    id: "LANE-06",
    cites: ["WriteLanes R7", "WriteLanes R8"],
    fixtures: [Latest],
    run: (c) => {
      const a = latest(c);
      a.ensure();
      search(a, "a");
      c.ack();
      search(a, "ab");
      search(a, "abc");
      c.eq("the replaced queued commit is superseded", c.evidence("Superseded"), 1);
      c.answer("search", OK);
      c.ack();
      const [head, , last] = minted(c, "search");
      c.eq<Ids>("the head, then the newest", attemptsOf(c, "search"), [head, last]);
      c.answer("search", OK);
      c.eq("two endings, both successes", c.endings("search").length, 2);
    },
  },
  {
    id: "LANE-07",
    cites: ["WriteLanes R7", "WriteLanes R10"],
    fixtures: [Cancel],
    run: (c) => {
      const a = cancel(c);
      a.ensure();
      search(a, "a");
      c.ack();
      search(a, "ab");
      c.ack();
      const [first, second] = minted(c, "search");
      c.eq<Ids>("both reached the wire", attemptsOf(c, "search"), [first, second]);
      c.answer("search", OK);
      c.answer("search", OK);
      c.eq<ReadonlyArray<Ids>>("only the newer one is heard", delivered(c, "search"), [
        ["Ok", second],
      ]);
      a.state("A");
    },
  },
  {
    id: "LANE-08",
    cites: ["WriteLanes R14"],
    fixtures: [Cells],
    run: (c) => {
      const s = cells(c);
      s.ensure();
      s.send("Start", CART);
      s.send("PayRequested", { paymentMethodId: "visa" });
      s.send("AbortPay", {});
      c.ack();
      c.eq("never sent", attemptsOf(c, "pay").length, 0);
      c.eq("ends NotSent Cancelled", endedAs(c, "pay"), [["failure", "Cancelled"]]);
    },
  },
  {
    id: "LANE-09",
    cites: ["WriteLanes R14", "WriteLanes R8"],
    fixtures: [Cells],
    run: (c) => {
      const s = cells(c);
      s.ensure();
      s.send("Start", CART);
      s.send("PayRequested", { paymentMethodId: "visa" });
      c.ack();
      c.answer("pay", Answer.Lost());
      s.state("UNSURE");
      s.send("AbortPay", {});
      c.eq("the hold is released", c.evidence("Released"), 1);
      c.eq("the lane is Idle", Option.isNone(s.row("pay", KEY)), true);
    },
  },
  {
    id: "LANE-11",
    cites: ["WriteLanes R4", "WriteLanes I5"],
    fixtures: [Cancel],
    run: (c) => {
      const a = cancel(c);
      a.ensure();
      search(a, "a");
      c.ack();
      c.answer("search", Answer.Lost());
      a.state("A");
      c.eq(
        "WriteLanes I5: a not-retained unknown leaves no Held lane",
        Option.isNone(a.row("search", {})),
        true,
      );
      c.eq("released as evidence", c.evidence("Released"), 1);
      c.eq(
        "heard once",
        delivered(c, "search").map(([event]) => event),
        ["Unsure"],
      );
      c.eq("sent once", attemptsOf(c, "search").length, 1);
    },
  },
  {
    id: "LANE-12/release-ends-queue",
    cites: ["WriteLanes R16", "WriteLanes I15"],
    fixtures: [Release],
    run: (c) => {
      const a = released(c);
      a.ensure();
      toTrait(c, 1);
      c.ack();
      toTrait(c, 2);
      toTrait(c, 3);
      a.send("Leave", {});
      a.state("AWAY");
      c.eq("WriteLanes I15: a releasing lane delivers nothing", delivered(c, "q"), []);
      c.eq("only the head was sent", attemptsOf(c, "q").length, 1);
    },
  },
  {
    id: "LANE-12/release-leaves-head",
    cites: ["WriteLanes R16", "WriteLanes I15"],
    fixtures: [Release],
    run: (c) => {
      const a = released(c);
      a.ensure();
      toTrait(c, 1);
      c.ack();
      toTrait(c, 2);
      a.send("Leave", {});
      c.answer("q", OK);
      a.state("AWAY");
      c.eq("WriteLanes I15: a releasing lane delivers nothing", delivered(c, "q"), []);
      c.eq("only the head was sent", attemptsOf(c, "q").length, 1);
    },
  },
];
