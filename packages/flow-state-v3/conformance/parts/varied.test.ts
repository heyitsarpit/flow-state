import assert from "node:assert/strict";
import { Formatter, Option } from "effect";
import { describe, it } from "vite-plus/test";
import { parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import { rules } from "../dsl/lifecycle-rules.ts";
import type { Script } from "../dsl/script.ts";
import { recording } from "./cells.ts";
import { BUILD_SEEDS, scriptOf, TIMER_OFFSETS } from "./generate.ts";
import { playPart } from "./play.ts";
import { owedRows } from "./owed.ts";
import { VARIED_OWED } from "./owed-varied.ts";
import { gateScripts, heldOutScripts, scriptById } from "./records.ts";
import { signatureOf } from "./shrink.ts";

const named = (name: string) => {
  const part = parts.find((p) => p.name === name);
  assert.ok(part !== undefined, name);

  return part;
};

const variedScripts = () =>
  parts.flatMap((part) => BUILD_SEEDS.map((seed) => scriptOf(part, "varied", seed, production)));

const cellsOf = (scripts: ReadonlyArray<Script>) =>
  new Set(
    scripts.flatMap((script) => {
      const cells: Array<string> = [];
      playPart(script, "production", recording(rules, cells));

      return cells;
    }),
  );

describe("the generator varies its inputs (T61; Conformance R15, R16)", () => {
  it("a varied script answers an open request other than the oldest of its operation", () => {
    const later = variedScripts().flatMap((s) =>
      s.steps.filter((step) => step._tag === "answerLater" && step.skip > 0),
    );

    assert.ok(later.length > 0);
  });

  it("a varied timer move lands a ms before its deadline, on it, or a ms after; others on it", () => {
    assert.deepEqual(TIMER_OFFSETS.varied, [-1, 0, 1]);
    assert.deepEqual(TIMER_OFFSETS.stress, [0]);
    assert.deepEqual(TIMER_OFFSETS.usual, [0]);
  });

  it("payloads vary by seed: some varied Pay script starts a second intent", () => {
    const intents = new Set(
      BUILD_SEEDS.flatMap((seed) =>
        scriptOf(named("pay"), "varied", seed, production).steps.flatMap((s) =>
          s._tag === "send" && s.event === "Start" ? [Formatter.format(s.payload)] : [],
        ),
      ),
    );

    assert.ok(intents.size > 1, [...intents].join(" "));
  });

  it("the gate plays a usual app mix and a mix that holds Pay", () => {
    const ids = gateScripts().map((s) => s.id);

    assert.ok(
      ids.some((id) => /^MIX-[^ ]*-usual-\d+$/u.test(id)),
      ids.join(" "),
    );
    assert.ok(
      ids.some((id) => /^MIX-[^ ]*\+pay-stress-\d+$/u.test(id)),
      ids.join(" "),
    );
  });

  it("every varied red is triaged by its first signature, each signature's root traced once", () => {
    const traced = new Map([
      ["lane-queue WriteLanes I12", "retry"],
      ["delivered-once WriteLanes I15", "unbound"],
      ["delivered-once WriteLanes I15,disposal Actors I29", "unbound"],
      ["disposal Actors I29", "retry"],
    ]);

    const ids = [...new Set(VARIED_OWED.map((r) => r.id))];

    for (const id of ids) {
      const script = Option.getOrThrow(scriptById(id));
      const others = owedRows.filter((o) => o.case !== id);

      const signature = Option.getOrThrow(
        signatureOf(playPart(script, "production", undefined, others)),
      );

      const root = traced.get(signature);

      assert.ok(root !== undefined, `${id}: untraced signature ${signature}`);

      for (const row of VARIED_OWED.filter(
        (r) => r.id === id && signature.includes(`${r.check} ${r.invariant}`),
      ))
        assert.equal(row.root, root, `${id} ${row.check} ${row.invariant}`);
    }
  }, 60_000);

  it("some varied or new-mix run reaches a lifecycle cell no earlier run reaches", () => {
    const earlier = /^PART-.+-(?:usual|stress)-\d+$|^MIX-sync\+transfers\+sign-in-stress-\d+$/u;
    const played = [...gateScripts(), ...heldOutScripts()];
    const before = cellsOf(played.filter((s) => earlier.test(s.id)));
    const after = cellsOf(played.filter((s) => !earlier.test(s.id)));

    assert.ok(
      [...after].some((c) => !before.has(c)),
      `${after.size} cells, all reached before`,
    );
  }, 60_000);
});
