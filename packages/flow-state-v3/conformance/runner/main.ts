/// <reference types="node" />
import { Console, Effect, Option, Schema } from "effect";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { coverageOf, Gap, Standing } from "../coverage.ts";
import { notYet } from "../not-yet.ts";
import {
  caseChecks,
  caseIds,
  guarantees,
  probes,
  remainders,
  scenarios,
  staticCases,
} from "../suite.ts";
import {
  DEFAULT_RUNTIME,
  failed,
  flag,
  graphsFor,
  lineOf,
  list,
  MAIN,
  NULL_RUNTIME,
  PACKAGE,
  parallelOf,
  playChosen,
  PRODUCTION_RUNTIME,
  REPOSITORY,
  runtimeOf,
  runtimeSurface,
} from "./args.ts";
import {
  CASE_EXPECTATIONS,
  falsifyOne,
  MutantVerdict,
  probeOne,
  ProbeVerdict,
  suiteIn,
} from "./falsify.ts";
import { falsifyOnProduction } from "./falsify-production.ts";
import { productionCases, writeGates } from "./gates.ts";
import { matrixFile, writeMatrix } from "./matrix.ts";
import { crash, liar } from "./modes.ts";
import { runCoreMutants } from "./mutate.ts";
import { runStatics } from "./run.ts";
import { coreInvariants, openTasks } from "./specs.ts";
import { type CaseVerdict, VERDICTS_LINE, VerdictsJson } from "./verdict.ts";

const report = (verdicts: ReadonlyArray<CaseVerdict>, json: boolean) =>
  Effect.gen(function* () {
    const passed = verdicts.filter((v) => v._tag === "Pass").length;
    const ok = passed === verdicts.length && verdicts.length > 0;

    if (!ok) process.exitCode = 1;

    if (json) {
      yield* Console.log(`${VERDICTS_LINE}${Schema.encodeSync(VerdictsJson)(verdicts)}`);

      return;
    }

    for (const v of verdicts) yield* Console.log(lineOf(v));
    yield* Console.log(`VERDICT ${ok ? "pass" : "fail"} ${passed}/${verdicts.length}`);
  });

const sliceVerdicts = (runtime: string, ids: ReadonlyArray<string>) =>
  suiteIn(MAIN, runtime, ids, 240).pipe(
    Effect.map((verdicts) => ({ verdicts, why: "its child stated no verdict for it" })),
    Effect.catchTag("NoVerdicts", (e) => Effect.succeed({ verdicts: [], why: e.why })),
    Effect.map(({ verdicts, why }) => [
      ...verdicts,
      ...ids.flatMap((id) => (verdicts.some((v) => v.id === id) ? [] : [failed(id, why)])),
    ]),
  );

const suite = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = runtimeOf(args);
    const only = list(flag(args, "--only"));

    const wanted = (id: string) =>
      Option.match(only, { onNone: () => true, onSome: (ids) => ids.includes(id) });

    const chosen = scenarios.filter((s) => wanted(s.id));
    const chosenStatic = staticCases.filter((s) => wanted(s.id));

    const missing = Option.getOrElse(only, () => []).flatMap((id) =>
      caseIds.includes(id) ? [] : [failed(id, "no such case")],
    );

    const json = args.includes("--json");
    const parallel = parallelOf(args);

    if (parallel > 1) {
      const ids = [...chosen, ...chosenStatic].map((s) => s.id);

      const slices = Array.from({ length: parallel }, (_, i) =>
        ids.filter((_, j) => j % parallel === i),
      ).filter((slice) => slice.length > 0);

      const runs = yield* Effect.forEach(slices, (ids) => sliceVerdicts(runtime, ids), {
        concurrency: parallel,
      });

      return yield* report([...runs.flat(), ...missing], json);
    }

    const surface = yield* runtimeSurface(runtime);

    const runtimeVerdicts =
      chosen.length === 0
        ? []
        : yield* playChosen(args, runtime, chosen, graphsFor(surface, chosen));

    const staticVerdicts =
      chosenStatic.length === 0 ? [] : yield* runStatics(surface, chosenStatic);

    return yield* report([...runtimeVerdicts, ...staticVerdicts, ...missing], json);
  });

const gapLine = (gap: Gap) =>
  Gap.$match(gap, {
    Uncovered: ({ invariant }) =>
      `BAD  ${invariant}: no oracle with a mutant, and no "not yet" row`,
    Stale: ({ invariant, owner }) =>
      `BAD  ${invariant}: checked now, but still in ${owner}'s "not yet" row`,
    Unknown: ({ invariant, where }) => `BAD  ${invariant}: named by ${where}, in no core Spec`,
    Twice: ({ invariant }) => `BAD  ${invariant}: in two "not yet", case-covered or remainder rows`,
    Unproven: ({ invariant, cases }) =>
      `BAD  ${invariant}: case-covered by ${cases.join(", ")}, but no prototype mutant expecting it runs one`,
    Uncited: ({ invariant, case: id }) =>
      `BAD  ${invariant}: case-covered by ${id}, which does not exist or does not cite it`,
    Unchecked: ({ invariant, owner }) =>
      `BAD  ${invariant}: ${owner} owes a remainder of it, but it has no standing check`,
    Unowned: ({ invariant, owner }) =>
      `BAD  ${invariant}: owed by ${owner}, which does not resolve or is done`,
  });

const standingLine = (standing: Standing) =>
  Standing.$match(standing, {
    Checked: ({ invariant, oracle, mutants }) =>
      `checked ${invariant}  ${oracle}: ${mutants.join(", ")}`,
    CaseChecked: ({ invariant, cases, mutants }) =>
      `checked ${invariant}  cases ${cases.join(", ")}: ${mutants.join(", ")}`,
    Partial: ({ invariant, checkedBy, owner, owed }) =>
      `partly  ${invariant}  ${checkedBy}; ${owner} owes ${owed}`,
    Owed: ({ invariant, owner }) => `not yet ${invariant}  ${owner}`,
  });

const covered = (verbose: boolean) =>
  Effect.gen(function* () {
    const invariants = yield* coreInvariants(REPOSITORY);

    const open = yield* openTasks(
      REPOSITORY,
      [...notYet, ...remainders].map((r) => r.owner),
    );

    const { standings, gaps } = coverageOf({
      invariants,
      guarantees,
      notYet,
      remainders,
      checks: caseChecks,
      open,
    });

    const checked = standings.filter((s) => !Standing.$is("Owed")(s)).length;
    const partly = standings.filter(Standing.$is("Partial")).length;

    if (verbose) {
      for (const s of standings) yield* Console.log(standingLine(s));

      // The coverage standings per Invariant: the phase-out baseline later steps compare against.
      yield* Effect.sync(() =>
        writeFileSync(
          resolve(dirname(MAIN), "..", "coverage-standings.txt"),
          `${standings.map(standingLine).toSorted().join("\n")}\n`,
        ),
      );
    }

    for (const gap of gaps) yield* Console.log(gapLine(gap));

    yield* Console.log(
      `${gaps.length === 0 ? "ok  " : "BAD "} coverage: ${checked} of ${invariants.length} core Invariants checked (${partly} in part), ${standings.length - checked} owed by a Task, ${gaps.length} gap(s)`,
    );

    return gaps.length === 0;
  }).pipe(
    Effect.catchTag("SpecUnreadable", (e) =>
      Effect.as(
        Console.log(`BAD  coverage: the Spec ${e.spec} could not be read: ${e.why}`),
        false,
      ),
    ),
  );

const coverage = () =>
  Effect.gen(function* () {
    const ok = yield* covered(true);

    if (!ok) process.exitCode = 1;
  });

const falsifyProductionRuntime = (args: ReadonlyArray<string>) =>
  falsifyOnProduction({
    main: MAIN,
    packageDir: PACKAGE,
    scratch: resolve(Option.getOrElse(flag(args, "--scratch"), () => tmpdir())),
    only: list(flag(args, "--mutant")),
    parallel: parallelOf(args),
    sweep: args.includes("--sweep") ? Option.some(productionCases) : Option.none(),
  });

const probeLine = (v: ProbeVerdict) =>
  ProbeVerdict.$match(v, {
    Holds: ({ probe, holds, red }) =>
      holds === "green"
        ? `ok   ${probe}  stays green`
        : `PEND ${probe}  pending the user's call; red in ${red.length}: ${red.join(" ")}`,
    Broken: ({ probe, why }) => `BAD  ${probe}  ${why}`,
  });

/**
 * A full prototype falsify run rewrites its catch matrix, or with `--sweep` its sweep record
 * (every mutant on every case, the phase-out baseline), and prints each catch it lost.
 */
const matrixOf = (full: boolean, sweep: boolean, rows: ReadonlyArray<string>) =>
  full
    ? Effect.tap(
        writeMatrix(resolve(dirname(MAIN), "..", matrixFile("prototype", sweep)), rows),
        (lost) =>
          Effect.forEach(lost, (row) => Console.log(`BAD  lost catch: ${row}`), { concurrency: 1 }),
      )
    : Effect.succeed<ReadonlyArray<string>>([]);

const falsify = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = resolve(Option.getOrElse(flag(args, "--runtime"), () => DEFAULT_RUNTIME));
    const coverageOk = yield* covered(false);
    const scratch = resolve(Option.getOrElse(flag(args, "--scratch"), () => tmpdir()));
    const only = list(flag(args, "--mutant"));
    const sweep = args.includes("--sweep");

    const byOracle = guarantees.map((g) => ({
      oracle: g.oracle.name,
      mutants: g.mutants.filter((m) => m.runtime === "prototype"),
    }));

    const unfalsified = byOracle.filter((g) => g.mutants.length === 0).map((g) => g.oracle);

    const runnable = [
      ...byOracle,
      {
        oracle: CASE_EXPECTATIONS,
        mutants: caseChecks.mutants.filter((m) => m.runtime === "prototype"),
      },
    ];

    yield* Console.log(
      `${unfalsified.length === 0 ? "ok  " : "BAD "} every oracle has a mutant${unfalsified.length === 0 ? "" : `; none for: ${unfalsified.join(" ")}`}`,
    );

    const chosen = runnable.flatMap((g) =>
      g.mutants
        .filter((m) =>
          Option.match(only, { onNone: () => true, onSome: (names) => names.includes(m.name) }),
        )
        .map((mutant) => ({
          oracle: g.oracle,
          mutant: sweep ? { ...mutant, cases: caseIds } : mutant,
        })),
    );

    const chosenProbes = probes
      .filter((p) => p.runtime === "prototype")
      .filter((p) =>
        Option.match(only, { onNone: () => true, onSome: (names) => names.includes(p.name) }),
      )
      .map((p) => (sweep ? { ...p, cases: caseIds } : p));

    const stated = (run: string, ids: ReadonlyArray<string>) =>
      suiteIn(MAIN, run, ids, 120).pipe(
        Effect.map(Option.some),
        Effect.catchTag("NoVerdicts", () =>
          Effect.succeed(Option.none<ReadonlyArray<CaseVerdict>>()),
        ),
      );

    const onNull = yield* stated(NULL_RUNTIME, caseIds);

    const nullRed = Option.match(onNull, {
      onNone: () => false,
      onSome: (v) => v.length === caseIds.length && v.every((x) => x._tag === "Fail"),
    });

    yield* Console.log(
      `${nullRed ? "ok  " : "BAD "} null runtime and surface: every case states a failure`,
    );

    const control = yield* stated(runtime, [
      ...new Set([
        ...chosen.flatMap(({ mutant }) => mutant.cases),
        ...chosenProbes.flatMap((p) => p.cases),
      ]),
    ]);

    const controlGreen = Option.match(control, {
      onNone: () => false,
      onSome: (v) => v.length > 0 && v.every((x) => x._tag === "Pass"),
    });

    yield* Console.log(
      `${controlGreen ? "ok  " : "BAD "} control: the mutants' cases pass on the unedited runtime`,
    );

    const runs = yield* Effect.forEach(
      chosen,
      ({ oracle, mutant }) => falsifyOne(MAIN, runtime, scratch, oracle, mutant),
      { concurrency: parallelOf(args) },
    );

    const verdicts = runs.map((r) => r.verdict);

    // A full run rewrites the catch matrix or the sweep (advisor Q6); a lost catch fails the run.
    const lost = yield* matrixOf(
      Option.isNone(only),
      sweep,
      runs.flatMap((r) => r.rows),
    );

    for (const v of verdicts)
      yield* Console.log(
        MutantVerdict.$match(v, {
          Caught: ({ mutant, why, red, caughtIn }) =>
            `ok   ${mutant}  caught: ${why}${sweep ? `\n     red ${red.length}: ${red.join(" ")}\n     by its oracle ${caughtIn.length}: ${caughtIn.join(" ")}` : ""}`,
          WrongReason: ({ mutant, why, red }) =>
            `BAD  ${mutant}  red by another check: ${why}${sweep ? `\n     red ${red.length}: ${red.join(" ")}` : ""}`,
          Survived: ({ mutant }) => `BAD  ${mutant}  survived`,
          NotApplied: ({ mutant, why }) => `BAD  ${mutant}  does not apply: ${why}`,
          NoVerdict: ({ mutant, why }) => `BAD  ${mutant}  no verdict: ${why}`,
        }),
      );
    const caught = verdicts.filter(MutantVerdict.$is("Caught")).length;

    const probed = yield* Effect.forEach(
      chosenProbes,
      (probe) => probeOne(MAIN, runtime, scratch, probe),
      { concurrency: parallelOf(args) },
    );

    for (const v of probed) yield* Console.log(probeLine(v));
    const held = probed.filter(ProbeVerdict.$is("Holds")).length;

    const ok = [
      coverageOk,
      lost.length === 0,
      unfalsified.length === 0,
      nullRed,
      controlGreen,
      caught === verdicts.length,
      held === probed.length,
      verdicts.length + probed.length > 0,
    ].every(Boolean);

    yield* Console.log(
      `VERDICT ${ok ? "pass" : "fail"} ${caught}/${verdicts.length} mutants caught, ${held}/${probed.length} probes hold`,
    );

    if (!ok) process.exitCode = 1;
  });

const main = (args: ReadonlyArray<string>) => {
  const [mode, ...rest] = args;

  if (mode === "suite") return suite(rest);

  if (mode === "falsify")
    return Option.getOrUndefined(flag(rest, "--runtime")) === PRODUCTION_RUNTIME
      ? falsifyProductionRuntime(rest)
      : falsify(rest);

  if (mode === "coverage") return coverage();

  if (mode === "crash") return crash(rest);

  if (mode === "liar") return liar(rest);

  if (mode === "mutate")
    return runCoreMutants({
      packageDir: PACKAGE,
      scratch: resolve(Option.getOrElse(flag(rest, "--scratch"), () => tmpdir())),
      cases: productionCases,
      limit: Number(Option.getOrElse(flag(rest, "--limit"), () => "40")) || 40,
      parallel: parallelOf(rest),
    });

  if (mode === "gates")
    return writeGates(
      MAIN,
      resolve(dirname(MAIN), "..", "gates.json"),
      resolve(Option.getOrElse(flag(rest, "--scratch"), () => tmpdir())),
    );

  return Console.error(
    "usage: bun conformance/runner/main.ts suite|falsify|coverage [--runtime DIR] [--only IDS] [--mutant NAMES] [--parallel N]",
  ).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 2;
      }),
    ),
  );
};

// oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the runner's process entry; @effect/platform-node's runMain is pinned to another Effect version and fails at run time
Effect.runFork(
  main(process.argv.slice(2)).pipe(
    Effect.catchCause((cause) =>
      Console.error(`runner failed: ${String(cause)}`).pipe(
        Effect.andThen(
          Effect.sync(() => {
            process.exitCode = 1;
          }),
        ),
      ),
    ),
  ),
);
