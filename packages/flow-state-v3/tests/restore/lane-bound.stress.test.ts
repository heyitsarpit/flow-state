import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { cancelClient } from "../../fixtures/lanes/app.ts";
import { stressDisplacedPastItems } from "../../fixtures/lanes/stories/usual.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

const RUN_MS = 120_000;

const Displaced = Schema.fromJsonString(Schema.Struct({ displaced: Schema.Array(Schema.String) }));

const ended = (run: StoryRun) => run.evidence.filter((e) => e._tag === "Ended").length;

describe("a cancel lane with thousands of displaced Attempts (Codec R1; WriteAhead I21)", () => {
  it(
    "WriteAhead I21: 4,200 cancels on a lane whose calls never answer never withhold the identity, and each commit ends once across the reload",
    async () => {
      const run = checked(await stressDisplacedPastItems().run());

      // The lane record saved more displaced Attempts than 4,096 before the reload.
      const record = [...run.checkpoints.full.records.stored].find(([k]) => k.startsWith("lane/"));

      expect(Schema.decodeUnknownSync(Displaced)(record?.[1]).displaced.length).toBeGreaterThan(
        4096,
      );
      expect(ended(run)).toBe(4200);
      expect(run.checkpoints.after.read(cancelClient)?.lifecycle).toBe("active");
    },
    RUN_MS,
  );
});
