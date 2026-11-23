import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { palette } from "../../fixtures/command-palette/app.ts";
import { largeListSaved } from "../../fixtures/command-palette/stories/usual.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

const RECORD = "actor/Palette/Palette/palette-1";

const Saved = Schema.fromJsonString(
  Schema.Struct({
    body: Schema.Struct({ memory: Schema.Struct({ commands: Schema.Array(Schema.Unknown) }) }),
  }),
);

const savedCommands = (cut: Cut) =>
  Schema.decodeUnknownSync(Saved)(cut.records.stored.get(RECORD)).body.memory.commands.length;

describe("a palette with a long list (Actors R8; WriteAhead R4; Codec R1)", () => {
  it("WriteAhead R4, Codec R1: 10,000 commands are saved whole and a reload brings them back; nothing is reported", async () => {
    const run = checked(await largeListSaved.run());
    const { saved, unsaved, reloaded } = run.checkpoints;

    expect(savedCommands(saved)).toBe(1000);
    expect(savedCommands(unsaved)).toBe(10_000);
    expect(run.evidence.filter((e) => e._tag === "Reported")).toEqual([]);
    expect(reloaded.read(palette)?.memory.commands).toHaveLength(10_000);
    expect(savedCommands(run.checkpoints["saved again"])).toBe(1000);
  });
});
