import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { parts } from "../fixtures/index.ts";
import { implemented as production } from "../conformance/adapters/production.ts";
import { fingerprintOf } from "../conformance/parts/fingerprint.ts";
import { scriptOf } from "../conformance/parts/generate.ts";
import { playPart } from "../conformance/parts/play.ts";
import { benchReplay } from "./bench.ts";

describe("bench replay (Q18: Conformance R23, I67, T44)", () => {
  it("each pilot's usual script does the same work in the bench as in conformance", () => {
    assert.equal(parts.length, 3);

    for (const part of parts) {
      const script = scriptOf(part, "usual", 1, production);
      const judged = fingerprintOf(playPart(script, "production"));
      const benched = benchReplay(script);

      assert.ok(judged.turns > 0 && Object.keys(judged.requests).length > 0, part.name);
      assert.deepEqual(benched.fingerprint, judged, part.name);
      assert.equal(benched.turnMs.length, judged.turns, part.name);
    }
  });

  it("a bench that skips the persistence edge does less work than the run the suite judged", () => {
    const part = parts.find((p) => p.machine.compiled.persist);
    assert.ok(part !== undefined, "no persisted pilot");

    const script = scriptOf(part, "usual", 1, production);
    const judged = fingerprintOf(playPart(script, "production"));
    const skipping = benchReplay(script, { persistence: false });

    assert.ok(judged.batches > 0 && judged.bytes > 0);
    assert.notDeepEqual(skipping.fingerprint, judged);
  });
});
