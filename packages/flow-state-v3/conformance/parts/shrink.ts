import { Option } from "effect";
import { Fact, type Oracle } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
import { oracles } from "../suite.ts";
import { owedRows, type PartOwed } from "./owed.ts";
import { type Played, playPart } from "./play.ts";

/**
 * The kind of move a step was: `send <event>`, `answer <operation>`, or its first word (`ack`,
 * `reload`, `ensure`, ...); an end-of-case step by its last word.
 */
const moveOf = (what: string) => {
  const words = what.split(" ");
  const [first = "", second = ""] = words;

  if (what.startsWith("end of case")) return `end of case ${words.at(-1) ?? ""}`;

  return first === "send" || first === "answer" ? `${first} ${second}` : first;
};

/**
 * A part run's failure signature (T60's one rule, structured; review M1): the checks and
 * Invariants of the unexcused violations at the first step that broke, sorted, and the kind of
 * move that step was, so one rule reached by different moves (a re-send at an ack, a restore at a
 * reload) signs differently; a failed case expectation by its label, a defect or a time out by its
 * kind. A run nothing stopped (it passed, or only owed rows broke) has none.
 */
export const signatureOf = (run: Played) =>
  Option.map(run.threw, (v) => {
    if (v._tag === "Timeout") return "timeout";

    if (v._tag === "Pass") return "pass";

    const fresh = run.violations.filter((x) => !x.excused);
    const step = Math.min(...fresh.map((x) => x.step));
    const at = fresh.filter((x) => x.step === step);

    if (at.length === 0)
      return v.expectation === undefined ? "defect" : `case ${v.expectation.label}`;

    const what = run.facts.find((f) => Fact.$is("Stepped")(f) && f.step === step);
    const move = what !== undefined && Fact.$is("Stepped")(what) ? moveOf(what.what) : "?";
    const found = [...new Set(at.map((x) => `${x.oracle} ${x.invariant}`))].toSorted();

    return `${found.join(",")} at ${move}`;
  });

/**
 * The scripts of failed runs by signature, each list in run order; runs with no signature are
 * left out.
 */
export const bySignature = (
  runs: ReadonlyArray<{ readonly script: Script; readonly run: Played }>,
) => {
  const groups = new Map<string, Array<string>>();

  for (const { script, run } of runs)
    Option.map(signatureOf(run), (s) => groups.set(s, [...(groups.get(s) ?? []), script.id]));

  return groups;
};

/**
 * A failing part script shrunk on production: chunks of steps removed, halves first and then
 * smaller, each removal kept while the run still fails by the same signature, and passes repeated
 * until one makes no removal, so no single step can go (1-minimal; T61, review M2). The result is
 * named `<id>-shrunk`.
 */
export const shrunkPart = (
  script: Script,
  judges: ReadonlyArray<Oracle> = oracles,
  owed: ReadonlyArray<PartOwed> = owedRows,
) => {
  const play = (steps: Script["steps"]) =>
    signatureOf(
      playPart({ ...script, steps }, "production", undefined, owed, Option.none(), judges),
    );

  const target = play(script.steps);

  if (Option.isNone(target)) return { ...script, id: `${script.id}-shrunk` };

  const same = (steps: Script["steps"]) =>
    Option.getOrUndefined(play(steps)) === Option.getOrUndefined(target);

  let steps = script.steps;

  for (let before = steps.length + 1; steps.length < before;) {
    before = steps.length;

    for (let size = Math.ceil(steps.length / 2); size >= 1; size = Math.floor(size / 2))
      for (let at = 0; at + size <= steps.length;)
        if (same(steps.toSpliced(at, size))) steps = steps.toSpliced(at, size);
        else at += size;
  }

  return { ...script, id: `${script.id}-shrunk`, steps };
};
