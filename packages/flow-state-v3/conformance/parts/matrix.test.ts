/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Option } from "effect";
import { scenarios, staticCases } from "../suite.ts";
import { CODES, isCode, SLICE_OF } from "./codes.ts";
import type { TaskRef } from "../coverage.ts";
import { owes } from "../owes.ts";
import { FEATURES } from "./feature-rows.ts";
import { casesReaching, checksOf, type Feature, type MatrixInput, matrixGate } from "./features.ts";
import { playPart, reachedBy } from "./play.ts";
import { constructionCases } from "../compile/construction.cases.ts";
import {
  currentSlice,
  featureRules,
  gateScripts,
  matrixInputOf,
  planIds,
  productionStatics,
  replanCodeSlices,
  replanSlices,
  taskRecords,
  taskSlices,
  taskStatuses,
  tableText,
} from "./records.ts";

const KINDS = new Set(["part", "hand", "static", "app", "package"]);

const owedTo = (
  subject: string,
  task: TaskRef = "@task.V3.T18",
  clause = Option.none<string>(),
) => ({
  subject,
  clause,
  task,
  why: "planted",
});

const rows: ReadonlyArray<Feature> = [
  { id: "M01", kind: "part", codes: ["rj", "ky"] },
  { id: "M02", kind: "hand", codes: [] },
  { id: "M03", kind: "part", codes: ["lt"] },
];

const M03 = owedTo("M03");

const planted: MatrixInput = {
  features: rows,
  owes: [owedTo("Turn I1"), M03],
  ids: ["M01", "M02", "M03"],
  declared: ["rj", "ky"],
  reached: new Set(["rj", "ky"]),
  claimed: ["rj", "ky"],
  reaching: { hand: { M02: ["PAY-01"] }, static: {} },
  open: new Set(["@task.V3.T18"]),
  sliceOf: { rj: 0, ky: 0, lt: 1 },
  current: 0,
};

const realInput = () =>
  matrixInputOf(
    reachedBy(gateScripts().map((script) => ({ run: playPart(script, "production") }))),
  );

describe("feature matrix (Q12: Conformance R17, I53 to I55, T35)", () => {
  it("has one row per Plan feature, each with a fixture kind", () => {
    assert.equal(planIds().length, 265);
    assert.deepEqual(FEATURES.map((f) => f.id).toSorted(), planIds().toSorted());
    assert.ok(FEATURES.every((f) => KINDS.has(f.kind)));
  });

  it("owes each row to a Task of the replan's slice for it, read from the Task", () => {
    const slices = replanSlices();
    const titles = taskRecords();
    const taskSlice = taskSlices();

    assert.ok(slices.length >= 80);

    const wrong = slices.flatMap(([id, slice]) =>
      owes
        .filter((row) => row.subject === id)
        .flatMap(({ task }) => {
          const named = /\(slice (\d+)\)/u.exec(titles.get(task) ?? "")?.[1];

          const mismatch =
            taskSlice.get(task) !== slice || (named !== undefined && Number(named) !== slice);

          return mismatch ? [`${id}: ${task}, replan slice ${slice}`] : [];
        }),
    );

    assert.deepEqual(wrong, []);
  });

  it("passes the planted matrix", () => {
    assert.deepEqual(matrixGate(planted), []);
  });

  it("fails on a deleted row", () => {
    assert.ok(matrixGate({ ...planted, features: rows.slice(0, 2) }).length > 0);
  });

  it("fails on a row owed to a done Task, owed twice, or owing no Plan feature", () => {
    const done = owedTo("M03", "@task.V3.T16");

    assert.deepEqual(matrixGate({ ...planted, owes: [done] }), [
      "M03: owed to @task.V3.T16, which is not open",
    ]);
    assert.deepEqual(matrixGate({ ...planted, owes: [M03, M03] }), ["M03: owed twice"]);
    assert.deepEqual(matrixGate({ ...planted, owes: [M03, owedTo("M99")] }), [
      "M99: owed, but no Plan feature has this id",
    ]);
  });

  it("fails on a declared code no fixture reaches", () => {
    assert.ok(matrixGate({ ...planted, reached: new Set(["rj"]) }).length > 0);
  });

  it("fails on a part claiming a code no runtime under test declares and no later slice builds", () => {
    assert.ok(matrixGate({ ...planted, claimed: ["rj", "ky", "mt"] }).length > 0);
    assert.deepEqual(matrixGate({ ...planted, claimed: ["rj", "lt"] }), []);
  });

  it("fails on a built feature marked owed, and on a hand row no running case reaches", () => {
    assert.ok(matrixGate({ ...planted, owes: [M03, owedTo("M01")] }).length > 0);
    assert.ok(matrixGate({ ...planted, reaching: { hand: {}, static: {} } }).length > 0);
    assert.ok(
      matrixGate({ ...planted, reaching: { hand: {}, static: { M02: ["CMP-01"] } } }).length > 0,
    );
  });

  it("fails on a row built in part with nothing built, and on a part row with no codes", () => {
    const partly = owedTo("M03", "@task.V3.T18", Option.some("the rest"));
    const bare = { ...rows[0]!, codes: [] };

    assert.ok(matrixGate({ ...planted, owes: [partly] }).length > 0);
    assert.ok(matrixGate({ ...planted, features: [bare, rows[1]!, rows[2]!] }).length > 0);
  });
});

describe("feature matrix over the real rows (Q12: Conformance R17, I53 to I55)", () => {
  it("each code's slice is the replan's, but for `in`'s compile half and the three production builds in part", () => {
    const listed = replanCodeSlices();

    assert.equal(listed.length, CODES.length);

    const differ = listed.filter(([code, slice]) => !isCode(code) || SLICE_OF[code] !== slice);

    assert.deepEqual(differ.map(([c]) => c).toSorted(), ["in", "rl", "sr", "wa"]);
  });

  it("reads the Checks column into Spec rules, ranges expanded", () => {
    const checks = checksOf(tableText());

    assert.deepEqual(checks["M01"], ["Compile R1", "Compile I1"]);
    assert.deepEqual(checks["M48"], ["Turn I4", "Turn I5", "Turn I6"]);
    assert.deepEqual(checks["R23"], ["Actors I39", "Restore I12"]);
    assert.deepEqual(checks["M05"], []);
  });

  it("maps every hand and static case to a feature it reaches", () => {
    const reaching = casesReaching(featureRules(), [...scenarios, ...staticCases]);
    const mapped = new Set(Object.values(reaching).flat());

    assert.ok(scenarios.length + staticCases.length > 100);
    assert.deepEqual(
      [...scenarios, ...staticCases].filter((c) => !mapped.has(c.id)).map((c) => c.id),
      [],
    );
  });

  it("the current slice is the lowest slice with an open Task (close review finding 9)", () => {
    const slices = new Map([
      ["@task.V3.T47", 0],
      ["@task.V3.T18", 1],
      ["@task.V3.T19", 2],
    ]);

    const open = (...tasks: ReadonlyArray<string>) =>
      new Map([...slices.keys()].map((t) => [t, tasks.includes(t)]));

    assert.equal(currentSlice(open("@task.V3.T47", "@task.V3.T18"), slices), 0);
    assert.equal(currentSlice(open("@task.V3.T18", "@task.V3.T19"), slices), 1);
    assert.equal(currentSlice(taskStatuses(), taskSlices()), 0);
  });

  it("static rows reach from the construction cases production passes, not a fixed empty list", () => {
    assert.deepEqual(
      productionStatics().map((c) => c.id),
      [],
    );
    assert.deepEqual(
      productionStatics(["CMP-01"]).map((c) => c.id).length,
      constructionCases.length - 1,
    );
  });

  it("passes over every Plan feature, production's declarations, the pilots' reach and the hand cases", () => {
    assert.deepEqual(matrixGate(realInput()), []);
  }, 60_000);

  it("on the real rows, fails a built feature marked owed and a declared code no pilot reaches", () => {
    const input = realInput();

    assert.deepEqual(matrixGate({ ...input, owes: [...input.owes, owedTo("P02")] }), [
      "P02: built, yet marked owed",
    ]);

    const noLookup = new Set([...input.reached].filter((c) => c !== "lk"));

    assert.ok(
      matrixGate({ ...input, reached: noLookup }).includes("lk: declared, reached by no fixture"),
    );
  }, 60_000);
});
