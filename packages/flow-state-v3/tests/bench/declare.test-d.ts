import { describe, expectTypeOf, it } from "vite-plus/test";
import { bench } from "../../bench/declare.ts";

// Inverted: each line marked `wrong` compiles today. When its carrier lands the line fails the
// check: put `@ts-expect-error` on it. The assertion of today's wide type then fails too: make it
// the exact narrow type.

const load = () => Promise.reject(new Error("not loaded"));

describe("a bench's id starts with its concern", () => {
  it("an id whose concern disagrees with the declared one", () => {
    expectTypeOf<Parameters<typeof bench>[0]["id"]>().toEqualTypeOf<string>();

    bench({ id: "memory.app.x-ms", concern: "turn", tags: [], size: { n: 1, unit: "run" }, load }); // wrong
    bench({ id: "nonsense", concern: "turn", tags: [], size: { n: 1, unit: "run" }, load }); // wrong
    bench({ id: "turn.app.x-ms", concern: "turn", tags: [], size: { n: 1, unit: "run" }, load });
  });
});
