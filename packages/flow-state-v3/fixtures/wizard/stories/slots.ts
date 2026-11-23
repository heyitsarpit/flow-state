import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { booking, picker, wizardGrownSetup } from "../app.ts";
import { SlotPicker } from "../machines/slot-picker.ts";
import { Inspections } from "../server/booking.ts";
import { BookingFake } from "../server/layer.ts";

/**
 * The grown wizard app over its booking port fake, with the booking and the picker ensured.
 */
export const slotsStory = (id: string) =>
  Story.app(wizardGrownSetup, { id, fixtures: [BookingFake] })
    .ensure(booking)
    .ensure(picker);

const DAY = "1970-01-02";

/**
 * A postcode typed loosely finds its area; typed again ten minutes on, it is shown from what was
 * read; the day lists two slots; the nine o'clock is held and the booking hears it.
 */
export const slotsUsual = slotsStory("wizard/slots-usual")
  .send(picker, SlotPicker.E.Postcode({ text: " sw1a  1aa " }))
  .checkpoint("located")
  .advance("10 minutes")
  .send(picker, SlotPicker.E.Postcode({ text: "SW1A 1AA" }))
  .checkpoint("located again")
  .send(picker, SlotPicker.E.Day({ day: DAY }))
  .checkpoint("listed")
  .send(picker, SlotPicker.E.Pick({ slot: `${DAY}T09:00` }))
  .checkpoint("held");

/**
 * One day's slots, then another's: the first day's read, kept no time, goes as soon as nobody
 * shows it.
 */
export const dayChanged = slotsStory("wizard/day-changed")
  .send(picker, SlotPicker.E.Postcode({ text: "SW1A 1AA" }))
  .send(picker, SlotPicker.E.Day({ day: DAY }))
  .send(picker, SlotPicker.E.Day({ day: "1970-01-03" }))
  .checkpoint("moved");

/**
 * Another customer books the nine o'clock between the listing and the pick: the hold fails Taken,
 * naming the slot from the hold's own input, and the day is listed again.
 */
export const slotTaken = slotsStory("wizard/slot-taken")
  .send(picker, SlotPicker.E.Postcode({ text: "SW1A 1AA" }))
  .send(picker, SlotPicker.E.Day({ day: DAY }))
  .world(Inspections.book({ area: "london", slot: `${DAY}T09:00` }))
  .send(picker, SlotPicker.E.Pick({ slot: `${DAY}T09:00` }))
  .checkpoint("taken");

/**
 * A postcode of spaces only: the area read's input fails its Schema, so nothing is asked of the
 * booking service and the read ends as a Defect.
 */
export const blankPostcode = slotsStory("wizard/blank-postcode")
  .send(picker, SlotPicker.E.Postcode({ text: "   " }))
  .checkpoint("refused");

/**
 * A postcode the service does not cover, then an hour passes: the failed read is not asked again.
 */
export const uncoveredNotRetried = slotsStory("wizard/uncovered-not-retried")
  .send(picker, SlotPicker.E.Postcode({ text: "ZZ1 1ZZ" }))
  .checkpoint("uncovered")
  .advance("1 hour")
  .checkpoint("an hour on");

/**
 * Two picks while the first hold is out: the second is not sent.
 */
export const doublePick = slotsStory("wizard/double-pick")
  .send(picker, SlotPicker.E.Postcode({ text: "SW1A 1AA" }))
  .send(picker, SlotPicker.E.Day({ day: DAY }))
  .world(Inspections.hold.hold())
  .send(picker, SlotPicker.E.Pick({ slot: `${DAY}T09:00` }))
  .send(picker, SlotPicker.E.Pick({ slot: `${DAY}T11:00` }))
  .checkpoint("refused")
  .world(Inspections.hold.release())
  .checkpoint("held");

/**
 * Every slot picker Story, by name.
 */
export const slotStories = {
  slotsUsual,
  dayChanged,
  slotTaken,
  blankPostcode,
  uncoveredNotRetried,
  doublePick,
};

/**
 * What a customer and the booking service can do around the slot picker, for generated runs: type
 * postcodes (loose, blank and uncovered), choose days (one with no slots), pick slots; others book.
 */
export const slotSamples = samplesOf({
  id: "wizard-slots",
  story: Story.app(wizardGrownSetup, { id: "wizard-slots/samples", fixtures: [BookingFake] }),
  names: { setup: "wizardGrownSetup", fixtures: ["BookingFake"] },
  actors: { booking, picker },
  servers: { Inspections },
  failures: [Inspections.book({ area: "london", slot: `${DAY}T09:00` })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(picker, SlotPicker.E.Postcode({ text: " sw1a  1aa " }))
      .send(picker, SlotPicker.E.Postcode({ text: "   " }))
      .send(picker, SlotPicker.E.Postcode({ text: "ZZ1 1ZZ" }))
      .send(picker, SlotPicker.E.Day({ day: DAY }))
      .send(picker, SlotPicker.E.Day({ day: "1970-01-03" }))
      .send(picker, SlotPicker.E.Pick({ slot: `${DAY}T09:00` }))
      .send(picker, SlotPicker.E.Pick({ slot: `${DAY}T11:00` })),
});
