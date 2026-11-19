import { describe, expectTypeOf, it } from "vite-plus/test";
import { bench } from "../../bench/declare.ts";
import type { Row } from "../../bench/history.ts";

const load = () => Promise.reject(new Error("not loaded"));

describe("a history row's closed fields are literal unions", () => {
  it("power, runtime and the budget state", () => {
    expectTypeOf<Row["power"]>().toEqualTypeOf<"ac" | "battery" | "unknown">();
    expectTypeOf<Row["runtime"]>().toEqualTypeOf<"node" | "bun">();
    expectTypeOf<Row["budget_state"]>().toEqualTypeOf<"" | "ok" | "over">();
    expectTypeOf<Row["tier"]>().toEqualTypeOf<"quick" | "stress" | "full" | "dev">();
  });
});

describe("a bench's id starts with its concern", () => {
  it("an id whose concern disagrees with the declared one", () => {
    const right = bench({
      id: "turn.app.x-ms",
      concern: "turn",
      tags: [],
      size: { n: 1, unit: "run" },
      load,
    });

    expectTypeOf(right.concern).toEqualTypeOf<
      "turn" | "scale" | "persist" | "values" | "startup" | "memory" | "tooling"
    >();

    // @ts-expect-error the id names the memory concern, the bench the turn one
    bench({ id: "memory.app.x-ms", concern: "turn", tags: [], size: { n: 1, unit: "run" }, load });
    // @ts-expect-error the id names no concern
    bench({ id: "nonsense", concern: "turn", tags: [], size: { n: 1, unit: "run" }, load });
  });
});
