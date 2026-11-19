import { describe, expectTypeOf, it } from "vite-plus/test";
import { definition, type Machine, machine } from "../../src/index.ts";

// Each wrong line is refused under `@ts-expect-error`; beside it the machine's own event in the same
// schedule compiles and is asserted exactly. Construction refuses both at load too
// (tests/compile/construction.test.ts).

const Lamp = definition({ id: "types/Lamp", states: ["ON"], events: { Off: {} }, memory: {} });

const Bell = definition({ id: "types/Bell", states: ["IDLE"], events: { Ring: {} }, memory: {} });

const Other = definition({ id: "types/Other", states: ["A"], events: { Off: {} } });

describe("a schedule's send", () => {
  it("Compile T11: a schedule sending another definition's event is refused", () => {
    expectTypeOf(
      machine(Lamp, ({ S, E }) => ({
        default: S.ON,
        states: { ON: { schedules: { ring: { schedule: "1 second", send: E.Off } } } },
      })),
    ).toEqualTypeOf<Machine<typeof Lamp>>();

    machine(Lamp, ({ S }) => ({
      default: S.ON,
      states: {
        ON: {
          schedules: {
            // @ts-expect-error another definition's event token (Compile R3, R14)
            ring: { schedule: "1 second", send: Bell.E.Ring },
          },
        },
      },
    }));
  });

  it("Compile T11: a schedule sending another definition's event of the same name is refused", () => {
    expectTypeOf(
      machine(Lamp, ({ S, E }) => ({
        default: S.ON,
        states: { ON: { schedules: { off: { schedule: "1 second", send: E.Off } } } },
      })),
    ).toEqualTypeOf<Machine<typeof Lamp>>();

    machine(Lamp, ({ S }) => ({
      default: S.ON,
      // @ts-expect-error Compile R12: another definition's event is no schedule's
      states: { ON: { schedules: { off: { schedule: "1 second", send: Other.E.Off } } } },
    }));
  });
});
