import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const SRC = new URL("../../src/", import.meta.url);

const sources = (dir: string) =>
  readdirSync(new URL(dir, SRC), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `${dir}${f}`);

const text = (file: string) => readFileSync(new URL(file, SRC), "utf8");

const EVIDENCE_BUILT = /\bEvidence\.[A-Z]\w*\(/u;

const OWED_SET = /tx\.set\(\{[^}]*\bowed:/su;

const PERSIST_GIVEN = /Command\.Persist\(/u;

describe("one builder of reports (WriteLanes composition)", () => {
  it("WriteLanes composition: every report is built by evidenceOf from an act; no other core module builds an Evidence", () => {
    const builders = sources("core/")
      .filter((f) => !f.endsWith(".test.ts") && f !== "core/evidence-of.ts")
      .filter((f) => EVIDENCE_BUILT.test(text(f)));

    expect(builders).toEqual([]);
  });
});

const core = () => sources("core/").filter((f) => !f.endsWith(".test.ts"));

describe("one holder of owed rows, one writer of records", () => {
  it("WriteLanes R10: only the ledger sets the World's owed rows (WriteLanes composition)", () => {
    const setters = core()
      .filter((f) => f !== "core/ledger.ts")
      .filter((f) => OWED_SET.test(text(f)));

    expect(setters).toEqual([]);
  });

  it("WriteAhead I21, R10: only the step-end projection gives a Persist command", () => {
    const writers = core()
      .filter((f) => f !== "core/persist.ts")
      .filter((f) => PERSIST_GIVEN.test(text(f)));

    expect(writers).toEqual([]);
    expect(text("core/persist.ts").match(/Command\.Persist\(/gu)).toHaveLength(1);
  });
});

describe("each scan flags the shape it refuses, and passes the owner's call beside it", () => {
  it("WriteLanes composition, R10; WriteAhead I21: a report, an owed-rows write and a Persist built outside their owner are flagged", () => {
    expect({
      report: [
        EVIDENCE_BUILT.test("    tx.insertEvidence(Evidence.RuntimeDisposed());"),
        EVIDENCE_BUILT.test("    tx.act(Act.RuntimeEnded());"),
      ],
      owed: [
        OWED_SET.test("    if (forgetting) tx.set({ ...tx.world(), owed: tx.world().owed });"),
        OWED_SET.test("    tx.set({\n      ...tx.world(),\n      owed: kept,\n    });"),
        OWED_SET.test("    ledger.suspend(actor, forgetting);"),
      ],
      persist: [
        PERSIST_GIVEN.test("    tx.command(Command.Persist({ writes: [], due: Due.Now() }));"),
        PERSIST_GIVEN.test("    ledger.suspend(actor, false);"),
      ],
    }).toEqual({ report: [true, false], owed: [true, true, false], persist: [true, false] });
  });
});

const TEMPORARY = /\bPART-|\b(?:step|Task) T\d+\b|"T\d+"|\(T\d+ acceptance|\bT\d+'s\b/u;

describe("the package names no temporary record", () => {
  it("no source file, test included, names a Task, step or old-suite case id", () => {
    const named = sources("").filter((f) => TEMPORARY.test(text(f)));

    expect(named).toEqual([]);
  });
});
