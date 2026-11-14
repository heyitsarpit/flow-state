import assert from "node:assert/strict";
import { Effect } from "effect";
import { describe, it } from "vite-plus/test";
import { CHECKPOINT_GATES, checkpoint, type CheckpointGate } from "./checkpoint.ts";
import { machineGates } from "./gates.ts";

const printing = (gate: string, line: string, code: number) =>
  ({
    gate,
    entry: "-e",
    args: [`console.log('${line}'); process.exitCode = ${code}`],
  }) satisfies CheckpointGate;

const judged = (gates: ReadonlyArray<CheckpointGate>) => Effect.runPromise(checkpoint(gates, 30));

describe("the checkpoint gates in `verify` (T61; survey item 1)", () => {
  it("runs the five cheap gates, each one of the gate file's machine gates", () => {
    const names = machineGates("").map((g) => g.gate);

    assert.deepEqual(
      CHECKPOINT_GATES.filter((g) => !names.includes(g)),
      [],
    );
    assert.deepEqual(CHECKPOINT_GATES, [
      "coverage",
      "parts production",
      "held-out production",
      "class gate production",
      "bench production",
    ]);
  });

  it("a planted red gate fails the checkpoint, and every gate still runs", async () => {
    const result = await judged([
      printing("planted red", "VERDICT fail 0/1 planted", 1),
      printing("green", "VERDICT pass 1/1 green", 0),
    ]);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.lines.map((l) => l.split(":")[0]),
      ["BAD  planted red", "ok   green"],
    );
  });

  it("a pass line with a failing exit code, a fail line with a passing one, or no verdict, fails", async () => {
    for (const planted of [
      printing("lying exit", "VERDICT pass 1/1", 1),
      printing("lying line", "VERDICT fail 0/1", 0),
      printing("silent", "nothing here", 0),
    ]) {
      const result = await judged([planted]);

      assert.equal(result.ok, false, planted.gate);
    }
  });

  it("green gates pass, the coverage gate's own line included", async () => {
    const result = await judged([
      printing("coverage", "ok   coverage: 1 of 1 core Invariants checked, 0 gap(s)", 0),
      printing("green", "VERDICT pass 1/1", 0),
    ]);

    assert.equal(result.ok, true);
  });

  it("an empty gate list judges nothing and fails", async () => {
    assert.equal((await judged([])).ok, false);
  });
});
