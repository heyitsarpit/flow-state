import { describe, expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/shop/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { Fake } from "../../src/host/testing/index.ts";
import {
  before,
  CHECK,
  endings,
  issues,
  keys,
  lastReason,
  laneFacts,
  onWire,
  row,
  START,
  state,
  steadfastStory,
  VISA,
} from "../checkout.ts";
import { played } from "../rules/played.ts";
import { expectResent, toResend } from "./resend.ts";

const declined = Shop.decline({ code: "x" });

describe("PAY-16 (WriteLanes R2, R3, R5, R8; Restore R3; Turn I12)", () => {
  it("PAY-16/restore-keeps-mayHaveApplied: a re-send after a reload may have applied, so its decline stays unknown", async () => {
    const run = await played(
      onWire("PAY-16/restore-keeps-mayHaveApplied", Shop.confirm.hold())
        .reload()
        .checkpoint("reloaded")
        .world(Fake.storage.hold())
        .advance(CHECK)
        .checkpoint("paying")
        .world(declined, Fake.storage.release())
        .checkpoint("declined"),
    );

    expect(state(run.checkpoints.reloaded)).toBe("UNSURE");
    expect(state(run.checkpoints.paying)).toBe("PAYING");
    expect(lastReason(run.evidence, "pay")).toBe("StillUnknown");
    expect(state(run.checkpoints.declined)).toBe("UNSURE");
  });

  it("PAY-16/timeout-per-send: each send has its own deadline, so a re-send that never answers ends unknown again", async () => {
    const run = await played(
      toResend("PAY-16/timeout-per-send")
        .advance("59999 millis")
        .checkpoint("waiting")
        .advance("1 millis")
        .checkpoint("late"),
    );

    expectResent(run);
    expect(state(run.checkpoints.waiting)).toBe("PAYING");
    expect(state(run.checkpoints.late)).toBe("UNSURE");

    const pay = endings(run.evidence, "pay");

    expect([pay.at(-1)?.channel, pay.length]).toEqual(["unknown", 2]);
  });

  it("PAY-16/resend-refused-capture: a refused capture keeps the hold and spends no retry; the next re-send goes with the same id", async () => {
    const run = await played(
      onWire("PAY-16/resend-refused-capture", Shop.confirm.drop())
        .world(Fake.storage.refuse())
        .advance(CHECK)
        .checkpoint("refused")
        .world(Fake.storage.hold())
        .advance(CHECK)
        .checkpoint("paying")
        .world(Shop.placeOrder.hold(), Fake.storage.release())
        .checkpoint("placing"),
    );

    const { refused, paying, placing } = run.checkpoints;

    expect(state(refused)).toBe("UNSURE");
    expect(lastReason(before(run, "refused"), "pay")).toBe("StorageRefused");
    expect(row(refused)?.uncertain).toBe(true);
    expect(row(refused)?.retryCount).toBe(0);
    expect(state(paying)).toBe("PAYING");
    expect(placing.read(Shop.confirm)).toHaveLength(2);
    expect(keys(placing)).toBe(1);
    expect(state(placing)).toBe("PLACING");
  });

  it("PAY-16/retry-count-persists: a raised retry count survives a reload", async () => {
    const run = await played(
      toResend("PAY-16/retry-count-persists", Shop.confirm.drop())
        .checkpoint("lost")
        .reload()
        .checkpoint("reloaded"),
    );

    expectResent(run);
    expect(row(run.checkpoints.lost)?.retryCount).toBe(1);
    expect(state(run.checkpoints.reloaded)).toBe("UNSURE");
    expect(row(run.checkpoints.reloaded)?.retryCount).toBe(1);
  });

  it("PAY-16/stale-send-fenced: the late answer of a send whose deadline passed reaches no one; the re-send stays pending", async () => {
    const run = await played(
      steadfastStory("PAY-16/stale-send-fenced")
        .ensure(checkout)
        .send(checkout, START)
        .world(Shop.confirm.hold())
        .send(checkout, VISA)
        .advance("60 seconds")
        .checkpoint("late")
        .world(Shop.confirm.hold())
        .advance(CHECK)
        .checkpoint("resent")
        .world(Shop.confirm.release())
        .checkpoint("stale"),
    );

    const { late, resent, stale } = run.checkpoints;

    expect(state(late)).toBe("UNSURE");
    expect(resent.read(Shop.confirm)).toHaveLength(2);
    expect(state(stale)).toBe("PAYING");
    expect(row(stale)?.pending).toBe(true);
  });

  it("PAY-16/schedule-reads-after-memory: Turn I12: WAITING's retry delay is read from the memory after the turn (500 ms), not before it", async () => {
    const run = await played(
      onWire("PAY-16/schedule-reads-after-memory", Shop.busy({ retryAfterMs: 500 }))
        .checkpoint("waiting")
        .world(Shop.confirm.hold())
        .advance("499 millis")
        .checkpoint("499")
        .advance("1 millis")
        .checkpoint("500"),
    );

    expect(state(run.checkpoints.waiting)).toBe("WAITING");
    expect(state(run.checkpoints["499"])).toBe("WAITING");
    expect(state(run.checkpoints["500"])).toBe("PAYING");
  });

  it("PAY-16/read-defect-issue: a read that dies is a Defect issue and a Defect failure", async () => {
    const run = await played(
      onWire("PAY-16/read-defect-issue", Shop.confirm.drop())
        .world(Shop.crash({ endpoint: "intent" }))
        .advance(CHECK)
        .checkpoint("read"),
    );

    expect(issues(run.evidence)).toEqual(["Defect"]);
    expect(lastReason(run.evidence, "intent")).toBe("Defect");
  });

  it("PAY-16/superseded-read: a newer read interrupts the older one", async () => {
    const run = await played(
      onWire("PAY-16/superseded-read", Shop.confirm.drop())
        .world(Shop.intent.hold(), Shop.intent.hold())
        .advance(CHECK)
        .checkpoint("first")
        .advance(CHECK)
        .checkpoint("second")
        .world(Shop.intent.release())
        .checkpoint("released"),
    );

    const { first, second, released } = run.checkpoints;

    expect(first.read(Shop.intent)).toHaveLength(1);
    expect(second.read(Shop.intent)).toHaveLength(2);
    expect(released.read(Shop.intent).map((c) => c.status)).toEqual(["handled", "held at request"]);
    expect(laneFacts(run.evidence, "Superseded")).toBeGreaterThan(0);
  });
});
