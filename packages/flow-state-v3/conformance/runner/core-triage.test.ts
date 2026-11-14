/// <reference types="node" />
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { coreTriage, triageFaults } from "../core-mutants-triage.ts";

const TABLE = resolve(dirname(fileURLToPath(import.meta.url)), "../core-mutants.tsv");

const rows = () =>
  readFileSync(TABLE, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => {
      const [status = "", at = "", mutated = ""] = l.split("\t");

      return { status, at, mutated };
    });

describe("core mutants: each one not killed by a named oracle is triaged", () => {
  it("the recorded run leaves no mutant untriaged and no triage row stale", () => {
    assert.ok(rows().length > 0);
    assert.deepEqual(triageFaults(rows(), coreTriage), []);
  });

  it("a surviving mutant with no row, and a killed mutant with a row, are faults", () => {
    const [row] = coreTriage;
    assert.ok(row !== undefined);

    const survivor = { status: "SURVIVED", at: "src/core/x.ts:1", mutated: "a || b" };
    const killed = { status: "killed", at: row.at, mutated: row.mutated };

    assert.equal(triageFaults([survivor], []).length, 1);
    assert.equal(triageFaults([killed], [row]).length, 1);
  });

  it("every owed row names an open-work owner and a Spec rule; every equivalent row a reason", () => {
    for (const row of coreTriage)
      if (row.kind === "owed") assert.match(row.rule, /^[A-Z][a-zA-Z]+ [RIT]\d+/u, row.at);
      else assert.ok(row.why.length > 20, row.at);
  });
});
