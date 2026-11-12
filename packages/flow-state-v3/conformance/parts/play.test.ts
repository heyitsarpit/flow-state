import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import { Fact } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
import { BUILD_SEEDS, mixOf, scriptOf } from "./generate.ts";
import { verdictOfLimit } from "../limits.ts";
import { partsOwed, playPart, reachOf } from "./play.ts";

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
    assert.equal(parts.length, 3);

    for (const part of parts) {
      const played = playPart(scriptOf(part, "usual", SEEDS[0] ?? 1, production), "null");

      assert.equal(played.verdict._tag, "Fail");
      assert.ok(!played.verdict.why.includes("defect"));
    }
  });

  it("each owed red still fails on production by its check and Invariant", () => {
    assert.ok(partsOwed.length > 0);

    for (const owed of partsOwed) {
      const [, kind, name, profile, seed] =
        /^(PART|MIX)-(.+)-(usual|stress)-(\d+)$/u.exec(owed.case) ?? [];

      const part = parts.find((p) => p.name === name);
      assert.ok(profile === "usual" || profile === "stress", owed.case);
      assert.ok(kind === "MIX" || part !== undefined, owed.case);

      const script =
        part === undefined
          ? mixOf(parts, profile, Number(seed), production)
          : scriptOf(part, profile, Number(seed), production);

      assert.equal(script.id, owed.case);
      const played = playPart(script, "production");

      assert.ok(verdictOfLimit(owed, played.verdict).held, JSON.stringify(played.verdict));
    }
  });

  it("the suite's own first-contact reds stay fixed: a re-send after a crash lost the ending", () => {
    const played = playPart(mixOf(parts, "stress", 7, production), "production");

    assert.equal(played.verdict._tag, "Pass", JSON.stringify(played.verdict));
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
    assert.equal(
      played.facts.filter((f) => Fact.$is("Stepped")(f) && !f.what.startsWith("end of case"))
        .length,
      mix.steps.length,
    );
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
      assert.ok(
        reached.every(
          (c) =>
            claimed.has(c) || ["dp", "rl", "wa", "rt", "un", "du", "ma", "lr", "sr"].includes(c),
        ),
        part.name,
      );
    }
  });

  it("a claimed code the run never exercised is not reached: no Abandon, no cm; an answer, no un", () => {
    const script: Script = {
      id: "reach-no-cancel",
      fixture: "transfers",
      actor: "acct-1",
      steps: [
        { _tag: "ensure" },
        {
          _tag: "send",
          event: "Send",
          payload: { transferId: "t1", iban: "DE89370400440532013000", cents: 500 },
        },
        { _tag: "ack" },
        { _tag: "answer", operation: "transfer", answer: { _tag: "ok", value: {} } },
        { _tag: "release" },
      ],
    };

    const transfers = parts.find((p) => p.name === "transfers");
    assert.ok(transfers !== undefined);
    assert.ok(transfers.user["READY"]?.some((a) => a.codes.includes("cm")));

    const played = playPart(script, "production");
    const reached = reachOf(played)[transfers.composite] ?? new Set();

    assert.equal(played.verdict._tag, "Pass", JSON.stringify(played.verdict));
    assert.ok(reached.has("rj") && reached.has("gr"));
    assert.equal(played.skipped, 0);
    assert.ok(!reached.has("cm") && !reached.has("un"));
  });

  it("a late answer reaches lr only after its Attempt ended; a refused batch reaches sr", () => {
    const send = { transferId: "t1", iban: "DE89370400440532013000", cents: 500 };

    const ok = {
      _tag: "answer",
      operation: "transfer",
      answer: { _tag: "ok", value: {} },
    } as const;

    // RETURN_TYPE: a Script, so its steps keep the Step union rather than each literal.
    const steps = (after: ReadonlyArray<Script["steps"][number]>): Script => ({
      id: "reach-late",
      fixture: "transfers",
      actor: "acct-1",
      steps: [{ _tag: "ensure" }, { _tag: "send", event: "Send", payload: send }, ...after],
    });

    const reached = (script: Script) => {
      const played = playPart(script, "production");

      assert.equal(played.verdict._tag, "Pass", JSON.stringify(played.verdict));

      return reachOf(played)["C"] ?? new Set();
    };

    const abandon = { _tag: "send", event: "Abandon", payload: { transferId: "t1" } } as const;

    assert.ok(reached(steps([{ _tag: "ack" }, abandon, ok])).has("lr"));
    assert.ok(!reached(steps([{ _tag: "ack" }, ok, abandon])).has("lr"));
    assert.ok(reached(steps([{ _tag: "refuse" }])).has("sr"));
    assert.ok(!reached(steps([{ _tag: "ack" }, ok])).has("sr"));
  });

  it("steps after a stop reach nothing", () => {
    const script: Script = {
      id: "reach-after-stop",
      fixture: "transfers",
      actor: "acct-1",
      steps: [{ _tag: "ensure" }, { _tag: "release" }],
    };

    const played = playPart(script, "null");

    assert.equal(played.verdict._tag, "Fail");
    assert.ok(!played.facts.some(Fact.$is("Released")));
    assert.ok(!Object.values(reachOf(played)).some((codes) => codes.has("gr")));
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
        { _tag: "release" },
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
