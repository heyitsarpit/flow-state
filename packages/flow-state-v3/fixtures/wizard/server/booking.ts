import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { NoResponse, Taken, Uncovered } from "../services.ts";

const BookingTruth = Schema.Struct({
  areas: Schema.Record(Schema.String, Schema.String),
  open: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  holds: Schema.Record(Schema.String, Schema.String),
});

type Truth = typeof BookingTruth.Type;

const HOLD_MS = 600_000;

const dayOf = (slot: string) => slot.slice(0, 10);

/**
 * The booking service's truth: the area of each covered postcode, each area's open slots by day
 * (`<area>|<day>`), and each hold by idempotency key, replayed for a key it has seen. `SW1A 1AA` is
 * in `london`, which has two slots on 1970-01-02.
 */
export const Inspections = Fake.server("Inspections", {
  truth: BookingTruth,
  initial: {
    areas: { "SW1A 1AA": "london" },
    open: { "london|1970-01-02": ["1970-01-02T09:00", "1970-01-02T11:00"] },
    holds: {},
  },
  endpoints: {
    area: Fake.call({
      request: { postcode: Schema.String },
      success: Schema.Struct({ area: Schema.String }),
      failure: Uncovered,
      handle: (truth: Truth, { postcode }) => {
        const found = truth.areas[postcode];

        return found === undefined
          ? { truth, exit: Exit.fail(new Uncovered()) }
          : { truth, exit: Exit.succeed({ area: found }) };
      },
    }),
    slots: Fake.call({
      request: { area: Schema.String, day: Schema.String },
      success: Schema.Struct({ slots: Schema.Array(Schema.String) }),
      failure: Schema.Never,
      handle: (truth: Truth, { area, day }) => ({
        truth,
        exit: Exit.succeed({ slots: truth.open[`${area}|${day}`] ?? [] }),
      }),
    }),
    hold: Fake.call({
      request: { area: Schema.String, slot: Schema.String, key: Schema.String },
      success: Schema.Struct({ heldUntil: Schema.Number }),
      failure: Taken,
      handle: (truth: Truth, { area, slot, key }) => {
        if (truth.holds[key] === slot) return { truth, exit: Exit.succeed({ heldUntil: HOLD_MS }) };

        const open = truth.open[`${area}|${dayOf(slot)}`] ?? [];

        if (!open.includes(slot)) return { truth, exit: Exit.fail(new Taken()) };

        return {
          truth: {
            ...truth,
            open: { ...truth.open, [`${area}|${dayOf(slot)}`]: open.filter((s) => s !== slot) },
            holds: { ...truth.holds, [key]: slot },
          },
          exit: Exit.succeed({ heldUntil: HOLD_MS }),
        };
      },
    }),
  },
  controls: {
    book: Fake.control(
      { area: Schema.String, slot: Schema.String },
      (truth: Truth, { area, slot }) => ({
        ...truth,
        open: {
          ...truth.open,
          [`${area}|${dayOf(slot)}`]: (truth.open[`${area}|${dayOf(slot)}`] ?? []).filter(
            (s) => s !== slot,
          ),
        },
      }),
    ),
  },
  lost: () => new NoResponse(),
});
