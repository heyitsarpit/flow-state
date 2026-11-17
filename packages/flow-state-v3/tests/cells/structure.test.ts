import { describe, expect, it } from "vite-plus/test";
import { cellsCheckout } from "../../fixtures/cells/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { emptyIds, longKey } from "../../fixtures/cells/stories/edges.ts";
import {
  disposedOnWire,
  neverSentDisposed,
  reloadedOnWire,
} from "../../fixtures/cells/stories/structure.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

describe("the cell disposed or reloaded mid-pay (fixtures.md S6 under L3)", () => {
  it("Actors R22: a charge on the wire past the disposal's bound ends unknown, and the next incarnation is unsure", async () => {
    const run = await played(disposedOnWire);

    expect(endings(run)[0]).toBe("unknown Disposed");
    expect(run.checkpoints.reloaded.read(cellsCheckout)?.state).toBe("UNSURE");
  });

  it.fails("WriteAhead R14, WriteLanes R10: the parked unknown Disposed is the one ending its Attempt has; the restore hears it, not a new unknown Restored", async () => {
    const run = await played(disposedOnWire);

    expect(endings(run)).toEqual(["unknown Disposed"]);
  });

  it("Actors R22: a charge never sent, waiting for its acknowledgement, ends NotSent Disposed", async () => {
    const run = await played(neverSentDisposed);

    expect(endings(run)[0]).toBe("notSent Disposed");
  });

  it.fails("Actors R22, WriteAhead R14: the parked NotSent Disposed is delivered to the next incarnation as its Attempt's one ending", async () => {
    const run = await played(neverSentDisposed);

    expect(endings(run)).toEqual(["notSent Disposed"]);
    expect(
      run.evidence.filter((e) => e._tag === "Delivered" && e.event === "PayNotSent"),
    ).toHaveLength(1);
  });

  it("WriteAhead R14: a charge on the wire at a reload is heard unknown Restored", async () => {
    const run = await played(reloadedOnWire);

    expect(endings(run)).toEqual(["unknown Restored"]);
    expect(run.checkpoints.reloaded.read(cellsCheckout)?.state).toBe("UNSURE");
  });
});

describe("the cell's ids at their edges (fixtures.md E1, E3)", () => {
  it("E1: an empty cart and intent id pay like any other", async () => {
    const run = await played(emptyIds);

    expect(run.checkpoints.paid.read(cellsCheckout)?.state).toBe("PAID");
  });

  it("E3, Operations O1: an intent id of 100,000 characters is the key of one payment, which is sent once and pays", async () => {
    const run = await played(longKey);

    expect(run.checkpoints.paid.read(cellsCheckout)?.state).toBe("PAID");
    expect(run.end.read(Shop.confirm)).toHaveLength(1);
  });
});
