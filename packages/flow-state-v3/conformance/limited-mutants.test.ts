import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Option } from "effect";
import { limits } from "./limits.ts";
import {
  limitedFaults,
  limitedOwners,
  liarLimitedOwners,
  splitByLimits,
} from "./limited-mutants.ts";
import { caseChecks, guarantees, probes } from "./suite.ts";

const limited = new Set(limits.map((l) => l.case));

describe("round-14 mutants whose cases are all limited (Conformance R22, I66)", () => {
  it("a limited mutant with no owed production row fails the gate", () => {
    assert.deepEqual(limitedFaults(["new.limited"], {}), [
      "BAD  new.limited: every case is a round-14 limit, and no production mutant is owed for it",
    ]);
  });

  it("an owed production row for a mutant that is not limited fails the gate", () => {
    const row = { task: "@task.V3.T18", why: "", uncaughtIn: Option.none() } as const;

    assert.deepEqual(limitedFaults([], { "old.limited": row }), [
      "BAD  old.limited: owed as a limited mutant, but some case of it is not a round-14 limit",
    ]);
  });

  it("a mutant keeps its cases that are not limits, and is limited only when none is left", () => {
    assert.deepEqual(splitByLimits(["A", "B"], new Set(["A"])), ["B"]);
    assert.deepEqual(splitByLimits(["A"], new Set(["A"])), []);
  });

  it("a mutant whose only report-independent catch was in a limited case is limited under the liar gate, owed a production mutant", () => {
    for (const name of [
      "pay16.decline-not-delivered",
      "lost.decline.mail",
      "turn.root-first-no-part",
    ])
      assert.ok(liarLimitedOwners[name] !== undefined, name);

    const behavioural = new Set(
      [...guarantees.flatMap((g) => g.mutants), ...caseChecks.mutants]
        .filter((m) => m.runtime === "prototype" && splitByLimits(m.cases, limited).length > 0)
        .map((m) => m.name),
    );

    for (const name of Object.keys(liarLimitedOwners))
      assert.ok(behavioural.has(name), `${name}: a round-14 mutant that keeps a case`);
  });

  it("every round-14 mutant and probe whose cases are all limited is owed a production mutant", () => {
    const names = [...guarantees.flatMap((g) => g.mutants), ...caseChecks.mutants, ...probes]
      .filter((m) => m.runtime === "prototype")
      .filter((m) => splitByLimits(m.cases, limited).length === 0)
      .map((m) => m.name);

    assert.deepEqual(limitedFaults(names, limitedOwners), []);
  });
});
