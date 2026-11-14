import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import { oracles } from "../suite.ts";
import { scriptById } from "./records.ts";
import { bySignature, shrunkPart, signatureOf } from "./shrink.ts";
import { playPart } from "./play.ts";

const planted = (event: string) => {
  const found = violation("WriteLanes I12: planted", Option.some("att-planted"));

  return oracle<number>({
    name: "lane-queue",
    guarantee: [found.invariant],
    start: () => 0,
    step: (n, cut) => [
      n + 1,
      cut.some((f) => Fact.$is("Drove")(f) && f.event === event) ? [found] : [],
    ],
  });
};

const judges = (event: string) => [...oracles, planted(event)];
const script = (id: string) => Option.getOrThrow(scriptById(id));

describe("part scripts shrink and group by signature (T61; survey item 4)", () => {
  it("a failure's signature is its structured checks and Invariants, never its text", () => {
    const run = playPart(
      script("PART-pay-usual-1"),
      "production",
      undefined,
      [],
      Option.none(),
      judges("PayRequested"),
    );

    assert.deepEqual(signatureOf(run), Option.some("lane-queue WriteLanes I12"));
    assert.deepEqual(
      signatureOf(playPart(script("PART-pay-usual-1"), "production")),
      Option.none(),
    );
  });

  it("a planted break shrinks to fewer steps that still fail by the same signature", () => {
    const original = script("PART-pay-usual-1");
    const shrunk = shrunkPart(original, judges("PayRequested"));

    assert.ok(shrunk.steps.length < original.steps.length, `${shrunk.steps.length}`);
    assert.ok(shrunk.steps.some((s) => s._tag === "send" && s.event === "PayRequested"));
    assert.equal(shrunk.id, "PART-pay-usual-1-shrunk");
    assert.deepEqual(
      signatureOf(
        playPart(shrunk, "production", undefined, [], Option.none(), judges("PayRequested")),
      ),
      Option.some("lane-queue WriteLanes I12"),
    );
  });

  it("failures group by signature: one group per kind, passing runs in none", () => {
    const runs = ["PART-pay-usual-1", "PART-pay-usual-2", "PART-sync-usual-1"].map((id) => ({
      script: script(id),
      run: playPart(script(id), "production", undefined, [], Option.none(), judges("PayRequested")),
    }));

    const groups = bySignature(runs);

    assert.deepEqual([...groups.keys()], ["lane-queue WriteLanes I12"]);
    assert.deepEqual(groups.get("lane-queue WriteLanes I12"), [
      "PART-pay-usual-1",
      "PART-pay-usual-2",
    ]);
  });
});
