/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Option } from "effect";
import { scenarios, staticCases } from "../suite.ts";
import { CODES, isCode, SLICE_OF } from "./codes.ts";
import { FEATURES } from "./feature-rows.ts";
import { casesReaching, checksOf, type Feature, type MatrixInput, matrixGate } from "./features.ts";
import { playPart, reachOf } from "./play.ts";
import {
  featureRules,
  gateScripts,
  matrixInputOf,
  planIds,
  replanCodeSlices,
  replanSlices,
  taskRecords,
  tableText,
} from "./records.ts";

const KINDS = new Set(["part", "hand", "static", "app", "package"]);

const T18 = { slice: 1, task: "@task.V3.T18", rest: Option.none() };

const rows: ReadonlyArray<Feature> = [
  { id: "M01", kind: "part", codes: ["rj", "ky"], owed: Option.none() },
  { id: "M02", kind: "hand", codes: [], owed: Option.none() },
  { id: "M03", kind: "part", codes: ["lt"], owed: Option.some(T18) },
];

const planted: MatrixInput = {
  features: rows,
  ids: ["M01", "M02", "M03"],
  declared: ["rj", "ky"],
  reached: new Set(["rj", "ky"]),
  claimed: ["rj", "ky"],
  reaching: { hand: { M02: ["PAY-01"] }, static: {} },
  tasks: { "@task.V3.T18": { open: true, slice: 1 }, "@task.V3.T16": { open: false, slice: 0 } },
  sliceOf: { rj: 0, ky: 0, lt: 1 },
  current: 0,
};

const realInput = () => {
  const reached = new Set<string>();

  for (const script of gateScripts())
    for (const codes of Object.values(reachOf(playPart(script, "production"))))
      for (const code of codes) reached.add(code);

  return matrixInputOf(reached);
};

describe("feature matrix (Q12: Conformance R17, I53 to I55, T35)", () => {
  it("has one row per Plan feature, each with a fixture kind", () => {
    assert.equal(planIds().length, 265);
    assert.deepEqual(FEATURES.map((f) => f.id).toSorted(), planIds().toSorted());
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
    const done = { ...rows[2]!, owed: Option.some({ ...T18, slice: 0, task: "@task.V3.T16" }) };
    const other = { ...rows[2]!, owed: Option.some({ ...T18, slice: 2 }) };

    assert.ok(matrixGate({ ...planted, features: [rows[0]!, rows[1]!, done] }).length > 0);
    assert.ok(matrixGate({ ...planted, features: [rows[0]!, rows[1]!, other] }).length > 0);
  });

  it("fails on a declared code no fixture reaches", () => {
    assert.ok(matrixGate({ ...planted, reached: new Set(["rj"]) }).length > 0);
  });

  it("fails on a part claiming a code no runtime under test declares and no later slice builds", () => {
    assert.ok(matrixGate({ ...planted, claimed: ["rj", "ky", "mt"] }).length > 0);
    assert.deepEqual(matrixGate({ ...planted, claimed: ["rj", "lt"] }), []);
  });

  it("fails on a built feature marked owed, and on a hand row no running case reaches", () => {
    const owedBuilt = { ...rows[0]!, owed: Option.some(T18) };

    assert.ok(matrixGate({ ...planted, features: [owedBuilt, rows[1]!, rows[2]!] }).length > 0);
    assert.ok(matrixGate({ ...planted, reaching: { hand: {}, static: {} } }).length > 0);
    assert.ok(
      matrixGate({ ...planted, reaching: { hand: {}, static: { M02: ["CMP-01"] } } }).length > 0,
    );
  });

  it("fails on a row built in part with nothing built, and on a part row with no codes", () => {
    const partly = { ...rows[2]!, owed: Option.some({ ...T18, rest: Option.some("the rest") }) };
    const bare = { ...rows[0]!, codes: [] };

    assert.ok(matrixGate({ ...planted, features: [rows[0]!, rows[1]!, partly] }).length > 0);
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

  it("maps every hand and static case to a feature it reaches, but LANE-11", () => {
    const reaching = casesReaching(featureRules(), [...scenarios, ...staticCases]);
    const mapped = new Set(Object.values(reaching).flat());

    assert.ok(scenarios.length + staticCases.length > 100);
    assert.deepEqual(
      [...scenarios, ...staticCases].filter((c) => !mapped.has(c.id)).map((c) => c.id),
      ["LANE-11"],
    );
  });

  it("passes over every Plan feature, production's declarations, the pilots' reach and the hand cases", () => {
    assert.deepEqual(matrixGate(realInput()), []);
  });

  it("on the real rows, fails a built feature marked owed and a declared code no pilot reaches", () => {
    const input = realInput();

    const owedBuilt = input.features.map((f) =>
      f.id === "P02" ? { ...f, owed: Option.some({ ...T18, slice: 1 }) } : f,
    );

    assert.deepEqual(matrixGate({ ...input, features: owedBuilt }), [
      "P02: built, yet marked owed",
    ]);

    const noLookup = new Set([...input.reached].filter((c) => c !== "lk"));

    assert.ok(
      matrixGate({ ...input, reached: noLookup }).includes("lk: declared, reached by no fixture"),
    );
  });
});
