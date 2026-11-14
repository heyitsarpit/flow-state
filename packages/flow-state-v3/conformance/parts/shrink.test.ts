import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
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

const signed = (s: Script, event: string) =>
  signatureOf(playPart(s, "production", undefined, [], Option.none(), judges(event)));

const AT_PAY = "lane-queue WriteLanes I12 at send PayRequested";

describe("part scripts shrink and group by signature (T61; survey item 4)", () => {
  it("a failure's signature is its structured checks, Invariants and move, never its text", () => {
    assert.deepEqual(signed(script("PART-pay-usual-1"), "PayRequested"), Option.some(AT_PAY));
    assert.deepEqual(
      signatureOf(playPart(script("PART-pay-usual-1"), "production")),
      Option.none(),
    );
  });

  it("one check and Invariant reached by different moves are different signatures (review M1)", () => {
    const atSend = signed(script("PART-pay-usual-1"), "PayRequested");
    const atLeave = signed(script("PART-pay-usual-1"), "Leave");

    assert.ok(Option.isSome(atSend) && Option.isSome(atLeave));
    assert.notDeepEqual(atSend, atLeave);
  });

  it("a planted break shrinks to a 1-minimal script: no single step can go (review M2)", () => {
    const original = script("PART-pay-usual-1");
    const shrunk = shrunkPart(original, judges("PayRequested"));

    assert.ok(shrunk.steps.length < original.steps.length, `${shrunk.steps.length}`);
    assert.equal(shrunk.id, "PART-pay-usual-1-shrunk");
    assert.deepEqual(signed(shrunk, "PayRequested"), Option.some(AT_PAY));

    for (let at = 0; at < shrunk.steps.length; at += 1)
      assert.notDeepEqual(
        signed({ ...shrunk, steps: shrunk.steps.toSpliced(at, 1) }, "PayRequested"),
        Option.some(AT_PAY),
        `step ${at} (${shrunk.steps[at]?._tag}) could still go`,
      );
  }, 60_000);

  it("failures group by signature: one group per kind, passing runs in none", () => {
    const runs = ["PART-pay-usual-1", "PART-pay-usual-2", "PART-sync-usual-1"].map((id) => ({
      script: script(id),
      run: playPart(script(id), "production", undefined, [], Option.none(), judges("PayRequested")),
    }));

    const groups = bySignature(runs);

    assert.deepEqual([...groups.keys()], [AT_PAY]);
    assert.deepEqual(groups.get(AT_PAY), ["PART-pay-usual-1", "PART-pay-usual-2"]);
  });
});
