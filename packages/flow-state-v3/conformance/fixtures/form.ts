import { noFolds } from "./folds.ts";
import { Option, Schema } from "effect";
import { Empty, type Fixture } from "./fixture.ts";
import { guarded, schedule, to, updating } from "./handlers.ts";

const Strs = Schema.Array(Schema.String);

const stay = to("stay");

/**
 * `Form` (`formFixture` in `prototypes/conformance/typed/lab-machines.ts`): traits with no
 * operations. `check` (a `Field`), `rows` (a `Field.each` over `rowIds`, at most two copies) and
 * `osc` sit on the root; `flash` (a 1 s `expire` schedule) on EDIT. A `Field`'s `whenAbandoned`
 * calls back `onGone`, which the root records in `gone` and `goneRows`; `RefuseChild` raises a
 * `Refuse` the `Field` denies.
 */
export const Form = {
  name: "form",
  machine: "Form",
  events: {
    SetSubject: Schema.Struct({ subject: Schema.String }),
    SetAndRaise: Schema.Struct({ subject: Schema.String }),
    SetIds: Schema.Struct({ ids: Strs }),
    AddAndRaise: Schema.Struct({ key: Schema.String }),
    RaiseGone: Schema.Struct({ key: Schema.String }),
    RefuseChild: Empty,
    Spin: Empty,
    Go: Empty,
    Back: Empty,
  },
  memory: Schema.Struct({
    subject: Schema.String,
    viaPart: Schema.Boolean,
    rowIds: Strs,
    gone: Schema.Array(Schema.Json),
    goneRows: Schema.Array(Schema.Json),
    dirty: Strs,
    spin: Schema.Number,
    kick: Schema.Number,
    spinning: Schema.Boolean,
    resets: Schema.Number,
    flashes: Schema.Number,
    moved: Schema.Boolean,
  }),
  input: Empty,
  states: ["EDIT", "DONE"] as const,
  operations: {},
  rows: [],
  handlers: {
    folds: noFolds,
    initial: "EDIT",
    root: {
      SetSubject: [updating(stay)],
      SetAndRaise: [updating(stay)],
      SetIds: [updating(stay)],
      AddAndRaise: [updating(stay)],
      RaiseGone: [stay],
      RefuseChild: [updating(stay)],
      Spin: [updating(stay)],
      Go: [to("DONE")],
      Back: [to("EDIT")],
    },
    states: {},
    schedules: { EDIT: [schedule("expire", "Expired", Option.some(1000))] },
    parts: {
      Field: {
        Changed: [updating(stay)],
        Clear: [updating(stay)],
        Refuse: [guarded(stay)],
      },
      Flash: { Expired: [stay] },
    },
  },
} satisfies Fixture;
