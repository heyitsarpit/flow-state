import { describe, expect, it } from "vite-plus/test";
import { definition, FlowError, machine } from "../../src/index.ts";

const Lamp = definition({ id: "types/Lamp", states: ["ON"], events: { Off: {} }, memory: {} });

const Bell = definition({ id: "types/Bell", states: ["IDLE"], events: { Ring: {} }, memory: {} });

describe("a schedule's send", () => {
  it.fails("Compile T11: a schedule sending another definition's event is refused", () => {
    expect(() =>
      machine(Lamp, ({ S }) => ({
        default: S.ON,
        states: { ON: { schedules: { ring: { schedule: "1 second", send: Bell.E.Ring } } } },
      })),
    ).toThrow(FlowError);
  });
});
