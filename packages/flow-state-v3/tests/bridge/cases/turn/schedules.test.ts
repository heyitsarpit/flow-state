import { it } from "vite-plus/test";
import { type Case, play } from "../../harness/case.ts";
import { Pay } from "../../harness/fixture.ts";
import { CAPTURABLE, onWire, pay, shopper } from "../../harness/pay.ts";
import { Observation } from "../../harness/reports.ts";
import { Answer } from "../../harness/world/network.ts";

const SLOW_MS = 8000;

const ticks = (c: Case) =>
  c.reports().filter((o) => Observation.$is("Turn")(o) && o.event === "CheckTick").length;

it("TURN-03/unused (Turn R17, Turn I22, Turn I23)", () =>
  play([Pay], (c) => {
    const s = shopper(c);
    onWire(c);
    s.release("story");
    c.advance(SLOW_MS + 1000);
    c.expect("Turn I23", "no firing while unused", ticks(c), 0);
    c.expect("Turn I23", "the notice is unchanged while unused", s.memory().notice, "");
    s.ensure();
    c.expect("Turn I22", "the overdue deadline fires once on the returning use", ticks(c), 1);
    s.state("PAYING");
    c.eq("notice", s.memory().notice, "Still confirming with your bank…");
  }));

it("TURN-03/exited (Turn R14, Turn R15)", () =>
  play([Pay], (c) => {
    const s = shopper(c);
    onWire(c);
    c.answer("pay", CAPTURABLE);
    s.state("PLACING");
    c.advance(SLOW_MS + 1000);
    c.eq("no firing after the exit", ticks(c), 0);
    c.eq("notice", s.memory().notice, "");
  }));

it("TURN-03/on-time (Turn R14, Turn R15)", () =>
  play([Pay], (c) => {
    onWire(c);
    c.advance(SLOW_MS - 1);
    c.eq("not before its delay", ticks(c), 0);
    c.expect("Turn I21", "no notice before its delay", shopper(c).memory().notice, "");
    c.advance(1);
    c.eq("once at its delay", ticks(c), 1);
    c.advance(SLOW_MS);
    c.eq("a Duration fires once", ticks(c), 1);
  }));

it("TURN-03/re-entered (Turn R14, Turn R15, Turn I20)", () =>
  play([Pay], (c) => {
    const s = shopper(c);
    onWire(c);
    c.advance(SLOW_MS / 2);
    c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }));
    s.state("CARD");
    pay(s);
    c.ack();
    s.state("PAYING");
    c.advance(SLOW_MS / 2 + 500);
    c.expect("Turn I20", "the first activation's deadline never fires", s.memory().notice, "");
  }));
