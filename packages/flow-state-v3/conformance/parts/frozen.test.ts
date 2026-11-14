import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import type { Scenario } from "../dsl/case.ts";
import { scenarios } from "../suite.ts";
import { frozenCount, RULINGS, uncitedNew } from "./frozen.ts";

const planted: Scenario = { id: "NEW-01", cites: [], fixtures: [], run: () => undefined };

describe("frozen hand cases (Q24: Conformance R15, I50, T33)", () => {
  it("every hand case today is frozen or cites its ruling", () => {
    assert.deepEqual(uncitedNew(scenarios), []);
  });

  it("freezes R15's 99 hand cases; each later one cites a record (a prototype key is no ruling)", () => {
    assert.equal(frozenCount, 99);
    assert.ok(Object.values(RULINGS).every((r) => r.startsWith("code:wiki/tasks/V3/")));
    assert.deepEqual(uncitedNew([{ ...planted, id: "constructor" }]), ["constructor"]);
  });

  it("refuses a new hand case that cites no ruling", () => {
    assert.deepEqual(uncitedNew([...scenarios, planted]), ["NEW-01"]);
  });
});
