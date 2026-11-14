import { Effect } from "effect";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { describe, it } from "vite-plus/test";
import type { Mutant } from "../dsl/oracle.ts";
import { PACKAGE } from "./args.ts";
import { falsifyProduction } from "./falsify.ts";
import { productionCases } from "./gates.ts";
import { controlFaults, coreOutcome } from "./mutate.ts";
import type { CaseVerdict } from "./verdict.ts";

const cases = productionCases.slice(0, 2);

const planted = (edits: Mutant["edits"]) =>
  ({
    name: "planted",
    says: "a planted core mutant",
    expects: "Turn I2",
    runtime: "production",
    cases,
    edits,
  }) satisfies Mutant;

const outcomeOf = (verdicts: ReadonlyArray<CaseVerdict>) =>
  coreOutcome({ rows: verdicts.map((v) => `m\t${v.id}\t${v._tag}`), verdicts }).status;

describe("core mutants", () => {
  it("only a failure naming an oracle or a cited Invariant is a kill", () => {
    assert.equal(
      outcomeOf([
        {
          _tag: "Fail",
          id: "A",
          oracles: ["lane-queue"],
          why: "x",
          violations: [{ check: "lane-queue", invariant: "WriteLanes I12", step: 1 }],
        },
      ]),
      "killed",
    );
    assert.equal(
      outcomeOf([{ _tag: "Fail", id: "A", oracles: ["lane-queue"], why: "defect: x" }]),
      "NO-ORACLE",
    );
    assert.equal(
      outcomeOf([
        {
          _tag: "Fail",
          id: "A",
          oracles: [],
          why: "x",
          cites: ["Turn I2"],
          expectation: { label: "x" },
        },
      ]),
      "killed",
    );
    assert.equal(outcomeOf([{ _tag: "Fail", id: "A", oracles: [], why: "threw" }]), "NO-ORACLE");
    assert.equal(outcomeOf([{ _tag: "Timeout", id: "A", seed: 0, seconds: 10 }]), "TIME");
    assert.equal(outcomeOf([{ _tag: "Pass", id: "A" }]), "SURVIVED");
  });

  it("a control over zero cases is red, as is a case red on unedited production", () => {
    assert.deepEqual(controlFaults([], []), ["BAD  control: no case to run, so it proves nothing"]);
    assert.equal(
      controlFaults(["A"], [{ _tag: "Fail", id: "A", oracles: [], why: "x" }]).length,
      1,
    );
    assert.deepEqual(controlFaults(["A"], [{ _tag: "Pass", id: "A" }]), []);
  });

  it("a run with no verdict at all is ERROR, never SURVIVED", () => {
    assert.equal(outcomeOf([]), "ERROR");
    assert.equal(coreOutcome({ rows: ["m\tA\tPass"], verdicts: [] }).status, "ERROR");
  });

  it("a package copy loads the suite: an unedited copy passes its cases", async () => {
    const result = await Effect.runPromise(
      falsifyProduction(PACKAGE, tmpdir(), "any", planted([])),
    );

    assert.deepStrictEqual(
      result.verdicts.map((v) => v._tag),
      cases.map(() => "Pass"),
    );
    assert.equal(coreOutcome(result).status, "SURVIVED");
  }, 240_000);

  it("a copy that fails to load is never a kill", async () => {
    const result = await Effect.runPromise(
      falsifyProduction(
        PACKAGE,
        tmpdir(),
        "any",
        planted([
          {
            file: "conformance/runner/main.ts",
            find: "const dispatch = (args: ReadonlyArray<string>) => {",
            replace:
              'throw new Error("planted load failure");\nconst dispatch = (args: ReadonlyArray<string>) => {',
          },
        ]),
      ),
    );

    assert.notEqual(coreOutcome(result).status, "killed");
  }, 240_000);
});
