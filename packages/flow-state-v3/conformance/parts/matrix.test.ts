/// <reference types="node" />
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { Option } from "effect";
import { FEATURES, type Feature, type MatrixInput, matrixGate } from "./features.ts";

const TABLE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../workflow/plans/flow/references/proposals/plan-task-coverage-2026-11-11.md",
);

/**
 * The Plan features' ids, from the coverage report's tables: the matrix's source of record.
 */
const planIds = readFileSync(TABLE, "utf8")
  .split("\n")
  .flatMap((line) => /^\| ([A-Z]\d{2}) \|/.exec(line)?.slice(1, 2) ?? []);

const PROPOSALS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../workflow");

/**
 * The slice the replan gives each newly scoped feature (its "by owning Spec" list): the source the
 * matrix's owners follow, not the coverage report's older Task column.
 */
const replanSlices = () => {
  const text = readFileSync(
    resolve(PROPOSALS, "plans/flow/references/proposals/replan-2026-11-11.md"),
    "utf8",
  );

  const section = text.slice(
    text.indexOf("### The 123 newly scoped features"),
    text.indexOf("Notes on the changes"),
  );

  const groups = section.replaceAll(/\n\s+/gu, " ").split(/;|\n- /u);

  return groups.flatMap((group) => {
    const slice = /slice (\d+)\)/u.exec(group)?.[1];

    if (slice === undefined) return [];

    return [...group.matchAll(/([A-Z])(\d{2})(?: to [A-Z](\d{2}))?/gu)].flatMap(
      ([, letter, from, to]) =>
        Array.from(
          { length: Number(to ?? from) - Number(from) + 1 },
          (_, i) =>
            [`${letter}${String(Number(from) + i).padStart(2, "0")}`, Number(slice)] as const,
        ),
    );
  });
};

/**
 * Each V3 Task's status and title, read from its record.
 */
const taskRecords = () =>
  new Map<string, string>(
    readdirSync(resolve(PROPOSALS, "tasks/V3"))
      .filter((f) => /^P\d+\.task$/u.test(f))
      .flatMap((f) =>
        readFileSync(resolve(PROPOSALS, "tasks/V3", f), "utf8")
          .split(/^ {4}(?=T\d+$)/mu)
          .flatMap((block) => {
            const id = /^(T\d+)$/mu.exec(block)?.[1];
            const title = /^ {8}title +(.+)$/mu.exec(block)?.[1];

            return id === undefined || title === undefined
              ? []
              : [[`@task.V3.${id}`, title] as const];
          }),
      ),
  );

const KINDS = new Set(["part", "hand", "static", "app", "package"]);

const rows: ReadonlyArray<Feature> = [
  { id: "M01", kind: "part", codes: ["rj", "ky"], cases: [], owed: Option.none() },
  { id: "M02", kind: "hand", codes: [], cases: ["PAY-01"], owed: Option.none() },
  {
    id: "M03",
    kind: "part",
    codes: ["lt"],
    cases: [],
    owed: Option.some({ slice: 1, task: "@task.V3.T18" }),
  },
];

const planted: MatrixInput = {
  features: rows,
  ids: ["M01", "M02", "M03"],
  declared: ["rj", "ky"],
  reached: new Set(["rj", "ky"]),
  claimed: ["rj", "ky"],
  cases: new Set(["PAY-01"]),
  tasks: { "@task.V3.T18": { open: true, slice: 1 }, "@task.V3.T16": { open: false, slice: 0 } },
};

describe("feature matrix (Q12: Conformance R17, I53 to I55, T35)", () => {
  it("has one row per Plan feature, each with a fixture kind", () => {
    assert.equal(planIds.length, 265);
    assert.deepEqual(FEATURES.map((f) => f.id).toSorted(), planIds.toSorted());
    assert.ok(FEATURES.every((f) => KINDS.has(f.kind)));
  });

  it("owes each row by the replan's slice, to a Task of that slice", () => {
    const slices = replanSlices();
    const titles = taskRecords();

    assert.ok(slices.length >= 80);

    const wrong = slices.flatMap(([id, slice]) => {
      const row = FEATURES.find((f) => f.id === id);

      return Option.match(
        Option.flatMap(Option.fromUndefinedOr(row), (r) => r.owed),
        {
          onNone: () => [],
          onSome: (owed) => {
            const title = titles.get(owed.task) ?? "";
            const named = /\(slice (\d+)\)/u.exec(title)?.[1];

            const mismatch =
              owed.slice !== slice || (named !== undefined && Number(named) !== slice);

            return mismatch
              ? [`${id}: slice ${owed.slice} ${owed.task}, replan slice ${slice}`]
              : [];
          },
        },
      );
    });

    assert.deepEqual(wrong, []);
  });

  it("passes the planted matrix", () => {
    assert.deepEqual(matrixGate(planted), []);
  });

  it("fails on a deleted row", () => {
    assert.ok(matrixGate({ ...planted, features: rows.slice(0, 2) }).length > 0);
  });

  it("fails on a row owed to a done Task, or to a Task of another slice", () => {
    const done = { ...rows[2]!, owed: Option.some({ slice: 0, task: "@task.V3.T16" }) };
    const other = { ...rows[2]!, owed: Option.some({ slice: 2, task: "@task.V3.T18" }) };

    assert.ok(matrixGate({ ...planted, features: [rows[0]!, rows[1]!, done] }).length > 0);
    assert.ok(matrixGate({ ...planted, features: [rows[0]!, rows[1]!, other] }).length > 0);
  });

  it("fails on a declared code no fixture reaches", () => {
    assert.ok(matrixGate({ ...planted, reached: new Set(["rj"]) }).length > 0);
  });

  it("fails on a part claiming a code no runtime under test declares", () => {
    assert.ok(matrixGate({ ...planted, claimed: ["rj", "ky", "mt"] }).length > 0);
  });

  it("fails on a built feature marked owed, and on a hand row whose case does not run", () => {
    const owedBuilt = { ...rows[0]!, owed: Option.some({ slice: 1, task: "@task.V3.T18" }) };

    assert.ok(matrixGate({ ...planted, features: [owedBuilt, rows[1]!, rows[2]!] }).length > 0);
    assert.ok(matrixGate({ ...planted, cases: new Set() }).length > 0);
  });
});
