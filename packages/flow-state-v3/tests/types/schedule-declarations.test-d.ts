import { describe, expectTypeOf, it } from "vite-plus/test";
import { definition, type Flow, type TimersOf } from "../../src/index.ts";

describe("a definition declares its schedules (Types R8; Schedules R16)", () => {
  it("Types R8: a definition carries its schedules' declaration", () => {
    const Clock = definition({
      id: "types/schedule-declarations/Clock",
      states: ["ON"],
      events: {},
      schedules: { tick: {} },
    });

    expectTypeOf<keyof TimersOf<typeof Clock>>().toEqualTypeOf<"tick">();
  });

  it("Types R8: a schedule with a timer per key is declared, so Flow holds only its markers", () => {
    expectTypeOf<keyof typeof Flow>().toEqualTypeOf<
      "initial" | "input" | "private" | "uncertain" | "entry" | "context"
    >();
  });
});
