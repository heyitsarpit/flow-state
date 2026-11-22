import { Option } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { newTimer } from "./schedule-decision.ts";
import { Arming, Outcome, Selection, type Scheduled, type Tracked } from "./timers.ts";
import type { Incarnation, IssueSource, StoredSource } from "./world.ts";

// A schedule's state is built only by its decision, and its issues are never stored (Schedules
// I8, I14, T7): each refused line beside the accepted one.

describe("a schedule's state has one builder and its issues no store (Schedules I8, I14, T7)", () => {
  it("Schedules I14: a stored issue's source can be any source but a schedule's", () => {
    expectTypeOf<Extract<StoredSource, { readonly _tag: "Schedule" }>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<StoredSource, { readonly _tag: "Event" }>>().not.toEqualTypeOf<never>();
    expectTypeOf<Incarnation["issues"][number]["source"]>().toEqualTypeOf<StoredSource>();
    expectTypeOf<IssueSource>().not.toExtend<Incarnation["issues"][number]["source"]>();
  });

  it("Schedules I8: a timer or a schedule's state comes only from the decision, never a literal", () => {
    const fields = {
      name: "t",
      key: Option.none(),
      selection: { _tag: "Read", value: Selection.Unselected() } as const,
      reasons: { _tag: "Read", value: [] } as const,
      arming: Arming.Idle(),
      firing: Outcome.Clean(),
    };

    expectTypeOf(newTimer("t", Option.none())).toEqualTypeOf<Tracked>();
    expectTypeOf(fields).not.toExtend<Tracked>();
    expectTypeOf<{ readonly _tag: "Single"; readonly timer: Tracked }>().not.toExtend<Scheduled>();
  });
});
