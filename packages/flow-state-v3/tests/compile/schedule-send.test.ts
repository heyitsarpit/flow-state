import { describe, expect, it } from "vite-plus/test";
import { definition, FlowError, machine } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";

const Clock = definition({
  id: "Construction/Clock",
  states: ["ON"],
  events: { Off: {} },
  schedules: { ring: {}, off: {} },
});

const Bell = definition({
  id: "Construction/Bell",
  states: ["IDLE"],
  events: { Ring: {}, Off: {} },
});

// Each refusal as [code, reason, path], or none when construction did not refuse.
const refusal = (construct: () => unknown) => {
  try {
    construct();
  } catch (error) {
    if (error instanceof FlowError)
      return error.diagnostics.map(
        (d) => [d.code, d.details["reason"] ?? null, d.path.join(".")] as const,
      );
  }

  return [];
};

describe("a schedule's send at construction (Compile T11)", () => {
  it("Compile T11: a schedule sending another definition's event, of another name or the same, is refused ForeignToken", () => {
    expect(
      refusal(() =>
        machine(Clock, ({ S }) =>
          loose({
            default: S.ON,
            states: {
              ON: {
                schedules: {
                  ring: { schedule: "1 second", send: Bell.E.Ring },
                  off: { schedule: "1 second", send: Bell.E.Off },
                },
              },
            },
          }),
        ),
      ),
    ).toEqual([
      ["InvalidConfiguration", "ForeignToken", "states.ON.schedules.ring.send"],
      ["InvalidConfiguration", "ForeignToken", "states.ON.schedules.off.send"],
    ]);
  });

  it("Compile T11: the machine's own event in a schedule constructs", () => {
    expect(
      refusal(() =>
        machine(Clock, ({ S, E }) => ({
          default: S.ON,
          states: { ON: { schedules: { off: { schedule: "1 second", send: E.Off } } } },
        })),
      ),
    ).toEqual([]);
  });
});
