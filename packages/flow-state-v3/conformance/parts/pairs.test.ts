/// <reference types="node" />
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { implemented as production } from "../adapters/production.ts";
import { interacts, interactingPairs, quietPairs } from "./channels.ts";
import { CODES } from "./codes.ts";
import { combinationGate, type PairInput, pairKey, type RunReach } from "./pairs.ts";

const LIST = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../workflow/plans/flow/references/proposals/t47-non-interacting-2026-11-12.md",
);

const run = (id: string, byComposite: Record<string, ReadonlyArray<string>>, mix = false) =>
  ({
    id,
    mix,
    byComposite: Object.fromEntries(
      Object.entries(byComposite).map(([c, codes]) => [c, new Set(codes)]),
    ),
  }) satisfies RunReach;

/**
 * A three-code runtime: `rj` and `ky` interact (channel W), as do `ky` and `rl` (an owner), and
 * `rj` and `rl` (an owner); `gd` is pure-turn and interacts with none of them.
 */
const base: PairInput = {
  declared: ["rj", "ky", "rl", "gd"],
  runs: [run("r1", { C: ["rj", "ky", "rl"] })],
  owners: {},
  tasks: { "@task.V3.T18": { open: true, slice: 1 }, "@task.V3.T16": { open: false, slice: 0 } },
  sliceOf: { rj: 0, ky: 0, rl: 0, gd: 0, lt: 1 },
  current: 0,
};

describe("pairs from the channel table (Q13, Q21: Conformance R18, I56, T36)", () => {
  it("gives 671 pairs over the 53 codes and 74 over today's 15", () => {
    assert.equal(interactingPairs(CODES).length, 671);
    assert.equal(interactingPairs(production).length, 74);
  });

  it("splits every pair of the 53 into interacting or quiet with a rule", () => {
    const quiet = quietPairs(CODES);

    assert.equal(interactingPairs(CODES).length + quiet.length, (53 * 52) / 2);
    assert.ok(quiet.every((q) => q.rule.length > 0 && !interacts(...q.pair)));
  });

  it("never quiets a pair sharing a channel, and policies never interact", () => {
    assert.ok(interacts("ky", "sb"));
    assert.ok(interacts("du", "ms"));
    assert.ok(!interacts("rj", "lt"));
    assert.ok(!interacts("gd", "ck"));
  });

  it("the list for the user's approval is the generator's output", () => {
    const written = readFileSync(LIST, "utf8")
      .split("\n")
      .flatMap((line) => /^- `(\w+)` `(\w+)`: /.exec(line)?.slice(1, 3) ?? [])
      .reduce<Array<string>>(
        (all, c, i) => (i % 2 === 1 ? [...all, `${all.pop()}+${c}`] : [...all, c]),
        [],
      );

    assert.deepEqual(
      written,
      quietPairs(CODES).map((q) => pairKey(...q.pair)),
    );
  });
});

describe("combination gate (Q14: Conformance R18, I57, I58, T36)", () => {
  it("passes when every interacting pair is reached together", () => {
    const verdict = combinationGate(base);

    assert.deepEqual(verdict.failures, []);
    assert.equal(verdict.reached, 3);
  });

  it("fails on a pair reached only in two different runs", () => {
    const split = { ...base, runs: [run("r1", { C: ["rj", "rl"] }), run("r2", { C: ["ky"] })] };

    assert.ok(combinationGate(split).failures.some((f) => f.includes("rj+ky")));
  });

  it("fails on an unreached pair with no owner, or an owner that is done, unknown or names no part", () => {
    const unreached = { ...base, runs: [run("r1", { C: ["rj", "rl"] })] };
    const owner = { task: "@task.V3.T18", slice: 1, by: "S12 cancel", date: "2026-11-12" };

    assert.equal(combinationGate(unreached).failures.length, 2);
    assert.equal(
      combinationGate({ ...unreached, owners: { "rj+ky": owner, "ky+rl": owner } }).failures.length,
      0,
    );

    for (const bad of [
      { ...owner, task: "@task.V3.T16" },
      { ...owner, task: "@task.V3.T99" },
      { ...owner, by: "" },
    ])
      assert.ok(
        combinationGate({ ...unreached, owners: { "rj+ky": bad, "ky+rl": owner } }).failures
          .length > 0,
        JSON.stringify(bad),
      );
  });

  it("counts a cross-composite pair in the app mix only with a shared-resource code", () => {
    const mixed = { ...base, runs: [run("m", { C: ["rj", "rl"], H: ["ky"] }, true)] };

    const failures = combinationGate(mixed).failures;
    assert.ok(failures.some((f) => f.includes("rj+ky")));
    assert.ok(!failures.some((f) => f.includes("ky+rl")));
  });

  it("counts only implemented codes, and an unreached triple changes no verdict", () => {
    const wider = { ...base, declared: [...base.declared, "zz"] };

    assert.deepEqual(combinationGate({ ...base, sliceOf: { ...base.sliceOf } }).failures, []);
    assert.ok(combinationGate(wider).failures.length > 0);
    assert.ok(combinationGate(base).triples.total >= 1);
  });
});
