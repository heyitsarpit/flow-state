import { describe, expect, it } from "vite-plus/test";
import { booking, picker } from "../../fixtures/wizard/app.ts";
import {
  blankPostcode,
  dayChanged,
  doublePick,
  slotsUsual,
  slotTaken,
  uncoveredNotRetried,
} from "../../fixtures/wizard/stories/slots.ts";
import { Inspections } from "../../fixtures/wizard/server/booking.ts";
import { played } from "../rules/played.ts";

// The slot picker's reads and hold. Expected results: an area answer is fresh for an hour, so a
// second ask within it is served with no request (Operations R4, the entry table's fresh view); a
// lookup's input is checked by its Schema at run time, and a refused one owes one Defect row and
// asks nothing (Operations, Slot cells: "input refused by intake"); no cell asks again because the
// last answer failed (R5, NoRetryLoop); a mapper reads its row's input (R2).

describe("the slot picker (Operations R2, R4, R5)", () => {
  it.fails("Operations R4, entry table (Ask Lookup, Idle, fresh): the same postcode within the hour is shown from what was read", async () => {
    const run = await slotsUsual.run();

    expect(run.checkpoints.located.read(picker)?.memory.area).toBe("london");
    expect(run.checkpoints.held.read(booking)?.state).toBe("HELD");
    expect(run.checkpoints["located again"].read(Inspections.area)).toHaveLength(1);
  });

  it.fails("Operations R2: a hold whose slot was taken names the slot from its own input, and the day is listed again", async () => {
    const run = await slotTaken.run();
    const taken = run.checkpoints.taken;

    expect(taken.read(picker)?.memory.notice).toBe("1970-01-02T09:00 was taken");
    expect(taken.read(picker)?.memory.open).toEqual(["1970-01-02T11:00"]);
    expect(taken.read(Inspections.slots)).toHaveLength(2);
  });

  it.fails("Operations, Slot cells (input refused by intake): a blank postcode asks the booking service nothing and ends as a Defect", async () => {
    const run = await blankPostcode.run();

    expect(run.checkpoints.refused.read(Inspections.area)).toEqual([]);
    expect(run.checkpoints.refused.read(picker)?.memory.notice).toBe("offline");
  });

  it("Operations I22, entry table (Last hold left, Idle, gcTime 0): the first day's slots read, left and kept no time, leaves no Collect alarm", async () => {
    const run = await played(dayChanged);

    expect(run.checkpoints.moved.inspection.timers.filter((t) => t.kind === "Collect")).toEqual([]);
  });

  it("Operations R5, NoRetryLoop: an uncovered postcode is not asked again as time passes", async () => {
    const run = await played(uncoveredNotRetried);

    expect(run.checkpoints.uncovered.read(picker)?.memory.notice).toBe("not covered");
    expect(run.checkpoints["an hour on"].read(Inspections.area)).toHaveLength(1);
  });

  it.fails("Operations R2, under reject: a second pick while the first hold is out is not sent, and the first's mapper tells the booking", async () => {
    const run = await doublePick.run();

    expect(run.checkpoints.refused.read(Inspections.hold)).toHaveLength(1);
    expect(run.checkpoints.refused.read(picker)?.memory.notice).toBe("hold Rejected");
    expect(run.checkpoints.held.read(booking)?.state).toBe("HELD");
  });
});
