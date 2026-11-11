import { Schema } from "effect";
import { Empty, type Fixture, writeOf } from "./fixture.ts";
import { guarded, to, updating } from "./handlers.ts";
import { classifyWith, row } from "./reference.ts";

const Key = Schema.Struct({ k: Schema.String, region: Schema.optionalKey(Schema.String) });

const stay = to("root");

/**
 * `Lab/KeyStamp` (`keyStampFixture` in `prototypes/conformance/typed/round13.ts`) under `reject`:
 * one write, `charge`, keyed by `k` at release 1 and by `k` and `region` at release 2, so a lane
 * held at release 1 is an old-version hold at release 2 (WriteLanes R11). The suite's reference
 * names release 1's key; a case upgrades with `upgrade(2)`.
 */
export const Stamp = {
  name: "stamp",
  machine: "Lab/KeyStamp",
  events: {
    Go: Key,
    Guarded: Key,
    Retry: Key,
    Cancel: Key,
    Retryable: Key,
    OldRetry: Key,
    OldCancel: Key,
    OldRetryable: Key,
  },
  memory: Schema.Struct({
    unsure: Schema.Number,
    declined: Schema.Number,
    guardedOut: Schema.Number,
    oks: Schema.Number,
    why: Schema.String,
    notRetryable: Schema.Number,
  }),
  input: Empty,
  states: ["root"] as const,
  operations: {
    charge: writeOf(Schema.Struct({ k: Schema.String }), {
      concurrency: "reject",
      releasesOnLeave: [],
      success: "Ok",
      failure: { NotSent: "No" },
      unknown: { event: "Unsure" },
      classify: classifyWith(() => false),
    }),
  },
  rows: [row("Go", "any", "same", [{ operation: "charge", kind: "commit" }])],
  handlers: {
    initial: "root",
    root: {
      Go: [stay],
      Ok: [updating(stay)],
      No: [updating(stay)],
      Unsure: [updating(stay)],
      Guarded: [guarded(stay), updating(stay)],
      Retry: [stay],
      Cancel: [stay],
      Retryable: [guarded(stay), updating(stay)],
      OldRetry: [stay],
      OldCancel: [stay],
      OldRetryable: [guarded(stay), updating(stay)],
    },
    states: {},
    schedules: {},
    parts: {},
  },
} satisfies Fixture;
