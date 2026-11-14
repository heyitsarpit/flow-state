import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Option } from "effect";
import { describe, it } from "vite-plus/test";
import { nullPort } from "../adapters/null.ts";
import { productionPort } from "../adapters/production.ts";
import { productionSurface } from "../adapters/production-static.ts";
import { scriptById } from "../parts/records.ts";
import { scenarios } from "../suite.ts";
import { trace, tracedPart, tracedScenario } from "./trace.ts";

const script = (id: string) => Option.getOrThrow(scriptById(id));

const stepBlocks = (text: string) => text.split("\n## step ").slice(1);

describe("the trace command (T61; survey item 7)", () => {
  it("shows each step's input, the model's expected outcome and the observed outcome", () => {
    const text = tracedPart(script("PART-sync-usual-1"), "production");
    const blocks = stepBlocks(text);

    assert.ok(blocks.length > 3, text.slice(0, 400));

    for (const block of blocks) {
      assert.match(block, /\n {2}input: /u);
      assert.match(block, /\n {2}expected: /u);
      assert.match(block, /\n {2}observed: /u);
    }

    assert.doesNotMatch(text, /\n {2}MISMATCH /u);
    assert.match(text, /\nverdict: pass/u);
  });

  it("a planted wrong runtime's mismatch shows at its step, with its rule", () => {
    const text = tracedPart(script("PART-sync-usual-1"), "null");

    assert.match(text, /\n {2}MISMATCH [\w-]+ [A-Z][A-Za-z]+ [IRT]\d+: /u);
    assert.match(text, /\nverdict: fail/u);
  });

  it("a hand case cut at a crash point shows the crash step and its mismatch", () => {
    const pay22 = Option.getOrThrow(
      Option.fromUndefinedOr(scenarios.find((s) => s.id === "PAY-22")),
    );

    const text = tracedScenario(
      productionPort,
      productionSurface,
      pay22,
      1,
      Option.some(16),
      "production",
    );

    assert.match(text, /crash/u);
    assert.match(text, /\n {2}MISMATCH lane-queue WriteLanes I12: /u);
  });

  it("a hand case on the null runtime fails at its first step", () => {
    const pay22 = Option.getOrThrow(
      Option.fromUndefinedOr(scenarios.find((s) => s.id === "PAY-22")),
    );

    const text = tracedScenario(nullPort, productionSurface, pay22, 1, Option.none(), "null");

    assert.match(text, /\nverdict: fail/u);
  });

  it("the mode writes one file in the scratch directory for a case id holding a `/`", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "trace-test-"));

    try {
      await Effect.runPromise(
        trace(["--case", "PAY-13/hung-commit", "--runtime", "production", "--scratch", scratch]),
      );

      const written = readdirSync(scratch);

      assert.equal(written.length, 1);
      assert.match(
        readFileSync(join(scratch, written[0] ?? ""), "utf8"),
        /^# trace PAY-13\/hung-commit /u,
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
