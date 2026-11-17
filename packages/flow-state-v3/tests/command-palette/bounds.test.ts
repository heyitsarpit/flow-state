import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { palette } from "../../fixtures/command-palette/machine.ts";
import { overBound } from "../../fixtures/command-palette/stories.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

const RECORD = "actor/Palette/Palette/palette-1";

const Saved = Schema.fromJsonString(
  Schema.Struct({ memory: Schema.Struct({ commands: Schema.Array(Schema.Unknown) }) }),
);

const savedCommands = (cut: Cut) =>
  Schema.decodeUnknownSync(Saved)(cut.records.stored.get(RECORD)).memory.commands.length;

describe("a palette with a long list (Actors R8; WriteAhead R4; Codec R1)", () => {
  it("WriteAhead R4, Codec R1: 4,097 commands are saved whole and a reload brings them back; nothing is reported", async () => {
    const run = checked(await overBound.run());
    const { saved, unsaved, reloaded } = run.checkpoints;

    expect(savedCommands(saved)).toBe(1000);
    expect(savedCommands(unsaved)).toBe(4097);
    expect(run.evidence.filter((e) => e._tag === "Reported")).toEqual([]);
    expect(reloaded.read(palette)?.memory.commands).toHaveLength(4097);
    expect(savedCommands(run.checkpoints["saved again"])).toBe(1000);
  });
});
