import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { disposalBoundMs, play } from "../../harness/case.ts";
import { Cells, Pay } from "../../harness/fixture.ts";
import {
  CAPTURABLE,
  cells,
  lastReason,
  onWire,
  pay,
  row,
  sent,
  shopper,
  start,
} from "../../harness/pay.ts";
import { Answer } from "../../harness/world/network.ts";

describe("PAY-13 (Actors R22, Actors R23, Actors I29, Actors I30, WriteAhead R14)", () => {
  it("PAY-13/hung-commit", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      s.ensure();
      c.uninterruptible("pay");
      start(s);
      pay(s);
      c.ack();
      c.disposeRuntime();
      c.eq("not yet", c.runtimeDisposals(), 0);
      c.advance(disposalBoundMs);
      c.eq("disposed", c.runtimeDisposals(), 1);
      c.reload();
      s.state("UNSURE");
      c.eq("reason", lastReason(c, "pay"), "Disposed");
    }));

  it("PAY-13/waiting-flushed", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      s.ensure();
      start(s);
      pay(s);
      c.disposeRuntime();
      c.ack();
      c.eq("disposed once the last write is answered", c.runtimeDisposals(), 1);
      c.eq("requests", sent(c, "pay"), 0);
      c.reload();
      s.state("CARD");
      c.eq("reason", lastReason(c, "pay"), "Disposed");
      c.eq("no send after boot", sent(c, "pay"), 0);
    }));

  it("PAY-13/waiting-flush-lost", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      s.ensure();
      start(s);
      pay(s);
      c.disposeRuntime();
      c.reload();
      s.state("CARD");
      c.eq("nothing on disk, so no Restored after it", lastReason(c, "pay"), "Disposed");
      c.eq("no send after boot", sent(c, "pay"), 0);
    }));
});

it("PAY-15/dispose-held (Actors R22, Actors I29)", () =>
  play([Cells], (c) => {
    const s = cells(c);
    s.ensure();
    start(s);
    pay(s);
    c.ack();
    c.answer("pay", Answer.Lost());
    c.disposeRuntime();
    c.eq("disposed", c.runtimeDisposals(), 1);
    c.reload();
    s.state("UNSURE");
    c.eq("uncertain", row(s)?.uncertain, true);
  }));

it("PAY-15/dispose-held-moved (Actors R22, Actors I29, Restore I6)", () =>
  play([Cells], (c) => {
    const s = cells(c);
    s.ensure();
    start(s);
    pay(s);
    c.ack();
    c.answer("pay", Answer.Lost());
    pay(s);
    s.state("PAYING");
    c.disposeRuntime();
    c.reload();
    c.expect(
      "Restore I6",
      "the boot delivers the Held head's unknown { Restored }",
      row(s)?.uncertain,
      true,
    );
    s.state("UNSURE");
  }));

it("PAY-15/final-write-refused breaks Actors I43", () =>
  assert.throws(
    () =>
      play([Cells], (c) => {
        const s = cells(c);
        s.ensure();
        start(s);
        c.ack();
        c.holdFlushes();
        c.disposeRuntime();
        c.answerStorage("refuse");
        c.advance(disposalBoundMs);
        c.expect(
          "Actors I43",
          "a refused final write reports StorageFailure before the disposal ends",
          c.evidence("StorageFailure") > 0,
          true,
        );
      }),
    { cites: ["Actors I43"] },
  ));

describe("PAY-16 (Actors R22, Actors I29, Actors I30, Actors I31, WriteAhead R14)", () => {
  it("PAY-16/settled-during-disposal-parked", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.disposeRuntime();
      c.eq("not yet: the commit may settle", c.runtimeDisposals(), 0);
      c.answer("pay", CAPTURABLE);
      c.eq("disposed once the wire is empty", c.runtimeDisposals(), 1);
      c.eq("its own ending", c.endings("pay").at(-1)?.channel, "success");
      c.reload();
      s.state("PLACING");
      c.eq(
        "no Restored: the parked ending is delivered",
        c.endings("pay").some((e) => e.reason === "Restored"),
        false,
      );
      c.eq("a definite ending drops the head", row(s), undefined);
    }));

  it("PAY-16/on-the-wire-at-the-bound-ends-unknown-disposed", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.disposeRuntime();
      c.advance(disposalBoundMs - 1);
      c.eq("within the bound", c.runtimeDisposals(), 0);
      c.advance(1);
      c.eq("the bound ends it", c.runtimeDisposals(), 1);
      c.eq(
        "unknown { Disposed }",
        [c.endings("pay").at(-1)?.channel, lastReason(c, "pay")],
        ["unknown", "Disposed"],
      );
      c.reload();
      s.state("UNSURE");
      c.eq(
        "no Restored: the parked ending is delivered",
        c.endings("pay").some((e) => e.reason === "Restored"),
        false,
      );
    }));

  it("PAY-16/never-answered-waits-for-the-bound", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.disposeRuntime();
      c.answer("pay", Answer.Never());
      c.advance(disposalBoundMs - 1);
      c.eq("a call that never answers has not settled", c.runtimeDisposals(), 0);
      c.eq("not ended within the bound", c.endings("pay").length, 0);
      c.advance(1);
      c.eq("the bound ends it", c.runtimeDisposals(), 1);
      c.eq(
        "unknown { Disposed }",
        [c.endings("pay").at(-1)?.channel, lastReason(c, "pay")],
        ["unknown", "Disposed"],
      );
      c.reload();
      s.state("UNSURE");
      c.eq(
        "no Restored: the parked ending is delivered",
        c.endings("pay").some((e) => e.reason === "Restored"),
        false,
      );
      c.eq("nothing invoked", sent(c, "pay"), 1);
    }));

  it("PAY-16/dispose-waiting-resend", () =>
    play([Pay], (c) => {
      onWire(c);
      c.answer("pay", Answer.Lost());
      c.advance(3000);
      c.answer("order", Answer.Ok({ value: null }));
      c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
      c.disposeRuntime();
      c.eq(
        "no Disposed ending",
        c.endings("pay").some((e) => e.reason === "Disposed"),
        false,
      );
    }));

  it("PAY-16/disposal-ends-with-the-last-fiber", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      s.ensure();
      c.uninterruptible("pay");
      start(s);
      pay(s);
      c.ack();
      c.disposeRuntime();
      c.eq("not yet", c.runtimeDisposals(), 0);
      c.answerLate("pay", CAPTURABLE);
      c.eq("finished when it ended", c.runtimeDisposals(), 1);
      c.reload();
      s.state("PLACING");
    }));

  it("PAY-16/answered-inside-the-bound", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.disposeRuntime();
      c.advance(disposalBoundMs / 2);
      c.answer("pay", CAPTURABLE);
      c.reload();
      s.state("PLACING");
    }));
});
