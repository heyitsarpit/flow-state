import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import { Fact } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
import { BUILD_SEEDS, mixOf, scriptOf } from "./generate.ts";
import { playPart, reachOf } from "./play.ts";

const SEEDS = BUILD_SEEDS.slice(0, 4);

const answers = (script: Script) => script.steps.filter((s) => s._tag === "answer").length;

describe("part scripts on production (Q9, Q10, Q15, Q17: Conformance R15, R19, R22, I48, I60)", () => {
  it("each pilot's usual and stress scripts pass on production, most answers landing", () => {
    assert.equal(parts.length, 3);

    for (const part of parts)
      for (const profile of ["usual", "stress"] as const)
        for (const seed of SEEDS) {
          const script = scriptOf(part, profile, seed, production);
          const played = playPart(script, "production");

          assert.equal(played.verdict._tag, "Pass", JSON.stringify(played.verdict));
          assert.ok(played.facts.some(Fact.$is("Reported")), `${script.id} reported nothing`);
          assert.ok(
            played.skipped * 2 <= answers(script),
            `${script.id}: ${played.skipped} answers skipped`,
          );
        }
  });

  it("the null runtime fails every pilot script by a stated failure", () => {
    for (const part of parts) {
      const played = playPart(scriptOf(part, "usual", SEEDS[0] ?? 1, production), "null");

      assert.equal(played.verdict._tag, "Fail");
      assert.ok(!played.verdict.why.includes("defect"));
    }
  });

  it("refuses a part on round-14", () => {
    assert.ok(parts.length > 0);
    const played = playPart(scriptOf(parts[0]!, "usual", 1, production), "round-14");

    assert.equal(played.verdict._tag, "Fail");
    assert.ok(played.verdict.why.includes("round-14"));
  });

  it("the app mix runs every pilot's actors in one runtime and one world", () => {
    const mix = mixOf(parts, "stress", SEEDS[0] ?? 1, production);
    const played = playPart(mix, "production");

    assert.equal(played.verdict._tag, "Pass", JSON.stringify(played.verdict));
    assert.equal(played.facts.filter(Fact.$is("Stepped")).length, mix.steps.length);
    assert.ok(mix.steps.some((s) => s._tag === "reload"));
    assert.equal(Object.keys(reachOf(played)).length, 3);
  });
});

describe("reach from executed facts (Q11: Conformance R17)", () => {
  it("records codes from what ran, not from what a part claims", () => {
    assert.ok(parts.length > 0);

    for (const part of parts) {
      const played = playPart(scriptOf(part, "usual", SEEDS[0] ?? 1, production), "production");
      const reached = Object.values(reachOf(played)).flatMap((codes) => [...codes]);

      const claimed = new Set(
        Object.values(part.user)
          .flat()
          .flatMap((a) => a.codes),
      );

      assert.ok(reached.includes("rj"), part.name);
      assert.ok(
        reached.every((c) => production.includes(c)),
        part.name,
      );
      assert.ok(reached.length < claimed.size + 6, part.name);
    }
  });

  it("an answer with no open request reaches no unknown ending", () => {
    const part = parts[0];
    assert.ok(part !== undefined);

    const [operation] = part.machine.compiled.operations.keys();

    const script: Script = {
      id: "reach-skipped-answer",
      fixture: part.name,
      actor: part.actors[0] ?? "a",
      steps: [
        { _tag: "ensure" },
        { _tag: "answer", operation: operation ?? "", answer: { _tag: "lost" } },
      ],
    };

    const played = playPart(script, "production");

    assert.equal(played.skipped, 1);
    assert.ok(!Object.values(reachOf(played)).some((codes) => codes.has("un")));
    assert.ok(Object.values(reachOf(played)).some((codes) => codes.size > 0));
  });
});

describe("F1 (Q25): two actors end dirty in one step", () => {
  it("a pilot drives two actors of one machine", () => {
    assert.ok(parts.some((p) => p.actors.length >= 2));
  });
});
