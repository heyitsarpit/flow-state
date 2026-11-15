import { it } from "vite-plus/test";
import { type Actor, type Case, play } from "../../harness/case.ts";
import { Pay } from "../../harness/fixture.ts";
import { Observation } from "../../harness/reports.ts";
import { Answer } from "../../harness/world/network.ts";

const shoppers = (c: Case) => ({ a: c.actor(Pay, "shopper-1"), b: c.actor(Pay, "shopper-2") });

const onWire = (c: Case, s: Actor<typeof Pay>, intentId: string) => {
  s.send("Start", { cartId: `cart-${intentId}`, intentId });
  s.send("PayRequested", { paymentMethodId: "visa" });
  c.ack();
};

const tries = (c: Case, operation: string) =>
  c.reports().filter((o) => Observation.$is("Delivered")(o) && o.operation === operation).length;

const restored = (c: Case) => c.endings("pay").filter((e) => e.reason === "Restored").length;

it("DLV-01 (WriteLanes R10, WriteLanes I15, Restore I6)", () =>
  play([Pay], (c) => {
    const { a } = shoppers(c);
    a.ensure();
    onWire(c, a, "pi1");
    a.send("Leave", {});
    a.state("LEFT");
    onWire(c, a, "pi2");
    a.state("PAYING");
    c.eq("two writes on the wire", c.requests("pay").length, 2);
    c.reload();
    c.eq("both restored, once each", restored(c), 2);
  }));

it("DLV-02 (WriteLanes R10, WriteLanes I15, Restore I6)", () =>
  play([Pay], (c) => {
    const { a, b } = shoppers(c);
    a.ensure();
    b.ensure();
    onWire(c, a, "pi1");
    onWire(c, b, "pi2");
    c.reload();
    c.eq("both restored, once each", restored(c), 2);
    a.state("UNSURE");
    b.state("UNSURE");
  }));

it("DLV-03 (WriteLanes R10, WriteLanes I15)", () =>
  play([Pay], (c) => {
    const { a, b } = shoppers(c);
    a.ensure();
    b.ensure();
    onWire(c, a, "pi1");
    c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }));
    a.state("CARD");
    c.eq("notice", a.memory().notice, "Your card was declined (card_declined).");
    b.state("IDLE");
  }));

it("DLV-04 (WriteLanes R10, WriteLanes I15, Actors R15, Actors I24)", () =>
  play([Pay], (c) => {
    const { a } = shoppers(c);
    a.ensure();
    onWire(c, a, "pi1");
    c.answer("pay", Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } }));
    a.state("PLACING");
    c.ack();
    c.eq("place sent", c.requests("place").length, 1);
    c.answer("place", Answer.Ok({ value: null }));
    a.state("PLACING");
    c.eq("no receipt", a.memory().receipt, null);
    c.eq("refusals are issues", c.issues().includes("InvalidTurn"), true);
    c.eq("place not sent again", c.requests("place").length, 1);
    c.reload();
    a.state("PLACING");
    c.eq("still no receipt", a.memory().receipt, null);
    c.eq("place not sent at the boot", c.requests("place").length, 1);
  }));

it("DLV-05 (Actors R15, Actors I24, WriteLanes R10, WriteLanes I15)", () =>
  play([Pay], (c) => {
    const { a } = shoppers(c);
    a.ensure();
    onWire(c, a, "pi1");
    c.answer("pay", Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } }));
    c.ack();
    c.answer("place", Answer.Ok({ value: null }));
    c.eq("delivered, then once more after a refusal", tries(c, "place"), 2);
    c.reload();
    c.eq("one try at the boot", tries(c, "place"), 3);
    c.reload();
    c.eq("one try at the next boot", tries(c, "place"), 4);
    c.eq("still no receipt", a.memory().receipt, null);
  }));

it("DLV-06 (WriteLanes R6, WriteLanes I8, Actors R15)", () =>
  play([Pay], (c) => {
    const { a } = shoppers(c);
    a.ensure();
    onWire(c, a, "pi1");
    c.answer("pay", Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } }));
    c.ack();
    c.answer("place", Answer.Ok({ value: null }));
    c.eq("kept after two refusals", tries(c, "place"), 2);
    a.send("Leave", {});
    a.state("LEFT");
    a.send("Start", { cartId: "cart-pi1", intentId: "pi2" });
    a.state("CARD");
    a.send("PayRequested", { paymentMethodId: "visa" });
    a.state("PAYING");
    c.ack();
    c.ack();
    c.eq("second pay sent", c.requests("pay").length, 2);
    c.answer("pay", Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } }));
    c.ack();
    c.expect(
      "WriteLanes I8",
      "a kept ending leaves no lane to queue on, so the next place is not sent",
      c.requests("place").length,
      1,
    );
    c.expect(
      "WriteLanes R6",
      "the next place declines Rejected",
      c.endings("place").at(-1)?.reason,
      "Rejected",
    );
  }));
