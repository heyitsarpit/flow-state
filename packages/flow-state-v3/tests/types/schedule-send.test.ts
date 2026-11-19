import { describe, expect, it } from "vite-plus/test";
import { definition, machine } from "../../src/index.ts";

const Lamp = definition({ id: "types/Lamp", states: ["ON"], events: { Off: {} }, memory: {} });

const Bell = definition({ id: "types/Bell", states: ["IDLE"], events: { Ring: {} }, memory: {} });

describe("a schedule's send", () => {
  it("Compile T11: a schedule sending another definition's event is refused", () => {
    expect(() =>
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
      })),
    ).toThrow(
      expect.objectContaining({
        diagnostics: [expect.objectContaining({ details: { reason: "ForeignToken" } })],
      }),
    );
  });

  it("Compile T11: a schedule sending another definition's event of the same name is refused", () => {
    const Other = definition({ id: "types/Other", states: ["A"], events: { Off: {} } });

    expect(() =>
      machine(Lamp, ({ S }) => ({
        default: S.ON,
        // @ts-expect-error Compile R12: another definition's event is no schedule's
        states: { ON: { schedules: { off: { schedule: "1 second", send: Other.E.Off } } } },
      })),
    ).toThrow(
      expect.objectContaining({
        diagnostics: [
          expect.objectContaining({ path: ["states", "ON", "schedules", "off", "send"] }),
        ],
      }),
    );
  });
});
