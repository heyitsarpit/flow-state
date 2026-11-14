/// <reference types="node" />
import { Console, Effect, Formatter, Option } from "effect";
import { implemented as production, productionFixtures } from "../adapters/production.ts";
import { rules } from "../dsl/lifecycle-rules.ts";
import { scenarioOf } from "../dsl/script.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { Serialize } from "../fixtures/one-lane.ts";
import { isPartScript, regressionFiles } from "../generated.ts";
import { playChosen, PRODUCTION_RUNTIME } from "./args.ts";
import { recording } from "../parts/cells.ts";
import { SLICE_OF } from "../parts/codes.ts";
import { matrixGate } from "../parts/features.ts";
import { fieldGate, modelFields, modelMutants } from "../parts/model-mutation.ts";
import { PAIR_OWNERS } from "../parts/pair-owners.ts";
import { combinationGate } from "../parts/pairs.ts";
import { partsOwed, regressionsOwed } from "../parts/owed.ts";
import { partFaults, playPart, reachedBy, reachOf, undecidedLine } from "../parts/play.ts";
import {
  currentSlice,
  gateScripts,
  heldOutScripts,
  matrixInputOf,
  playedScope,
  scriptById,
  taskSlices,
  taskStatuses,
} from "../parts/records.ts";

const played = () =>
  gateScripts().map((script) => {
    const cells: Array<string> = [];
    const run = playPart(script, "production", recording(rules, cells));

    return { script, run, cells };
  });

const passing = () => played().filter(({ run }) => run.verdict._tag === "Pass");

/**
 * Prints a gate's faults and its VERDICT line, and sets a failing exit code on any fault or when
 * the gate judged nothing.
 */
export const verdict = (lines: ReadonlyArray<string>, total: number, what: string) =>
  Effect.gen(function* () {
    for (const line of lines) yield* Console.log(line);

    if (total === 0) yield* Console.log(`BAD  ${what}: none judged`);

    const ok = lines.length === 0 && total > 0;

    if (!ok) process.exitCode = 1;

    yield* Console.log(`VERDICT ${ok ? "pass" : "fail"} ${total - lines.length}/${total} ${what}`);
  });

const openTasks = () =>
  new Set([...taskStatuses()].flatMap(([task, open]) => (open ? [task] : [])));

/**
 * The parts gate: every gate script, and every owed script at its own seed, passes on production
 * but for its owed breaks, each of which still breaks (Conformance R15, R22).
 */
export const partsGate = Effect.suspend(() => {
  const gate = played();
  const ids = new Set(gate.map(({ script }) => script.id));

  const owedRuns = [...new Set(partsOwed.map((o) => o.case))]
    .filter((id) => !ids.has(id))
    .flatMap((id) => Option.toArray(scriptById(id)))
    .map((script) => ({ script, run: playPart(script, "production") }));

  const runs = [...gate, ...owedRuns];

  return Effect.andThen(
    Console.log(undecidedLine(runs)),
    verdict(
      partFaults(runs, partsOwed, playedScope(), openTasks()),
      runs.length,
      "part scripts on production",
    ),
  );
});

/**
 * The held-out gate: the same judgement over the held-out seeds, which no builder tunes against
 * (Conformance I52; advisor Q8).
 */
export const heldOutGate = Effect.suspend(() => {
  const runs = heldOutScripts().map((script) => ({
    script,
    run: playPart(script, "production"),
  }));

  return verdict(
    partFaults(
      runs,
      partsOwed.filter((o) => runs.some(({ script }) => script.id === o.case)),
      playedScope(),
      openTasks(),
    ),
    runs.length,
    "held-out part scripts on production",
  );
});

/**
 * The matrix gate over the real rows, with the codes the gate scripts reached (Conformance R17).
 */
export const matrixGateMode = Effect.suspend(() => {
  const input = matrixInputOf(reachedBy(played()));

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
    runs: passing().map(({ script, run, cells }) => ({
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
    current: currentSlice(statuses, slices),
  });

  return Console.log(
    `pairs reached ${result.reached}, owed ${result.owed}; triples ${result.triples.reached}/${result.triples.total}; cell pairs ${result.cellPairs.reached}/${result.cellPairs.total} ${Formatter.format(result.cellPairs.byComposite)}`,
  ).pipe(
    Effect.andThen(verdict(result.failures, result.reached + result.owed, "interacting pairs")),
  );
});

/**
 * The model-mutation gate (Conformance T39): every model field is mutated and judged on the
 * pilots; a field no mutation reaches fails, and each field no pilot notices is listed. Failing
 * those too, as I61 asks, waits on parts that reach them (a pending check in
 * `parts/pending.test.ts`).
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
 * The kept regressions on production (Conformance I49): every kept script whose fixtures
 * production boots passes there, or is an owed red judged by the one owed rule; part scripts and
 * owed scripts play through the part player. A hand script's saved signature (`by`) is round-14's,
 * where the generators found it, and the `regressions round-14` gate checks it; a part script's
 * is production's, the only runtime it runs on, and its owed rows check it.
 */
export const productionRegressions = Effect.gen(function* () {
  const kept = regressionFiles.filter(
    ({ script }) =>
      isPartScript(script.id) ||
      scenarioOf(script, [Pay, Cells, Serialize]).fixtures.every((f) =>
        productionFixtures.has(f.name),
      ),
  );

  const lines = yield* Effect.forEach(
    kept,
    ({ script }) =>
      isPartScript(script.id) || regressionsOwed.some((o) => o.case === script.id)
        ? Effect.succeed(
            partFaults(
              [{ script, run: playPart(script, "production", rules, regressionsOwed) }],
              regressionsOwed.filter((o) => o.case === script.id),
              undefined,
              openTasks(),
            ),
          )
        : Effect.map(
            playChosen(
              [],
              PRODUCTION_RUNTIME,
              [scenarioOf(script, [Pay, Cells, Serialize])],
              () => [],
            ),
            (verdicts) => {
              const [first] = verdicts;

              if (first === undefined) return [`BAD  ${script.id}: no verdict`];

              return first._tag === "Pass" ? [] : [`BAD  ${script.id}: ${Formatter.format(first)}`];
            },
          ),
    { concurrency: 1 },
  );

  const ghosts = regressionsOwed
    .filter((o) => !kept.some(({ script }) => script.id === o.case))
    .map((o) => `BAD  ${o.case}: owed to ${o.owner}, but no kept regression has this id`);

  return yield* verdict(
    [...ghosts, ...lines.flat()],
    kept.length,
    "kept regressions on production",
  );
});
