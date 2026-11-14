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
import { judgeProbe, liarVerdict } from "./falsify.ts";
import { machineGates } from "./gates.ts";
import { coreOutcome } from "./mutate.ts";
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
    const [decoded] = Schema.decodeSync(VerdictsJson)(encoded);

    assert.ok(
      decoded?._tag === "Fail" &&
        (decoded.violations ?? []).some(
          (v) => v.check === "delivered-once" && v.invariant === "WriteLanes I15" && v.step > 0,
        ),
    );
  });

  it("caught matches the exact check and Invariant, a case's declared cite, and never a Timeout", () => {
    const verdict = failedBy("WriteLanes I15");
    const key = (check: string, invariant: string) => Option.some({ check, invariant });

    const crossed = {
      _tag: "Fail" as const,
      id: "x",
      oracles: ["a", "b"],
      why: "a: WriteLanes I1 | b: WriteLanes I2",
      violations: [
        { check: "a", invariant: "WriteLanes I1", step: 1 },
        { check: "b", invariant: "WriteLanes I2", step: 1 },
      ],
    };

    const defect = { _tag: "Fail" as const, id: "x", oracles: [], why: "defect: WriteLanes I15" };

    assert.ok(caught(key("delivered-once", "WriteLanes I15"), verdict));
    assert.ok(!caught(key("delivered-once", "WriteLanes I1"), verdict));
    assert.ok(!caught(key("lane-queue", "WriteLanes I15"), verdict));
    assert.ok(!caught(key("a", "WriteLanes I2"), crossed));
    assert.ok(!caught(key("case", "WriteLanes I15"), defect));
    assert.ok(!caught(Option.none(), defect));
    assert.ok(caught(Option.none(), verdict));
    assert.ok(
      caught(key("case", "Turn I14"), {
        _tag: "Fail",
        id: "x",
        oracles: [],
        why: "w",
        cites: ["Turn I14"],
      }),
    );
    assert.ok(
      !caught(key("delivered-once", "WriteLanes I15"), {
        _tag: "Timeout",
        id: "x",
        seed: 1,
        seconds: 5,
      }),
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

  it("the liar gate, the probes and core mutants count only a catch, never a defect or a Timeout", () => {
    const defect = { _tag: "Fail" as const, id: "x", oracles: ["lane-queue"], why: "defect: boom" };
    const late = { _tag: "Timeout" as const, id: "y", seed: 1, seconds: 5 };
    const real = failedBy("WriteLanes I15");

    const probe = {
      name: "p",
      says: "s",
      holds: "pending" as const,
      runtime: "production" as const,
      cases: ["x"],
      edits: [],
    };

    assert.equal(liarVerdict("m", [defect, late]).red, false);
    assert.equal(liarVerdict("m", [real]).red, true);
    assert.equal(judgeProbe(probe, [late])._tag, "Broken");
    assert.equal(judgeProbe(probe, [real])._tag, "Holds");
    assert.equal(coreOutcome({ rows: ["x\tred"], verdicts: [defect] }).status, "NO-ORACLE");
    assert.equal(coreOutcome({ rows: ["x\tred"], verdicts: [real] }).status, "killed");
  });

  it("the planted-fault sweep is a machine gate at every checkpoint", () => {
    assert.ok(machineGates("/tmp").some((g) => g.args.includes("class-gate")));
  });
});
