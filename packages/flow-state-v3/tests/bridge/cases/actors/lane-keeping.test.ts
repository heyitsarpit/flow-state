import { Option } from "effect";
import { it } from "vite-plus/test";
import { type Actor, type Case, play } from "../../harness/case.ts";
import { Pay } from "../../harness/fixture.ts";
import { Answer } from "../../harness/world/network.ts";

const KEY = { intentId: "pi1" };

type Shopper = Actor<typeof Pay>;

const held = (c: Case) => {
  const s = c.actor(Pay, "shopper-1");
  s.ensure();
  s.send("Start", { cartId: "c1", intentId: "pi1" });
  s.send("PayRequested", { paymentMethodId: "visa" });
  c.ack();
  c.answer("pay", Answer.Lost());

  return s;
};

const uncertain = (s: Shopper) => Option.getOrUndefined(s.row("pay", KEY))?.uncertain;

it("DISP-01 (WriteLanes R8, WriteLanes I12, Actors R22, Actors I29)", () =>
  play([Pay], (c) => {
    const s = held(c);
    s.state("UNSURE");
    s.release("story");
    c.advance(1000);
    c.expect("WriteLanes I12", "the hold outlives its grace", uncertain(s), true);
  }));

it("DISP-02 (Actors R20, Actors I29, Restore I6)", () =>
  play([Pay], (c) => {
    const s = held(c);
    s.dispose();
    s.ensure();
    c.eq("the adopted lane is still Held", uncertain(s), true);
    c.eq("a Held head is not sent again on adoption", c.requests("pay").length, 1);
  }));

it("DISP-04 (Actors R22, Actors I30)", () =>
  play([Pay], (c) => {
    held(c);
    c.advance(3000);
    c.eq("a read is open when the disposal begins", c.requests("order").length, 1);
    c.disposeRuntime();
    c.eq("no read after the disposal began", c.requests("order").length, 1);
  }));

it("DISP-05 (Actors R21, Actors I32, Restore I6)", () =>
  play([Pay], (c) => {
    const s = held(c);
    s.forget();
    c.reload();
    s.ensure();
    c.eq("the adopted lane is still Held", uncertain(s), true);
    c.eq("a Held head is not sent again on adoption", c.requests("pay").length, 1);
  }));

it("DISP-06 (Actors R20, WriteLanes R10, WriteLanes I15)", () =>
  play([Pay], (c) => {
    const s = c.actor(Pay, "shopper-1");
    s.ensure();
    s.send("Start", { cartId: "c1", intentId: "pi1" });
    s.send("PayRequested", { paymentMethodId: "visa" });
    c.ack();
    s.dispose();
    c.answer("pay", Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } }));
    s.ensure();
    c.eq("the parked success reached the adopting actor", s.memory().authorized, true);
  }));

it("DISP-07 (Restore R1, Restore I1)", () =>
  play([Pay], (c) => {
    const s = c.actor(Pay, "shopper-1");
    s.ensure();
    s.send("Start", { cartId: "c1", intentId: "pi1" });
    s.state("CARD");
    c.ack();
    c.reload();
    s.ensure();
    s.state("CARD");
  }));
