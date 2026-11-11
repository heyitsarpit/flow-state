import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import type { Mutant } from "../dsl/oracle.ts";
import { judge } from "./falsify.ts";
import type { CaseVerdict } from "./verdict.ts";

const mutant: Mutant = {
  name: "m",
  says: "a planted wrong runtime",
  expects: "WriteLanes I12",
  runtime: "prototype",
  cases: ["A", "B"],
  edits: [],
};

const caught: CaseVerdict = {
  _tag: "Fail",
  id: "A",
  oracles: ["lane-queue"],
  why: "lane-queue: WriteLanes I12: a release never came",
};

const timedOut: CaseVerdict = { _tag: "Timeout", id: "B", seed: 1, seconds: 10 };

describe("falsify judge", () => {
  it("a Timeout alone is a wrong reason, never a catch", () => {
    assert.equal(judge(mutant, "lane-queue", [timedOut])._tag, "WrongReason");
  });

  it("a Timeout beside a catch leaves the catch to the failed case", () => {
    const verdict = judge(mutant, "lane-queue", [timedOut, caught]);

    assert.deepStrictEqual(verdict, {
      _tag: "Caught",
      mutant: "m",
      why: `A: ${caught.why}`,
      red: ["A", "B"],
      caughtIn: ["A"],
    });
  });

  it("a failure naming another oracle is a wrong reason", () => {
    assert.equal(judge(mutant, "delivered-once", [caught])._tag, "WrongReason");
  });

  it("all green is a survivor", () => {
    assert.equal(judge(mutant, "lane-queue", [{ _tag: "Pass", id: "A" }])._tag, "Survived");
  });
});
