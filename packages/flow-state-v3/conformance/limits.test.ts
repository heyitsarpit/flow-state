import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { type Limit, verdictOfLimit } from "./limits.ts";

const row: Limit = {
  case: "GEN-x",
  check: "disposal",
  invariant: "Actors I14",
  why: "planted",
};

describe("the limits gate (Conformance T42, I64)", () => {
  it("holds a row whose case fails by its Invariant", () => {
    const failed = {
      _tag: "Fail" as const,
      id: "GEN-x",
      oracles: ["disposal"],
      why: "seed 1: disposal: Actors I14: no incarnation",
    };

    assert.equal(verdictOfLimit(row, failed).held, true);
  });

  it("holds a case-expectation row only when the case's first failure cites its Invariant", () => {
    const expectation = { ...row, check: "case", invariant: "Turn I14" };

    const failed = (why: string) => ({
      _tag: "Fail" as const,
      id: "GEN-x",
      oracles: [],
      why,
    });

    assert.equal(verdictOfLimit(expectation, failed("seed 1: Turn I14: refused: x")).held, true);
    assert.equal(verdictOfLimit(expectation, failed("seed 1: state: expected x")).held, false);
    assert.equal(verdictOfLimit(expectation, failed("seed 1: Turn I14x: refused")).held, false);
  });

  it("fails a planted row whose case passes", () => {
    assert.equal(verdictOfLimit(row, { _tag: "Pass", id: "GEN-x" }).held, false);
  });

  it("fails a planted row whose Invariant is a prefix of the one that failed it", () => {
    const longer = {
      _tag: "Fail" as const,
      id: "GEN-x",
      oracles: ["disposal"],
      why: "seed 1: disposal: Actors I14: no incarnation",
    };

    assert.equal(verdictOfLimit({ ...row, invariant: "Actors I1" }, longer).held, false);
  });

  it("fails a planted row whose case fails by another Invariant", () => {
    const other = {
      _tag: "Fail" as const,
      id: "GEN-x",
      oracles: ["delivered-once"],
      why: "seed 1: delivered-once: WriteLanes I15: stray",
    };

    assert.equal(verdictOfLimit(row, other).held, false);
  });
});
