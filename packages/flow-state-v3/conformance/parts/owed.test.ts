import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Effect, Option } from "effect";
import { coreTriage, triageFaults } from "../core-mutants-triage.ts";
import { verdictOfLimit } from "../limits.ts";
import { type Cited, Mismatch } from "../dsl/oracle.ts";
import { expect } from "../dsl/static-case.ts";
import { verdict } from "../runner/parts-gates.ts";
import { verdictOf } from "../runner/run.ts";
import { scenarios } from "../suite.ts";
import { combinationGate } from "./pairs.ts";
import { oracle, type Oracle, violation } from "../dsl/oracle.ts";
import { oracles } from "../suite.ts";
import { item, OwedItem, owedRows, type PartOwed } from "./owed.ts";
import { partFaults, playPart } from "./play.ts";
import { playedScope, scriptById } from "./records.ts";

const passed = (id: string) => ({
  script: { id, fixture: "x", actor: "a", steps: [] },
  run: {
    verdict: { _tag: "Pass" as const, id },
    threw: Option.none(),
    facts: [],
    skipped: 0,
    undecided: [],
    violations: [],
  },
});

const owner = { task: "@task.V3.T19", slice: 2, by: "a sweep", date: "2026-11-12" } as const;

const pairInput = {
  declared: ["rj", "ky"],
  runs: [{ id: "r", mix: false, byComposite: { C: new Set(["rj", "ky"]) }, cells: [] }],
  owners: {},
  tasks: { "@task.V3.T19": { open: true, slice: 2 } },
  sliceOf: { rj: 0, ky: 0 },
  current: 0,
};

describe("owed rows match something that still runs (Conformance R15, R18, R22)", () => {
  it("an owed part row that names no played script is a fault", () => {
    const ghost = {
      case: "PART-gone-usual-9",
      check: "c",
      invariant: "I",
      why: "w",
      owner: "o",
      items: [OwedItem.Attempt({ id: "att-1" })],
    };

    const scope = new Set(["PART-x-usual-1"]);

    assert.equal(partFaults([passed("PART-x-usual-1")], [ghost], scope).length, 1);
    assert.deepEqual(partFaults([passed("PART-x-usual-1")], [], scope), []);
  });

  it("no played part script at all is a fault", () => {
    assert.equal(partFaults([], []).length, 1);
  });

  it("a triage row whose mutant the run did not report is a fault", () => {
    const [row] = coreTriage;
    assert.ok(row !== undefined);

    const other = { status: "killed", at: "src/core/x.ts:1", mutated: "y" };

    assert.equal(triageFaults([other], [row]).length, 1);
    assert.ok(triageFaults([other], [row])[0]?.includes(row.at));
  });

  it("a pair owner whose pair is reached, or that names no interacting pair, is a fault", () => {
    assert.ok(combinationGate({ ...pairInput, owners: { "rj+ky": owner } }).failures.length > 0);
    assert.ok(combinationGate({ ...pairInput, owners: { "rj+zz": owner } }).failures.length > 0);
  });

  it("a combination gate over no run is a fault, whatever its owners", () => {
    assert.ok(
      combinationGate({ ...pairInput, runs: [], owners: { "rj+ky": owner } }).failures.length > 0,
    );
  });
});

describe("an owed run that times out is a fault, whatever it kept (Conformance R8, R22)", () => {
  it("a Timeout after a kept violation fails the gate", () => {
    const row = {
      case: "PART-x-stress-1",
      check: "delivered-once",
      invariant: "WriteLanes I15",
      why: "w",
      owner: "@task.V3.T19",
      items: [OwedItem.Attempt({ id: "att-1" })],
    };

    const kept = {
      oracle: "delivered-once",
      invariant: "WriteLanes I15",
      subject: Option.some("att-1"),
      step: 1,
      text: "delivered-once: WriteLanes I15: lost (at s)",
      excused: true,
    };

    const timeout = { _tag: "Timeout" as const, id: row.case, seed: 1, seconds: 10 };

    const run = {
      verdict: timeout,
      threw: Option.some(timeout),
      facts: [],
      skipped: 0,
      undecided: [],
      violations: [kept],
    };

    const script = { id: row.case, fixture: "x", actor: "a", steps: [] };

    assert.equal(partFaults([{ script, run }], [row]).length, 1);
  });
});

const planted = (check: string, invariant: string, subject: string, at: number) => {
  const found = violation(`${invariant}: planted lost ending`, Option.some(subject));

  return oracle<number>({
    name: check,
    guarantee: [found.invariant],
    start: () => 0,
    step: (n) => [n + 1, n === at ? [found] : []],
  });
};

const judgedWith = (id: string, extra: ReadonlyArray<Oracle>, rows: ReadonlyArray<PartOwed>) => {
  const script = Option.getOrThrow(scriptById(id));
  const mine = rows.filter((o) => o.case === id);

  const run = playPart(script, "production", undefined, mine, Option.none(), [
    ...oracles,
    ...extra,
  ]);

  return partFaults([{ script, run }], mine, new Set([id]));
};

const ownedBy = (id: string) => owedRows.filter((o) => o.case === id);

describe("one owed rule for every owed script, by exact break (the class gate; Conformance R22)", () => {
  const owedIds = [...new Set(owedRows.map((o) => o.case))];

  it("every owed script plays on the part player and holds its rows, at its own seed", () => {
    assert.ok(owedIds.length > 50);
    assert.ok(owedIds.includes("GEN-pay-search-25-shrunk"));

    for (const id of owedIds) assert.deepEqual(judgedWith(id, [], owedRows), [], id);
  }, 120_000);

  it("a planted break on any fresh Attempt, any lane at a fresh step, or an owed Attempt under another Invariant fails every played script", () => {
    const ids = [...playedScope(), ...owedIds];
    let seed = 7;

    const pick = (n: number) => {
      seed = (seed * 48_271) % 2_147_483_647;

      return seed % n;
    };

    for (const id of new Set(ids)) {
      const rows = ownedBy(id);
      const [row] = rows;
      const check = row?.check ?? "delivered-once";
      const invariant = row?.invariant ?? "WriteLanes I15";
      const at = pick(3);

      const kinds = [
        planted(check, invariant, `att-planted-${pick(1000)}`, at),
        planted(check, invariant, `Planted/Lane x${pick(1000)} op`, at),
        ...rows.flatMap((r) =>
          r.items
            .filter(OwedItem.$is("Attempt"))
            .slice(0, 1)
            .map((a) => planted(r.check, "Actors I1", a.id, at)),
        ),
        ...rows.flatMap((r) =>
          r.items
            .filter(OwedItem.$is("Item"))
            .map((i) => planted(r.check, r.invariant, i.subject, at)),
        ),
      ];

      for (const kind of kinds)
        assert.ok(
          judgedWith(id, [kind], owedRows).some((f) => f.includes("planted lost ending")),
          id,
        );
    }
  }, 240_000);

  it("an owed item that stops breaking, or a row of a Task not open, fails the gate", () => {
    const id = "PART-transfers-stress-104";
    const rows = ownedBy(id);
    const extra = rows.map((r) => ({ ...r, items: [...r.items, item("Planted/Lane y op", 999)] }));

    assert.ok(judgedWith(id, [], extra).some((f) => f.includes("no longer breaks")));

    const script = Option.getOrThrow(scriptById(id));
    const run = playPart(script, "production", undefined, rows);

    assert.ok(
      partFaults([{ script, run }], rows, new Set([id]), new Set()).some((f) =>
        f.includes("a Task not open"),
      ),
    );
  }, 60_000);

  it("each row names a break and is the only row of its script, check and Invariant", () => {
    const keys = owedRows.map((o) => `${o.case}|${o.check}|${o.invariant}`);

    assert.deepEqual(
      owedRows.filter((o) => o.items.length === 0),
      [],
    );
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe("triage statuses (core mutants)", () => {
  it("a triaged mutant that now errors or times out is a fault", () => {
    const [row] = coreTriage;
    assert.ok(row !== undefined);

    for (const status of ["ERROR", "TIME"])
      assert.equal(triageFaults([{ status, at: row.at, mutated: row.mutated }], [row]).length, 1);
  });

  it("a run over no mutant is a fault", () => {
    assert.ok(triageFaults([], []).length > 0);
  });
});

describe("owed cases are matched by id and cited Invariant, not label text (Conformance R9, I43)", () => {
  const row = { case: "A", check: "case", invariant: "Turn I14", why: "w" };

  it("another case's verdict never holds the row", () => {
    const other = {
      _tag: "Fail" as const,
      id: "B",
      oracles: [],
      why: "seed 1: Turn I14: x",
      cites: ["Turn I14"],
    };

    assert.equal(verdictOfLimit(row, other).held, false);
  });

  it("the expectation's own cites hold the row; its label text does not", () => {
    const cited = { _tag: "Fail" as const, id: "A", oracles: [], why: "x", cites: ["Turn I14"] };
    const labelled = { _tag: "Fail" as const, id: "A", oracles: [], why: "seed 1: Turn I14: x" };

    assert.equal(verdictOfLimit(row, cited).held, true);
    assert.equal(verdictOfLimit(row, labelled).held, false);
  });

  it("TURN-01 cites the Invariant its owed row names", () => {
    const owed = scenarios.find((s) => s.id === "TURN-01/schedule-out-of-range");

    assert.ok(owed?.cites.includes("Turn I14"));
  });
});

describe("a failed expectation's cites are declared apart from its label (Conformance R6)", () => {
  const mismatch = (label: string, cites: ReadonlyArray<Cited>) =>
    new Mismatch({ label, expected: "1", actual: "2", cites });

  it("the verdict cites what the expectation declares", () => {
    const failed = verdictOf("A", 1, mismatch("refused twice", ["Turn I14"]));

    assert.deepStrictEqual(failed._tag === "Fail" ? failed.cites : [], ["Turn I14"]);
  });

  it("a declared Requirement reaches no verdict cite, so it proves no catch", () => {
    const failed = verdictOf("A", 1, mismatch("the next place declines", ["WriteLanes R6"]));

    assert.equal(failed._tag === "Fail" ? failed.cites : [], undefined);
  });

  it("a cite written into the label is not a cite", () => {
    const failed = verdictOf("A", 1, mismatch("Turn I14: refused twice", []));

    assert.equal(failed._tag === "Fail" ? failed.cites : [], undefined);
  });

  it("a static expectation's failure carries its cite and keeps its label bare", () => {
    assert.throws(
      () => expect("Compile I6", "no computed initial runs", 1, 2),
      (e) =>
        e instanceof Mismatch &&
        e.label === "no computed initial runs" &&
        e.cites[0] === "Compile I6",
    );
  });

  it("the why still names the cite", () => {
    const failed = verdictOf("A", 1, mismatch("refused twice", ["Turn I14"]));

    assert.equal(
      failed._tag === "Fail" ? failed.why : "",
      "seed 1: Turn I14: refused twice: expected 1, got 2",
    );
  });
});

describe("a gate over nothing fails", () => {
  it("a VERDICT over zero items sets a failing exit code", () => {
    const before = process.exitCode;

    try {
      process.exitCode = 0;
      Effect.runSync(verdict([], 0, "items"));
      assert.equal(process.exitCode, 1);
    } finally {
      process.exitCode = before;
    }
  });
});
