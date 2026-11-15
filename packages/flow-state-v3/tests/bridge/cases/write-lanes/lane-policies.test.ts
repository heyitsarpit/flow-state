import { Option } from "effect";
import { it } from "vite-plus/test";
import { type Case, laneGone, play } from "../../harness/case.ts";
import { Cells } from "../../harness/fixture.ts";
import { CART, cells, KEY } from "../../harness/pay.ts";
import { Answer } from "../../harness/world/network.ts";

const endedAs = (c: Case, operation: string) =>
  c.endings(operation).map((e) => [e.channel, e.reason]);

const attemptsOf = (c: Case, operation: string) =>
  c.requests(operation).flatMap((r) => Option.toArray(r.key));

it("LANE-08 (WriteLanes R14)", () =>
  play([Cells], (c) => {
    const s = cells(c);
    s.ensure();
    s.send("Start", CART);
    s.send("PayRequested", { paymentMethodId: "visa" });
    s.send("AbortPay", {});
    c.ack();
    c.eq("never sent", attemptsOf(c, "pay").length, 0);
    c.eq("ends NotSent Cancelled", endedAs(c, "pay"), [["failure", "Cancelled"]]);
  }));

it("LANE-09 (WriteLanes R14, WriteLanes R8)", () =>
  play([Cells], (c) => {
    const s = cells(c);
    s.ensure();
    s.send("Start", CART);
    s.send("PayRequested", { paymentMethodId: "visa" });
    c.ack();
    c.answer("pay", Answer.Lost());
    s.state("UNSURE");
    s.send("AbortPay", {});
    c.eq("the hold is released", c.evidence("Released"), 1);
    c.eq("the lane is Idle", s.row("pay", KEY), laneGone);
  }));
