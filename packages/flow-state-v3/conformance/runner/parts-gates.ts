/// <reference types="node" />
import { Console, Effect } from "effect";
import { implemented as production, productionFixtures } from "../adapters/production.ts";
import { rules } from "../dsl/lifecycle-rules.ts";
import { scenarioOf } from "../dsl/script.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { Serialize } from "../fixtures/one-lane.ts";
import { regressionFiles } from "../generated.ts";
import type { Limit } from "../limits.ts";
import { playChosen, PRODUCTION_RUNTIME } from "./args.ts";
import { verdictOfLimit } from "../limits.ts";
import { recording } from "../parts/cells.ts";
import { SLICE_OF } from "../parts/codes.ts";
import { matrixGate } from "../parts/features.ts";
import { fieldGate, modelFields, modelMutants } from "../parts/model-mutation.ts";
import { PAIR_OWNERS } from "../parts/pair-owners.ts";
import { combinationGate } from "../parts/pairs.ts";
import { partsOwed, playPart, reachOf } from "../parts/play.ts";
import { gateScripts, matrixInputOf, taskSlices, taskStatuses } from "../parts/records.ts";

const played = () =>
  gateScripts().map((script) => {
    const cells: Array<string> = [];
    const run = playPart(script, "production", recording(rules, cells));

    return { script, run, cells };
  });

/**
 * Prints a gate's faults and its VERDICT line, and sets a failing exit code on any fault.
 */
export const verdict = (lines: ReadonlyArray<string>, total: number, what: string) =>
  Effect.gen(function* () {
    for (const line of lines) yield* Console.log(line);

    const ok = lines.length === 0;

    if (!ok) process.exitCode = 1;

    yield* Console.log(`VERDICT ${ok ? "pass" : "fail"} ${total - lines.length}/${total} ${what}`);
  });

/**
 * The parts gate: every gate script passes on production, and each owed red still fails by its
 * check and Invariant (Conformance R15, R22).
 */
export const partsGate = Effect.suspend(() => {
  const runs = played();

  const faults = runs.flatMap(({ script, run }) => {
    const owed = partsOwed.find((o) => o.case === script.id);

    if (owed !== undefined) {
      const held = verdictOfLimit(owed, run.verdict);

      return held.held ? [] : [`BAD  ${script.id}: owed to ${owed.owner}, but ${held.why}`];
    }

    return run.verdict._tag === "Pass" ? [] : [`BAD  ${script.id}: ${JSON.stringify(run.verdict)}`];
  });

  return verdict(faults, runs.length, "part scripts on production");
});

/**
 * The matrix gate over the real rows, with the codes the gate scripts reached (Conformance R17).
 */
export const matrixGateMode = Effect.suspend(() => {
  const reached = new Set(
    played().flatMap(({ run }) => Object.values(reachOf(run)).flatMap((s) => [...s])),
  );

  const input = matrixInputOf(reached);

  return verdict(matrixGate(input), input.features.length, "matrix rows");
});

/**
 * The combination gate over production's codes, the gate scripts' reach and the dated owners
 * (Conformance R18); triples and cell pairs are printed, never gating.
 */
export const pairsGate = Effect.suspend(() => {
  const statuses = taskStatuses();
  const slices = taskSlices();

  const result = combinationGate({
    declared: production,
    runs: played().map(({ script, run, cells }) => ({
      id: script.id,
      mix: script.id.startsWith("MIX-"),
      byComposite: reachOf(run),
      cells,
    })),
    owners: PAIR_OWNERS,
    tasks: Object.fromEntries(
      [...statuses].map(([task, open]) => [task, { open, slice: slices.get(task) ?? -1 }]),
    ),
    sliceOf: SLICE_OF,
    current: 0,
  });

  return Console.log(
    `pairs reached ${result.reached}, owed ${result.owed}; triples ${result.triples.reached}/${result.triples.total}; cell pairs ${result.cellPairs.reached}/${result.cellPairs.total} ${JSON.stringify(result.cellPairs.byComposite)}`,
  ).pipe(
    Effect.andThen(verdict(result.failures, result.reached + result.owed, "interacting pairs")),
  );
});

/**
 * The model-mutation gate (Conformance T39): every model field is mutated and judged on the
 * pilots; a field no mutation reaches fails, and each field no pilot notices is listed.
 */
export const modelMutationGate = Effect.suspend(() => {
  const mutants = modelMutants();
  const unnoticed = mutants.filter((m) => !m.noticed);

  return Effect.forEach(unnoticed, (m) => Console.log(`unnoticed ${m.field}`), {
    concurrency: 1,
  }).pipe(
    Effect.andThen(
      Console.log(
        `model mutants noticed ${mutants.length - unnoticed.length}/${mutants.length}, by ${[...new Set(mutants.flatMap((m) => (m.noticed ? m.oracle.split(",") : [])))].join(" ")}`,
      ),
    ),
    Effect.andThen(verdict(fieldGate(mutants), modelFields().length, "model fields mutated")),
  );
});

/**
 * Production's owed reds among the kept regression scripts: one a production run fails by a bug
 * a Task owns, checked to still fail by its check and Invariant, so a fix shows.
 */
export const regressionsOwed: ReadonlyArray<Limit & { readonly owner: string }> = [];

/**
 * The kept regressions on production (Conformance I49): every kept script whose fixtures
 * production boots passes there, or is an owed red that still fails by its check and Invariant;
 * part scripts play through the part player. A script's saved signature (`by`) is round-14's,
 * where the generators found it, and the `regressions round-14` gate checks it; production keeps
 * no signature of its own, since every kept script must pass on it or be owed.
 */
export const productionRegressions = Effect.gen(function* () {
  const kept = regressionFiles.filter(({ script }) =>
    scenarioOf(script, [Pay, Cells, Serialize]).fixtures.every((f) =>
      productionFixtures.has(f.name),
    ),
  );

  const lines = yield* Effect.forEach(
    kept,
    ({ script }) =>
      Effect.map(
        /^(PART|MIX)-/u.test(script.id)
          ? Effect.succeed([playPart(script, "production").verdict])
          : playChosen(
              [],
              PRODUCTION_RUNTIME,
              [scenarioOf(script, [Pay, Cells, Serialize])],
              () => [],
            ),
        (verdicts) => {
          const owed = regressionsOwed.find((o) => o.case === script.id);
          const [first] = verdicts;

          if (first === undefined) return [`BAD  ${script.id}: no verdict`];

          if (owed !== undefined) {
            const held = verdictOfLimit(owed, first);

            return held.held ? [] : [`BAD  ${script.id}: owed to ${owed.owner}, but ${held.why}`];
          }

          return first._tag === "Pass" ? [] : [`BAD  ${script.id}: ${JSON.stringify(first)}`];
        },
      ),
    { concurrency: 1 },
  );

  return yield* verdict(lines.flat(), kept.length, "kept regressions on production");
});
