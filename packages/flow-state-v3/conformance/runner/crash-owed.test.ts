import assert from "node:assert/strict";
import { Effect, Option } from "effect";
import { describe, it } from "vite-plus/test";
import { productionPort } from "../adapters/production.ts";
import { OwedItem } from "../parts/owed.ts";
import { oracles, scenarios } from "../suite.ts";
import { crashFaults, crashOwed, type CrashRun } from "./crash-owed.ts";
import { crashCase } from "./run.ts";

const owners = new Set(crashOwed.map((o) => o.owner));

const run = (over: Partial<CrashRun>) =>
  ({
    id: "PAY-22",
    points: 20,
    red: [],
    hits: [],
    ...over,
  }) satisfies CrashRun;

const PAY_22 = Option.getOrThrow(Option.fromUndefinedOr(scenarios.find((s) => s.id === "PAY-22")));

describe("crash's reds named and owned (T61; survey item 3)", () => {
  it("every owed crash row names one point, its check, Invariant and exact Attempts, and an owner", () => {
    assert.deepEqual(
      crashOwed.map((o) => `${o.case} ${o.check} ${o.invariant} ${o.owner}`),
      [
        "PAY-22@16 lane-queue WriteLanes I12 @task.V3.T19",
        "PAY-22@16 delivered-once WriteLanes I16 @task.V3.T19",
        "PAY-22@16 delivered-once WriteLanes I15 @task.V3.T19",
        "DISP-02@6 delivered-once WriteLanes I15 @task.V3.T54",
        "DISP-02@6 disposal Actors I29 @task.V3.T54",
        "DISP-06@5 delivered-once WriteLanes I15 @task.V3.T54",
        "DISP-06@5 disposal Actors I29 @task.V3.T54",
      ],
    );

    for (const o of crashOwed) assert.ok(o.items.every(OwedItem.$is("Attempt")), o.case);
  });

  it("an unowned red point fails, named", () => {
    const red = { _tag: "Fail", id: "PAY-22@3", oracles: ["lane-queue"], why: "planted" } as const;
    const faults = crashFaults([run({ red: [red] })], crashOwed, owners);

    assert.equal(faults.length > 0, true);
    assert.match(faults.join("\n"), /PAY-22@3/u);
  });

  it("an owed item that no longer breaks fails, and so does a row whose owner is done", () => {
    const stillFails = crashFaults([run({ hits: [] })], crashOwed.slice(0, 1), owners);

    assert.match(stillFails.join("\n"), /no longer breaks/u);

    const hit = {
      point: "PAY-22@16",
      check: "lane-queue",
      invariant: "WriteLanes I12",
      subject: "att-1000-12",
    };

    const done = crashFaults([run({ hits: [hit] })], crashOwed.slice(0, 1), new Set());

    assert.match(done.join("\n"), /not an open Task/u);
    assert.deepEqual(crashFaults([run({ hits: [hit] })], crashOwed.slice(0, 1), owners), []);
  });

  it("on production, PAY-22's crash point 16 breaks only by its owed Attempt, and red without its row", async () => {
    const owed = await Effect.runPromise(crashCase(productionPort, PAY_22, oracles, [], crashOwed));

    assert.deepEqual(owed.red, []);
    assert.deepEqual(
      [...new Set(owed.hits.map((h) => `${h.point} ${h.check} ${h.invariant} ${h.subject}`))],
      [
        "PAY-22@16 lane-queue WriteLanes I12 att-1000-12",
        "PAY-22@16 delivered-once WriteLanes I16 att-1000-12",
        "PAY-22@16 delivered-once WriteLanes I15 att-1000-12",
      ],
    );

    const unowned = await Effect.runPromise(crashCase(productionPort, PAY_22, oracles, [], []));

    assert.deepEqual(
      unowned.red.map((v) => v.id),
      ["PAY-22@16"],
    );
  });
});
