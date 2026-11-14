import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { empty, Phase } from "../dsl/lifecycle-model.ts";
import { Fact } from "../dsl/oracle.ts";
import { capturedAfter } from "./lane-queue.ts";

const lane = {
  actor: { machine: "Bank/Transfers", id: "acct-1" },
  operation: "transfer",
  key: Option.none(),
};

const resending = (id: string) => ({ id, lane, phase: Phase.Resending() });

const step = (purpose: "capture" | "flush" | "acknowledge") => [
  Fact.Wrote({ bytes: 1 }),
  Fact.Purposed({ purpose }),
];

const lives = (wasResending: boolean) => ({
  before: { ...empty, attempts: wasResending ? [resending("att-1")] : [] },
  after: { ...empty, attempts: [resending("att-1")] },
  applied: [],
});

describe("lane-queue's later capture (WriteLanes I26; step-2f O2)", () => {
  it("a later step's capture batch captures a re-send started earlier", () => {
    assert.deepEqual(capturedAfter(lives(true), step("capture"), []), ["att-1"]);
  });

  it("a later step's flush or acknowledgement captures no re-send started earlier", () => {
    assert.deepEqual(capturedAfter(lives(true), step("flush"), []), []);
    assert.deepEqual(capturedAfter(lives(true), step("acknowledge"), []), []);
  });

  it("any batch of the re-send's own step captures it", () => {
    assert.deepEqual(capturedAfter(lives(false), step("flush"), []), ["att-1"]);
  });
});
