import assert from "node:assert/strict";
import { Formatter, Option } from "effect";
import { describe, it } from "vite-plus/test";
import { parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import { rules } from "../dsl/lifecycle-rules.ts";
import type { Script } from "../dsl/script.ts";
import { recording } from "./cells.ts";
import { Fact } from "../dsl/oracle.ts";
import { BUILD_SEEDS, scriptOf, TIMER_OFFSETS, timerAdvances } from "./generate.ts";
import { playPart } from "./play.ts";
import { owedRows } from "./owed.ts";
import { TRIAGED_SIGNATURES, VARIED_OWED } from "./owed-varied.ts";
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

    const played = variedScripts().flatMap((s) =>
      playPart(s, "production")
        .facts.filter((f) => Fact.$is("Stepped")(f) && f.what.includes("(open #"))
        .map(() => s.id),
    );

    assert.ok(played.length > 0, "no out-of-order answer was played");
  }, 60_000);

  it("a varied timer move lands a ms before its deadline, on it, or a ms after; others on it", () => {
    assert.deepEqual(timerAdvances(Option.some(5000), 3000, "varied"), [1999, 2000, 2001]);
    assert.deepEqual(timerAdvances(Option.some(5000), 5000, "varied"), [0, 1]);
    assert.deepEqual(timerAdvances(Option.some(5000), 3000, "stress"), [2000]);
    assert.deepEqual(timerAdvances(Option.none(), 3000, "varied"), []);
    assert.deepEqual(TIMER_OFFSETS.usual, [0]);

    const advances = (profile: "stress" | "varied") =>
      new Set(
        BUILD_SEEDS.flatMap((seed) =>
          scriptOf(named("pay"), profile, seed, production).steps.flatMap((s) =>
            s._tag === "advance" ? [s.ms] : [],
          ),
        ),
      );

    const varied = advances("varied");
    const stress = advances("stress");

    assert.ok(stress.has(8000) && !stress.has(7999) && !stress.has(8001));
    assert.ok(varied.has(7999) && varied.has(8001), [...varied].join(" "));
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
    const traced = TRIAGED_SIGNATURES;

    const ids = [...new Set(VARIED_OWED.map((r) => r.id))];

    for (const id of ids) {
      const script = Option.getOrThrow(scriptById(id));
      const others = owedRows.filter((o) => o.case !== id);

      const run = playPart(script, "production", undefined, others);
      const signature = Option.getOrThrow(signatureOf(run));
      const root = traced.get(signature);

      assert.ok(root !== undefined, `${id}: untraced signature ${signature}`);

      const step = Math.min(...run.violations.map((v) => v.step));

      for (const v of run.violations.filter((x) => x.step === step)) {
        const subject = Option.getOrThrow(v.subject);

        const rows = VARIED_OWED.filter(
          (r) =>
            r.id === id &&
            r.check === v.oracle &&
            r.invariant === v.invariant &&
            r.items.some((i) => i._tag === "Attempt" && i.id === subject),
        );

        assert.equal(rows.length, 1, `${id} ${v.oracle} ${v.invariant} ${subject}`);
        assert.equal(
          rows[0]?.root,
          root,
          `${id} ${v.oracle} ${v.invariant}: owed to ${rows[0]?.root}`,
        );
      }
    }
  }, 60_000);

  it("a kept regression of a disposed actor's refused head passes with no owed row (soak 5000; its refused head now ends NotSent)", () => {
    const id = "PART-cells-stress-105-shrunk";
    const script = Option.getOrThrow(scriptById(id));

    const run = playPart(
      script,
      "production",
      undefined,
      owedRows.filter((o) => o.case !== id),
    );

    assert.equal(run.verdict._tag, "Pass");
    assert.ok(Option.isNone(signatureOf(run)));
  });

  it("late-results names the late Attempt as its subject, once (review N5)", () => {
    const id = "PART-cells-varied-110";
    const script = Option.getOrThrow(scriptById(id));

    const others = owedRows.filter((o) => !(o.case === id && o.check === "late-results"));

    const late = playPart(script, "production", undefined, others).violations.filter(
      (v) => v.oracle === "late-results",
    );

    assert.ok(late.length > 0);
    assert.ok(
      late.every((v) => Option.contains(v.subject, "att-0000000000000000000000000001adb0-4")),
    );
    assert.equal(new Set(late.map((v) => `${v.step} ${v.text}`)).size, late.length);
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
