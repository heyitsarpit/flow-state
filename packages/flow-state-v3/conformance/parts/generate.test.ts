import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Schema } from "effect";
import { parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import { Script } from "../dsl/script.ts";
import { BUILD_SEEDS, HELD_OUT_SEEDS, mixOf, scriptOf } from "./generate.ts";

const ScriptJson = Schema.fromJsonString(Script);

const partNamed = (name: string) => {
  const part = parts.find((p) => p.sketch === name);
  assert.ok(part !== undefined, `${name} is not built`);

  return part;
};

/**
 * The events of a part's actions that claim `code`.
 */
const eventsClaiming = (name: string, code: string) =>
  Object.values(partNamed(name).user)
    .flat()
    .flatMap((a) => (a.kind === "send" && a.codes.includes(code) ? [a.event] : []));

const sentEvents = (script: Script) =>
  script.steps.flatMap((s) => (s._tag === "send" ? [s.event] : []));

describe("scripts from parts (Q7, Q8, Q20: Conformance R15, R16, I47, I52, T30, T34)", () => {
  it("a script encodes to JSON and decodes unchanged, the same for the same seed", () => {
    assert.equal(parts.length, 3);

    for (const part of parts) {
      const script = scriptOf(part, "usual", 7, production);
      const json = Schema.encodeSync(ScriptJson)(script);

      assert.deepEqual(Schema.decodeSync(ScriptJson)(json), script);
      assert.equal(Schema.encodeSync(ScriptJson)(scriptOf(part, "usual", 7, production)), json);
      assert.notEqual(Schema.encodeSync(ScriptJson)(scriptOf(part, "usual", 8, production)), json);
    }
  });

  it("every script moves past its prefix", () => {
    assert.equal(parts.length, 3);

    for (const part of parts)
      for (const seed of BUILD_SEEDS.slice(0, 5))
        assert.ok(sentEvents(scriptOf(part, "usual", seed, production)).length >= 3, part.name);
  });

  it("S10 on production draws no admission storm (ad is round-14's code)", () => {
    const storm = eventsClaiming("S10", "ad");
    assert.ok(storm.length > 0, "S10 has no ad action");

    for (const seed of BUILD_SEEDS) {
      const script = scriptOf(partNamed("S10"), "stress", seed, production);
      assert.deepEqual(
        sentEvents(script).filter((e) => storm.includes(e)),
        [],
        script.id,
      );
    }
  });

  it("S16 for a runtime without cm draws no cancel, in usual and stress", () => {
    const cancels = eventsClaiming("S16", "cm");
    const without = production.filter((c) => c !== "cm");
    assert.ok(cancels.length > 0, "S16 has no cm action");

    for (const profile of ["usual", "stress"] as const)
      for (const seed of BUILD_SEEDS)
        assert.deepEqual(
          sentEvents(scriptOf(partNamed("S16"), profile, seed, without)).filter((e) =>
            cancels.includes(e),
          ),
          [],
        );
  });

  it("stress scripts draw faults usual ones do not", () => {
    assert.equal(parts.length, 3);

    for (const part of parts) {
      const tags = (profile: "usual" | "stress") =>
        new Set(
          BUILD_SEEDS.flatMap((seed) =>
            scriptOf(part, profile, seed, production).steps.map((s) => s._tag),
          ),
        );

      assert.ok(!tags("usual").has("reload"));
      assert.ok(tags("stress").has("reload"), part.name);
    }
  });

  it("the app mix holds every pilot's actors in one script", () => {
    const mix = mixOf(parts, "usual", 1, production);

    assert.equal(new Set((mix.actors ?? []).map((a) => a.fixture)).size, 3);
  });

  it("held-out seeds are disjoint from the build seeds", () => {
    assert.ok(BUILD_SEEDS.length >= 10 && HELD_OUT_SEEDS.length >= 10);
    assert.deepEqual(
      BUILD_SEEDS.filter((s) => HELD_OUT_SEEDS.includes(s)),
      [],
    );
  });
});
