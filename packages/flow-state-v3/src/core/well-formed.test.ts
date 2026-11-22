import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { compiledOf } from "../compiled-of.ts";
import { definition } from "../definition.ts";
import { machine } from "../machine.ts";
import { loose } from "../test/loose.ts";
import { malformedOf } from "./well-formed.ts";

// The public path refuses a hand-made Compiled as a copy at the door, before a Runtime reads it, so
// the Runtime's own check is shown here, on the Compiled it is handed.

const Lamp = definition({
  id: "WellFormed/Lamp",
  states: ["OFF", "ON"],
  events: { Dim: { level: Schema.Number } },
});

const compiled = compiledOf(
  machine(Lamp, ({ S }) => ({
    default: S.OFF,
    on: { Dim: { guard: ({ event }) => event.level >= 0 || true } },
  })),
);

const verdictOf = (handed: unknown) =>
  Option.map(malformedOf(loose(handed)), ({ path, details }) => [
    details?.["reason"],
    path.join("."),
  ]);

describe("a Runtime runs only Slots (Compile R17, T8)", () => {
  it("Compile R17: a Compiled holding a function that is not a Slot is refused BareFunction at its path; machine()'s own is not", () => {
    const [first] = [...(compiled.root.get("Dim") ?? [])];

    expect({
      own: verdictOf(compiled),
      bare: verdictOf({
        ...compiled,
        root: new Map([["Dim", [{ ...first, update: Option.some(() => ({})) }]]]),
      }),
    }).toEqual({
      own: Option.none(),
      bare: Option.some(["BareFunction", "machines.WellFormed/Lamp.root.Dim.0.update.value"]),
    });
  });
});
