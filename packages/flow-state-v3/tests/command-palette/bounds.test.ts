import { Option, Schema } from "effect";
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

describe("a palette whose memory passes a codec bound (Actors R8; WriteAhead R4; Codec R1, R4)", () => {
  it("WriteAhead R4: the list past the bound is reported UnencodableValue and never saved; a reload brings back the last good list, and the next list that fits saves", async () => {
    const run = checked(await overBound.run());
    const { saved, unsaved, reloaded } = run.checkpoints;

    expect(savedCommands(saved)).toBe(1000);
    expect(unsaved.read(palette)?.memory.commands).toHaveLength(4097);
    expect(savedCommands(unsaved)).toBe(1000);
    expect(
      run.evidence.flatMap((e) =>
        e._tag === "Reported" ? [`${e.code} ${Option.getOrElse(e.record, () => "-")}`] : [],
      ),
    ).toEqual([`UnencodableValue ${RECORD}`, `UnencodableValue ${RECORD}`]);
    expect(reloaded.read(palette)?.memory.commands).toHaveLength(1000);
    expect(savedCommands(run.checkpoints["saved again"])).toBe(1000);
  });
});
