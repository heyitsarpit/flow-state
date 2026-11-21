import { describe, expectTypeOf, it } from "vite-plus/test";
import { Schema } from "effect";
import { definition, Flow, type Machine, machine } from "../../src/index.ts";

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

  it("Types R8: a schedule's name, key and reasons come only from the declaration", () => {
    const Plain = definition({
      id: "types/declarations/Plain",
      states: ["OFF"],
      events: {},
      internalEvents: { Tick: { attempt: Schema.Number } },
    });

    // today: a body names any schedule and any pause reason, its key inferred from `keys`. Once
    // the declaration is the one source, this body fails to compile: `tick` is undeclared; then
    // turn it into a two-sided pin against a declared `tick`.
    void machine(Plain, ({ S, E }) => ({
      default: S.OFF,
      states: {
        OFF: {
          schedules: {
            tick: {
              schedule: 1000,
              send: E.Tick.from(({ attempt }) => ({ attempt })),
              paused: { Anything: () => false },
            },
          },
        },
      },
    }));
  });
});
