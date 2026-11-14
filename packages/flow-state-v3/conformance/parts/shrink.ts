import { Option } from "effect";
import type { Oracle } from "../dsl/oracle.ts";
import type { Script } from "../dsl/script.ts";
import { oracles } from "../suite.ts";
import { owedRows, type PartOwed } from "./owed.ts";
import { type Played, playPart } from "./play.ts";

/**
 * A part run's failure signature (T60's one rule, structured): the checks and Invariants of the
 * violations that stopped it, sorted; a failed case expectation by its label, a defect or a time
 * out by its kind. A run nothing stopped (it passed, or only owed rows broke) has none.
 */
export const signatureOf = (run: Played) =>
  Option.map(run.threw, (v) => {
    if (v._tag === "Timeout") return "timeout";

    if (v._tag === "Pass") return "pass";

    const found = [...new Set((v.violations ?? []).map((x) => `${x.check} ${x.invariant}`))];

    if (found.length > 0) return found.toSorted().join(",");

    return v.expectation === undefined ? "defect" : `case ${v.expectation.label}`;
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

const prefixOf = (script: Script) => {
  const at = script.steps.findIndex((s) => s._tag !== "ensure");

  return at < 0 ? script.steps.length : at;
};

/**
 * A failing part script shrunk on production: chunks of steps after its ensures removed, halves
 * first and then smaller, each removal kept while the run still fails by the same signature, until
 * no single step can go (T61; survey item 4). The result is named `<id>-shrunk`.
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

  const prefix = prefixOf(script);
  let steps = script.steps;

  for (let size = Math.ceil((steps.length - prefix) / 2); size >= 1; size = Math.floor(size / 2)) {
    for (let at = prefix; at + size <= steps.length;) {
      const candidate = steps.toSpliced(at, size);

      if (Option.getOrUndefined(play(candidate)) === Option.getOrUndefined(target))
        steps = candidate;
      else at += size;
    }
  }

  return { ...script, id: `${script.id}-shrunk`, steps };
};
