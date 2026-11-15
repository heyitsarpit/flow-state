import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { play } from "../../harness/case.ts";
import { Pay } from "../../harness/fixture.ts";
import { CAPTURABLE, CART, onWire, sent, shopper, start } from "../../harness/pay.ts";
import { Answer } from "../../harness/world/network.ts";

describe("TURN-01 (Turn R8, Turn R10, Turn I14, WriteLanes R10)", () => {
  it("TURN-01/schedule-refused", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      const before = s.memory();
      c.answer("pay", Answer.Fail({ tag: "Busy", fields: { retryAfterMs: -1 } }));
      s.state("PAYING");
      c.eq("memory unchanged", s.memory(), before);
      c.eq("refused, then refused again on its one redelivery", c.issues(), [
        "InvalidTurn",
        "InvalidTurn",
      ]);
      c.eq("no new request", sent(c, "pay"), 1);
    }));

  it("TURN-01/schedule-out-of-range breaks Turn I14", () =>
    assert.throws(
      () =>
        play([Pay], (c) => {
          const s = shopper(c);
          onWire(c);
          const before = s.memory();
          c.answer("pay", Answer.Fail({ tag: "Busy", fields: { retryAfterMs: 2_147_483_648 } }));
          c.expect("Turn I14", "refused, then refused again on its one redelivery", c.issues(), [
            "InvalidTurn",
            "InvalidTurn",
          ]);
          s.state("PAYING");
          c.eq("memory unchanged", s.memory(), before);
          c.eq("no new request", sent(c, "pay"), 1);
        }),
      { cites: ["Turn I14"] },
    ));

  it("TURN-01/mapper-refused", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", CAPTURABLE);
      s.state("PLACING");
      c.ack();
      const before = s.memory();
      c.answer("place", Answer.Ok({ value: null }));
      s.state("PLACING");
      c.eq("memory unchanged", s.memory(), before);
      c.eq("refused, then refused again on its one redelivery", c.issues(), [
        "InvalidTurn",
        "InvalidTurn",
      ]);
      c.eq("no new request", sent(c, "place"), 1);
    }));
});

it("TURN-02 (Turn R2, Turn R9, Turn I17)", () =>
  play([Pay], (c) => {
    const s = shopper(c);
    s.ensure();
    start(s);
    s.state("CARD");
    const before = s.memory();
    s.send("Done", {});
    s.state("CARD");
    c.eq("memory unchanged", s.memory(), before);
    c.eq("no issue", c.issues(), []);
    c.eq("cart kept", s.memory().cartId, CART.cartId);
  }));
