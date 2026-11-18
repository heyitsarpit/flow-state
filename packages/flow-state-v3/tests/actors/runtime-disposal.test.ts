import { RuntimeDefaults } from "../../src/index.ts";
import { describe, expect, it } from "vite-plus/test";
import { cellsCheckout } from "../../fixtures/cells/app.ts";
import { cellsStory } from "../../fixtures/cells/stories/usual.ts";
import { serializeClient } from "../../fixtures/lanes/app.ts";
import { lanesStory } from "../../fixtures/lanes/stories/usual.ts";
import { checkout } from "../../fixtures/shop/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { shopStory } from "../../fixtures/shop/stories/usual.ts";
import { Git } from "../../fixtures/services/git/server/git.ts";
import { Fake } from "../../src/host/testing/index.ts";
import {
  before,
  CHECK,
  disposals,
  endings,
  issues,
  lastReason,
  ONE_MILLI,
  onWire,
  type Records,
  row,
  SHORT_OF_BOUND,
  START,
  state,
  steadfastStory,
  VISA,
} from "../checkout.ts";
import { played } from "../rules/played.ts";
import { switchedOn } from "../switches.ts";

const SYNC = { _tag: "Commit", repo: "flow" } as const;

// How many times a turn heard an ending as this event.
const heard = (records: Records, event: string) =>
  records.filter((e) => e._tag === "Delivered" && e.event === event).length;

// An ending made at the bound is not written, so the reload hears the head it wrote, unknown
// Restored, once (Actors R23).
const restoredOnce = (records: Records) =>
  endings(records, "pay").filter((e) => e.reason === "Restored").length === 1;

const restoredAfter = (records: Records) =>
  endings(records, "pay").some((e) => e.reason === "Restored");

describe("PAY-13 (Actors R22, R23, I29, I30; WriteAhead R14)", () => {
  it("PAY-13/hung-commit: a charge the network will not interrupt ends unknown Disposed at the bound", async () => {
    const run = await played(
      steadfastStory("PAY-13/hung-commit")
        .ensure(checkout)
        .send(checkout, START)
        .world(Shop.confirm.hold())
        .send(checkout, VISA)
        .disposeRuntime()
        .checkpoint("disposing")
        .advance(RuntimeDefaults.disposalBound)
        .checkpoint("disposed")
        .reload()
        .checkpoint("reloaded"),
    );

    expect(disposals(before(run, "disposing"))).toBe(0);
    expect(disposals(before(run, "disposed"))).toBe(1);
    expect(state(run.checkpoints.reloaded)).toBe("UNSURE");
    expect(lastReason(before(run, "disposed"), "pay")).toBe("Disposed");
    expect(restoredOnce(run.evidence)).toBe(true);
  });

  it("PAY-13/waiting-flushed: the disposal ends once its last write is answered; the unsent charge ends Disposed", async () => {
    const run = await played(
      shopStory("PAY-13/waiting-flushed")
        .ensure(checkout)
        .send(checkout, START)
        .world(Fake.storage.hold())
        .send(checkout, VISA)
        .disposeRuntime()
        .world(Fake.storage.release())
        .checkpoint("disposed")
        .reload()
        .checkpoint("reloaded"),
    );

    const { disposed, reloaded } = run.checkpoints;

    expect(disposals(before(run, "disposed"))).toBe(1);
    expect(disposed.read(Shop.confirm)).toHaveLength(0);
    expect(state(reloaded)).toBe("CARD");
    expect(lastReason(run.evidence, "pay")).toBe("Disposed");
    expect(reloaded.read(Shop.confirm)).toHaveLength(0);
  });

  it("Actors R22, I29: a never-sent head at disposal ends once and leaves no lane record after the reload (WriteAhead I21)", async () => {
    const run = await played(
      shopStory("Actors R22 never-sent head")
        .ensure(checkout)
        .send(checkout, START)
        .world(Fake.storage.hold())
        .send(checkout, VISA)
        .disposeRuntime()
        .world(Fake.storage.release())
        .reload()
        .ensure(checkout)
        .checkpoint("reloaded"),
    );

    const { reloaded } = run.checkpoints;
    const disposed = endings(run.evidence, "pay").filter((e) => e.reason === "Disposed");

    expect(disposed).toHaveLength(1);
    expect([...reloaded.records.stored.keys()].filter((k) => k.startsWith("lane/"))).toEqual([]);
    expect(reloaded.inspection.owed).toEqual([]);
  });

  it("PAY-13/waiting-flush-lost: with nothing on disk there is no Restored after the Disposed ending", async () => {
    const run = await played(
      shopStory("PAY-13/waiting-flush-lost")
        .ensure(checkout)
        .send(checkout, START)
        .world(Fake.storage.hold())
        .send(checkout, VISA)
        .disposeRuntime()
        .reload()
        .checkpoint("reloaded"),
    );

    const { reloaded } = run.checkpoints;

    expect(state(reloaded)).toBe("CARD");
    expect(lastReason(run.evidence, "pay")).toBe("Disposed");
    expect(reloaded.read(Shop.confirm)).toHaveLength(0);
  });
});

describe("PAY-15 disposal on Cells (Actors R22, I29; Restore I6)", () => {
  const unsure = (id: string) =>
    cellsStory(id)
      .ensure(cellsCheckout)
      .send(cellsCheckout, START)
      .world(Shop.confirm.drop())
      .send(cellsCheckout, VISA);

  it("PAY-15/dispose-held: a Held head survives the disposal and is restored Held", async () => {
    const run = await played(
      unsure("PAY-15/dispose-held")
        .disposeRuntime()
        .checkpoint("disposed")
        .reload()
        .checkpoint("reloaded"),
    );

    expect(disposals(before(run, "disposed"))).toBe(1);
    expect(state(run.checkpoints.reloaded, cellsCheckout)).toBe("UNSURE");
    expect(row(run.checkpoints.reloaded, cellsCheckout)?.uncertain).toBe(true);
  });

  it("PAY-15/dispose-held-moved: the boot delivers the Held head's unknown Restored after the shopper moved on", async () => {
    const run = await played(
      unsure("PAY-15/dispose-held-moved")
        .send(cellsCheckout, VISA)
        .checkpoint("paying")
        .disposeRuntime()
        .reload()
        .checkpoint("reloaded"),
    );

    expect(state(run.checkpoints.paying, cellsCheckout)).toBe("PAYING");
    expect(row(run.checkpoints.reloaded, cellsCheckout)?.uncertain).toBe(true);
    expect(state(run.checkpoints.reloaded, cellsCheckout)).toBe("UNSURE");
  });

  it("Actors I43: a refused final write reports StorageFailure before the disposal ends", async () => {
    const run = await cellsStory("Actors I43 refused final write")
      .ensure(cellsCheckout)
      .send(cellsCheckout, START)
      .world(Fake.storage.refuse())
      .disposeRuntime()
      .advance(RuntimeDefaults.disposalBound)
      .run();

    const ended = run.evidence.findIndex((e) => e._tag === "RuntimeDisposed");
    const failed = run.evidence.findIndex((e) => e._tag === "Issue" && e.code === "StorageFailure");

    expect(ended >= 0).toBe(true);
    expect(failed >= 0 && failed < ended).toBe(true);
  });
});

describe("PAY-16 disposal (Actors R22, I29, I30, I31; WriteAhead R14)", () => {
  it("PAY-16/settled-during-disposal-parked: a charge that settles inside the bound delivers its own ending at the boot", async () => {
    const run = await played(
      onWire("PAY-16/settled-during-disposal-parked", Shop.confirm.hold())
        .disposeRuntime()
        .checkpoint("disposing")
        .world(Shop.confirm.release())
        .checkpoint("disposed")
        .world(Shop.placeOrder.hold())
        .reload()
        .checkpoint("reloaded"),
    );

    const { reloaded } = run.checkpoints;

    expect(disposals(before(run, "disposing"))).toBe(0);
    expect(disposals(before(run, "disposed"))).toBe(1);
    expect(endings(before(run, "disposed"), "pay").at(-1)?.channel).toBe("success");
    expect(state(reloaded)).toBe("PLACING");
    expect(restoredAfter(run.evidence)).toBe(false);
    expect(row(reloaded)).toBeUndefined();
  });

  it("PAY-16/on-the-wire-at-the-bound-ends-unknown-disposed: a call never answered waits for the bound", async () => {
    const run = await played(
      onWire("PAY-16/on-the-wire-at-the-bound", Shop.confirm.hold())
        .disposeRuntime()
        .advance(SHORT_OF_BOUND)
        .checkpoint("within")
        .advance(ONE_MILLI)
        .checkpoint("bound")
        .reload()
        .checkpoint("reloaded"),
    );

    const pay = endings(before(run, "bound"), "pay");

    expect(disposals(before(run, "within"))).toBe(0);
    expect(endings(before(run, "within"), "pay")).toHaveLength(0);
    expect(disposals(before(run, "bound"))).toBe(1);
    expect([pay.at(-1)?.channel, pay.at(-1)?.reason]).toEqual(["unknown", "Disposed"]);
    expect(state(run.checkpoints.reloaded)).toBe("UNSURE");
    expect(restoredOnce(run.evidence)).toBe(true);
    expect(run.checkpoints.reloaded.read(Shop.confirm)).toHaveLength(1);
  });

  // The same Story as the test above, whose checks it now holds; it runs again on its own with
  // FLOW_TWIN_RUNS=true.
  it.skipIf(!switchedOn("FLOW_TWIN_RUNS"))(
    "PAY-16/never-answered-waits-for-the-bound",
    async () => {
      const run = await played(
        onWire("PAY-16/never-answered", Shop.confirm.hold())
          .disposeRuntime()
          .advance(SHORT_OF_BOUND)
          .checkpoint("within")
          .advance(ONE_MILLI)
          .checkpoint("bound")
          .reload()
          .checkpoint("reloaded"),
      );

      const pay = endings(before(run, "bound"), "pay");

      expect(disposals(before(run, "within"))).toBe(0);
      expect(endings(before(run, "within"), "pay")).toHaveLength(0);
      expect(disposals(before(run, "bound"))).toBe(1);
      expect([pay.at(-1)?.channel, pay.at(-1)?.reason]).toEqual(["unknown", "Disposed"]);
      expect(state(run.checkpoints.reloaded)).toBe("UNSURE");
      expect(restoredOnce(run.evidence)).toBe(true);
      expect(run.checkpoints.reloaded.read(Shop.confirm)).toHaveLength(1);
    },
  );

  it("PAY-16/dispose-waiting-resend: a re-send waiting for its capture at the disposal does not end Disposed", async () => {
    const run = await played(
      onWire("PAY-16/dispose-waiting-resend", Shop.confirm.drop())
        .world(Fake.storage.hold())
        .advance(CHECK)
        .disposeRuntime()
        .checkpoint("disposing"),
    );

    expect(endings(run.evidence, "pay").some((e) => e.reason === "Disposed")).toBe(false);
  });

  it("PAY-16/disposal-ends-with-the-last-fiber: a charge the network will not interrupt ends the disposal when it ends", async () => {
    const run = await played(
      steadfastStory("PAY-16/disposal-ends-with-the-last-fiber")
        .ensure(checkout)
        .send(checkout, START)
        .world(Shop.confirm.hold())
        .send(checkout, VISA)
        .disposeRuntime()
        .checkpoint("disposing")
        .world(Shop.confirm.release())
        .checkpoint("disposed")
        .world(Shop.placeOrder.hold())
        .reload()
        .checkpoint("reloaded"),
    );

    expect(disposals(before(run, "disposing"))).toBe(0);
    expect(disposals(before(run, "disposed"))).toBe(1);
    expect(state(run.checkpoints.reloaded)).toBe("PLACING");
  });

  it("PAY-16/answered-inside-the-bound: an answer inside the bound is delivered after the boot", async () => {
    const run = await played(
      onWire("PAY-16/answered-inside-the-bound", Shop.confirm.hold())
        .disposeRuntime()
        .advance("2500 millis")
        .world(Shop.confirm.release(), Shop.placeOrder.hold())
        .reload()
        .checkpoint("reloaded"),
    );

    expect(state(run.checkpoints.reloaded)).toBe("PLACING");
  });
});

describe("the final write (Actors R23, I43, I44)", () => {
  it("Actors R23: with nothing left to write, the disposal ends at once with no StorageFailure", async () => {
    const run = await played(
      shopStory("Actors R23 nothing to write").disposeRuntime().checkpoint("disposed"),
    );

    expect(disposals(before(run, "disposed"))).toBe(1);
    expect(issues(run.evidence)).toEqual([]);
  });

  it("Actors R23: the disposal does not end before its final write is answered", async () => {
    const run = await played(
      shopStory("Actors R23 final write answered")
        .ensure(checkout)
        .world(Fake.storage.hold())
        .send(checkout, START)
        .disposeRuntime()
        .checkpoint("disposing")
        .world(Fake.storage.release())
        .checkpoint("disposed"),
    );

    expect(disposals(before(run, "disposing"))).toBe(0);
    expect(disposals(before(run, "disposed"))).toBe(1);
    expect(issues(run.evidence)).not.toContain("StorageFailure");
  });

  it("Actors I43: a final write still unanswered 5 s after dispose reports StorageFailure, and the disposal ends then", async () => {
    const run = await played(
      shopStory("Actors I43 final write at the bound")
        .ensure(checkout)
        .world(Fake.storage.hold())
        .send(checkout, START)
        .disposeRuntime()
        .advance(SHORT_OF_BOUND)
        .checkpoint("within")
        .advance(ONE_MILLI)
        .checkpoint("bound"),
    );

    const atBound = before(run, "bound");

    expect(disposals(before(run, "within"))).toBe(0);
    expect(issues(before(run, "within"))).not.toContain("StorageFailure");
    expect(disposals(atBound)).toBe(1);
    expect(atBound.map((e) => e._tag).slice(-2)).toEqual(["Issue", "RuntimeDisposed"]);
    expect(issues(atBound)).toEqual(["StorageFailure"]);
  });
});

describe("a commit queued behind a Held head (Actors I38)", () => {
  it("Actors I38: a commit queued behind a Held head ends NotSent Disposed before the disposal ends, and the reload delivers it once", async () => {
    const run = await played(
      lanesStory("Actors I38 queued behind Held")
        .ensure(serializeClient)
        .world(Git.sync.drop())
        .send(serializeClient, SYNC)
        .send(serializeClient, SYNC)
        .disposeRuntime()
        .checkpoint("disposed")
        .reload()
        .ensure(serializeClient)
        .checkpoint("reloaded"),
    );

    const disposed = (records: Records) =>
      endings(records, "sync").filter((e) => e.channel === "notSent" && e.reason === "Disposed");

    expect(disposed(before(run, "disposed"))).toHaveLength(1);
    expect(disposals(before(run, "disposed"))).toBe(1);
    expect(heard(run.evidence, "NotSent")).toBe(1);
    expect(run.checkpoints.reloaded.inspection.owed).toEqual([]);
  });
});
