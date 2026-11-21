import { describe, expectTypeOf, it } from "vite-plus/test";
import { Flow, type Machine } from "../../src/index.ts";

// Inverted pins: each `today` assertion states today's type and fails once declared schedules
// land: make it the type its comment names. The derived reader types (the snapshot's timers, the
// send mapper's key) and their two-sided pins are the typed machine's.

describe("a definition declares its schedules (Types R8; Schedules R16)", () => {
  it("Types R8: a definition carries its schedules' declaration", () => {
    // today: no definition has `schedules`. Flips to `true` once the declaration is the
    // definition's eighth part.
    expectTypeOf<
      "schedules" extends keyof Machine["definition"] ? true : false
    >().toEqualTypeOf<false>();
  });

  it("Types R8: a keyed schedule is declared, so Flow.keyed is gone", () => {
    // today: Flow.keyed wraps a keyed schedule. Flips to `.not.toHaveProperty("keyed")`.
    expectTypeOf(Flow).toHaveProperty("keyed");
  });
});
