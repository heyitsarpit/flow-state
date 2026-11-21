import { describe, expectTypeOf, it } from "vite-plus/test";
import type { Room } from "../../fixtures/home/machines/room.ts";
import type { Recorded } from "../../src/host/testing/index.ts";
import type { Snapshot } from "../../src/index.ts";

// Inverted pins: each `today` assertion states today's wide type and fails once the readers are
// typed from the declaration: replace it with the narrow assertion its comment names, and keep the
// misspelt line beside it as the refused side.

type Names = "reconnect" | "poll" | "check" | "boost";

describe("schedule readers are typed from the declaration (Types R8; Schedules R16)", () => {
  it("Schedules R16: a snapshot's timers are keyed by the declared schedule names", () => {
    // today: any string. Flips to `.toEqualTypeOf<Names>()`, with `"pol"` refused beside it.
    expectTypeOf<keyof Snapshot<typeof Room>["schedules"]>().toEqualTypeOf<string>();
    expectTypeOf<Names>().toExtend<keyof Snapshot<typeof Room>["schedules"]>();
  });

  it("Schedules R16: a Paused record's schedule and reasons are the declared names", () => {
    type Paused = Extract<Recorded<typeof Room>["evidence"][number], { readonly _tag: "Paused" }>;

    // today: both are string. Flip to `Names` and to `"Vacation" | "Saving"`.
    expectTypeOf<Paused["schedule"]>().toEqualTypeOf<string>();
    expectTypeOf<Paused["reasons"][number]>().toEqualTypeOf<string>();
  });
});
