import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Option, Schema } from "effect";
import { describe, it } from "vite-plus/test";
import { oracle, violation } from "../dsl/oracle.ts";
import { playPart } from "../parts/play.ts";
import { scriptById } from "../parts/records.ts";
import { sourceFiles } from "../source-files.ts";
import { oracles } from "../suite.ts";
import { caught } from "./caught.ts";
import { machineGates } from "./gates.ts";
import { VerdictsJson } from "./verdict.ts";

const SUITE = fileURLToPath(new URL("..", import.meta.url));

const plantedAt = (invariant: string) => {
  const found = violation(`${invariant}: planted`, Option.some("att-planted"));

  return oracle<number>({
    name: "delivered-once",
    guarantee: [found.invariant],
    start: () => 0,
    step: (n) => [n + 1, n === 1 ? [found] : []],
  });
};

const failedBy = (invariant: string) => {
  const script = Option.getOrThrow(scriptById("PART-sync-usual-1"));

  return playPart(script, "production", undefined, [], Option.none(), [
    ...oracles,
    plantedAt(invariant),
  ]).verdict;
};

describe("one caught rule over structured verdicts (Conformance I43; suite convergence M4)", () => {
  it("a failed run's verdict carries each violation as fields beside its text", () => {
    const encoded = Schema.encodeSync(VerdictsJson)([failedBy("WriteLanes I15")]);

    assert.match(
      encoded,
      /"violations":\[\{"check":"delivered-once","invariant":"WriteLanes I15"/u,
    );
  });

  it("caught matches the exact check and Invariant, a case's declared cite, and never a Timeout", () => {
    const verdict = failedBy("WriteLanes I15");

    assert.ok(caught({ check: "delivered-once", invariant: "WriteLanes I15" }, verdict));
    assert.ok(!caught({ check: "delivered-once", invariant: "WriteLanes I1" }, verdict));
    assert.ok(!caught({ check: "lane-queue", invariant: "WriteLanes I15" }, verdict));
    assert.ok(
      caught(
        { check: "case", invariant: "Turn I14" },
        { _tag: "Fail", id: "x", oracles: [], why: "w", cites: ["Turn I14"] },
      ),
    );
    assert.ok(
      !caught(
        { check: "delivered-once", invariant: "WriteLanes I15" },
        { _tag: "Timeout", id: "x", seed: 1, seconds: 5 },
      ),
    );
  });

  it("no runner or parts module decides a catch by reading a verdict's text", () => {
    const files = sourceFiles(SUITE, /\.ts$/u);

    const readers = files
      .filter((f) => /\/(runner|parts)\/[^/]+\.ts$/u.test(f) && !f.endsWith(".test.ts"))
      .filter((f) =>
        /\.why\.(includes|startsWith|match)\(|test\([^)]*\.why/u.test(readFileSync(f, "utf8")),
      );

    assert.ok(files.length > 100);
    assert.deepEqual(readers, []);
  });

  it("the planted-fault sweep is a machine gate at every checkpoint", () => {
    assert.ok(machineGates("/tmp").some((g) => g.args.includes("class-gate")));
  });
});
