import { describe, expect, it } from "vite-plus/test";
import { booking } from "../../fixtures/wizard/app.ts";
import { Booking } from "../../fixtures/wizard/machines/booking.ts";
import {
  expired,
  extendBurst,
  extendedLate,
  holdEdges,
  reloadedPastHold,
  usual,
} from "../../fixtures/wizard/stories/usual.ts";
import { turnsOf } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";
import { timersOf } from "../timers.ts";

describe("a held slot's expiry (Turn R14, R15, R17)", () => {
  it.fails("Turn R14: Extended, an armOn token beside Flow.entry, restarts both timers from the new end; disarmOn stops the warning", async () => {
    const run = await played(usual);

    expect(timersOf(run.checkpoints.held.read(booking))).toEqual({
      expire: { dueAt: 600_000 },
      warn: { dueAt: 480_000 },
    });
    expect(run.checkpoints.warned.read(booking)?.memory.warning).toBe(true);
    expect(timersOf(run.checkpoints.dismissed.read(booking))).toEqual({
      expire: { dueAt: 600_000 },
    });
    expect(run.checkpoints["warned again"].read(booking)?.state).toBe("HELD");
    expect(run.checkpoints["warned again"].read(booking)?.memory.warning).toBe(true);
    expect(timersOf(run.checkpoints["warned again"].read(booking))).toEqual({
      expire: { dueAt: 900_000 },
    });
    expect(run.checkpoints.booked.read(booking)?.state).toBe("BOOKED");
    expect(timersOf(run.checkpoints.booked.read(booking))).toEqual({});
  });

  it.fails("Machines O8: a snapshot's schedules are a record by name, each `{ dueAt }` while running", async () => {
    const run = await played(usual);

    expect(run.checkpoints.held.read(booking)?.schedules).toEqual({
      expire: { dueAt: 600_000 },
      warn: { dueAt: 480_000 },
    });
  });

  it("Turn R14: a hold that runs out releases the slot, and the quote picks again", async () => {
    const run = await played(expired);

    expect(run.checkpoints.expired.read(booking)).toEqual(
      expect.objectContaining({
        state: "EXPIRED",
        memory: expect.objectContaining({ slotId: "" }),
      }),
    );
    expect(run.checkpoints.picking.read(booking)?.state).toBe("PICKING");
  });

  it("Turn R17: deadlines that came due while the booking was unused fire once each, in deadline order, when it is opened again", async () => {
    const run = await played(reloadedPastHold);

    expect(run.checkpoints["expired once"].read(booking)?.state).toBe("EXPIRED");
    expect(turnsOf(run, Booking.E.Warned)).toHaveLength(1);
    expect(turnsOf(run, Booking.E.Expired)).toHaveLength(1);
  });

  it.fails("Turn R14: an extension inside the warning window gives the warning a negative computed delay, so it shows on the next turn", async () => {
    const run = await played(extendedLate);

    expect(run.checkpoints.extended.read(booking)?.memory.warning).toBe(false);
    expect(timersOf(run.checkpoints.extended.read(booking))).toEqual({
      expire: { dueAt: 630_000 },
      warn: { dueAt: 540_000 },
    });
    expect(run.checkpoints["warned at once"].read(booking)?.memory.warning).toBe(true);
  });

  it.fails("Turn R14, R15 (fixtures.md E5): holds ending −1 ms and 0 ms on expire on the next turn, the expiry first by declaration order, so the warning never fires", async () => {
    const run = await played(holdEdges);

    expect(run.checkpoints["minus one"].read(booking)?.state).toBe("EXPIRED");
    expect(run.checkpoints.zero.read(booking)?.state).toBe("EXPIRED");
    expect(turnsOf(run, Booking.E.Warned)).toEqual([]);
  });

  it("Turn R14 (fixtures.md E5): a hold 2^31 ms on refuses the Held turn; one 2^31 − 1 ms on is held", async () => {
    const run = await played(holdEdges);

    expect(run.checkpoints.past.read(booking)?.state).not.toBe("HELD");
    expect(run.checkpoints.longest.read(booking)?.state).toBe("HELD");
    expect(timersOf(run.checkpoints.longest.read(booking))).toEqual(
      expect.objectContaining({ expire: { dueAt: 2 ** 31 - 1 } }),
    );
  });

  it.fails("Turn R14 (fixtures.md L5): 200 extensions faster than turns restart the hold each time, and it expires once at the last end", async () => {
    const run = await played(extendBurst);

    expect(timersOf(run.checkpoints.extended.read(booking))).toEqual({
      expire: { dueAt: 799_000 },
      warn: { dueAt: 679_000 },
    });
    expect(run.checkpoints.expired.read(booking)?.state).toBe("EXPIRED");
    expect(turnsOf(run, Booking.E.Expired)).toHaveLength(1);
  });
});
