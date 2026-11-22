import { describe, expectTypeOf, it } from "vite-plus/test";
import type { Room } from "../../fixtures/home/machines/room.ts";
import type { Recorded } from "../../src/host/testing/index.ts";
import type { Snapshot } from "../../src/index.ts";

// Schedule readers are typed from the declaration: each narrow assertion beside its misspelt line,
// the refused side.

type Names = "reconnect" | "poll" | "check" | "boost" | "ping";

describe("schedule readers are typed from the declaration (Types R8; Schedules R16)", () => {
  it("Schedules R16: a snapshot's timers are keyed by the declared schedule names", () => {
    expectTypeOf<keyof Snapshot<typeof Room>["schedules"]>().toEqualTypeOf<Names>();
    expectTypeOf<"pol">().not.toExtend<keyof Snapshot<typeof Room>["schedules"]>();
  });

  it("Schedules R16: a Paused record's schedule and reasons are the declared names", () => {
    type Paused = Extract<Recorded<typeof Room>["evidence"][number], { readonly _tag: "Paused" }>;

    expectTypeOf<Paused["schedule"]>().toEqualTypeOf<Names>();
    expectTypeOf<Paused["reasons"][number]>().toEqualTypeOf<"Vacation" | "Saving" | "Away">();
    expectTypeOf<"Vacaton">().not.toExtend<Paused["reasons"][number]>();
  });
});
