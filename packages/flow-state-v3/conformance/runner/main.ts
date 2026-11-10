/// <reference types="node" />
import { Console, Effect, Option, Schema } from "effect";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nullPort } from "../adapters/null.ts";
import { loadPrototype, prototypePort } from "../adapters/prototype.ts";
import { coverageOf, Gap, Standing } from "../coverage.ts";
import { notYet } from "../not-yet.ts";
import { guarantees, oracles, scenarios } from "../suite.ts";
import { falsifyOne, MutantVerdict, suiteIn } from "./falsify.ts";
import { runCases } from "./run.ts";
import { coreInvariants } from "./specs.ts";
import { type CaseVerdict, VERDICTS_LINE, VerdictsJson } from "./verdict.ts";

const MAIN = fileURLToPath(import.meta.url);
const NULL_RUNTIME = "null";
const DEFAULT_RUNTIME = resolve(dirname(MAIN), "..", "..", "prototypes", "round-14");
const REPOSITORY = resolve(dirname(MAIN), "..", "..", "..", "..");

const flag = (args: ReadonlyArray<string>, name: string) => {
  const at = args.indexOf(name);

  return at < 0 ? Option.none<string>() : Option.fromUndefinedOr(args[at + 1]);
};

const runtimeOf = (args: ReadonlyArray<string>) => {
  const given = Option.getOrElse(flag(args, "--runtime"), () => DEFAULT_RUNTIME);

  return given === NULL_RUNTIME ? given : resolve(given);
};

const runtimePort = (runtime: string) =>
  runtime === NULL_RUNTIME
    ? Effect.succeed(nullPort)
    : Effect.map(loadPrototype(runtime), prototypePort);

const list = (value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => Option.none<ReadonlyArray<string>>(),
    onSome: (v) => Option.some(v.split(",").filter((x) => x !== "")),
  });

const parallelOf = (args: ReadonlyArray<string>) =>
  Math.min(8, Math.max(1, Number(Option.getOrElse(flag(args, "--parallel"), () => "1")) || 1));

const caughtBy = (oracles: ReadonlyArray<string>) =>
  oracles.length > 0 ? oracles.join(",") : "case";

const lineOf = (v: CaseVerdict) =>
  v._tag === "Pass" ? `pass ${v.id}` : `FAIL ${v.id}  ${caughtBy(v.oracles)}: ${v.why}`;

const failed = (id: string, why: string) =>
  ({ _tag: "Fail", id, oracles: [], why }) satisfies CaseVerdict;

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

    const chosen = scenarios.filter((s) =>
      Option.match(only, { onNone: () => true, onSome: (ids) => ids.includes(s.id) }),
    );

    const missing = Option.getOrElse(only, () => []).flatMap((id) =>
      scenarios.some((s) => s.id === id) ? [] : [failed(id, "no such case")],
    );

    const json = args.includes("--json");
    const parallel = parallelOf(args);

    if (parallel > 1) {
      const slices = Array.from({ length: parallel }, (_, i) =>
        chosen.filter((_, j) => j % parallel === i).map((s) => s.id),
      ).filter((ids) => ids.length > 0);

      const runs = yield* Effect.forEach(slices, (ids) => sliceVerdicts(runtime, ids), {
        concurrency: parallel,
      });

      return yield* report([...runs.flat(), ...missing], json);
    }

    const port = yield* runtimePort(runtime);

    return yield* report([...(yield* runCases(port, chosen, oracles)), ...missing], json);
  });

const gapLine = (gap: Gap) =>
  Gap.$match(gap, {
    Uncovered: ({ invariant }) =>
      `BAD  ${invariant}: no oracle with a mutant, and no "not yet" row`,
    Stale: ({ invariant, owner }) =>
      `BAD  ${invariant}: checked now, but still in ${owner}'s "not yet" row`,
    Unknown: ({ invariant, where }) => `BAD  ${invariant}: named by ${where}, in no core Spec`,
    Twice: ({ invariant }) => `BAD  ${invariant}: in two "not yet" rows`,
  });

const standingLine = (standing: Standing) =>
  Standing.$match(standing, {
    Checked: ({ invariant, oracle, mutants }) =>
      `checked ${invariant}  ${oracle}: ${mutants.join(", ")}`,
    Owed: ({ invariant, owner }) => `not yet ${invariant}  ${owner}`,
  });

const covered = (verbose: boolean) =>
  Effect.gen(function* () {
    const invariants = yield* coreInvariants(REPOSITORY);
    const { standings, gaps } = coverageOf(invariants, guarantees, notYet);
    const checked = standings.filter(Standing.$is("Checked")).length;

    if (verbose) for (const s of standings) yield* Console.log(standingLine(s));

    for (const gap of gaps) yield* Console.log(gapLine(gap));

    yield* Console.log(
      `${gaps.length === 0 ? "ok  " : "BAD "} coverage: ${checked} of ${invariants.length} core Invariants checked, ${standings.length - checked} owed by a Task, ${gaps.length} gap(s)`,
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

const falsify = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = resolve(Option.getOrElse(flag(args, "--runtime"), () => DEFAULT_RUNTIME));
    const coverageOk = yield* covered(false);
    const scratch = resolve(Option.getOrElse(flag(args, "--scratch"), () => tmpdir()));
    const only = list(flag(args, "--mutant"));
    const sweep = args.includes("--sweep");

    const runnable = guarantees.map((g) => ({
      oracle: g.oracle.name,
      mutants: g.mutants.filter((m) => m.runtime === "prototype"),
    }));

    const unfalsified = runnable.filter((g) => g.mutants.length === 0).map((g) => g.oracle);

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
          mutant: sweep ? { ...mutant, cases: scenarios.map((s) => s.id) } : mutant,
        })),
    );

    const stated = (run: string, ids: ReadonlyArray<string>) =>
      suiteIn(MAIN, run, ids, 120).pipe(
        Effect.map(Option.some),
        Effect.catchTag("NoVerdicts", () =>
          Effect.succeed(Option.none<ReadonlyArray<CaseVerdict>>()),
        ),
      );

    const onNull = yield* stated(
      NULL_RUNTIME,
      scenarios.map((s) => s.id),
    );

    const nullRed = Option.match(onNull, {
      onNone: () => false,
      onSome: (v) => v.length === scenarios.length && v.every((x) => x._tag === "Fail"),
    });

    yield* Console.log(`${nullRed ? "ok  " : "BAD "} null runtime: every case states a failure`);

    const control = yield* stated(runtime, [
      ...new Set(chosen.flatMap(({ mutant }) => mutant.cases)),
    ]);

    const controlGreen = Option.match(control, {
      onNone: () => false,
      onSome: (v) => v.length > 0 && v.every((x) => x._tag === "Pass"),
    });

    yield* Console.log(
      `${controlGreen ? "ok  " : "BAD "} control: the mutants' cases pass on the unedited runtime`,
    );

    const verdicts = yield* Effect.forEach(
      chosen,
      ({ oracle, mutant }) => falsifyOne(MAIN, runtime, scratch, oracle, mutant),
      { concurrency: parallelOf(args) },
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

    const ok =
      coverageOk &&
      unfalsified.length === 0 &&
      nullRed &&
      controlGreen &&
      caught === verdicts.length &&
      verdicts.length > 0;

    yield* Console.log(
      `VERDICT ${ok ? "pass" : "fail"} ${caught}/${verdicts.length} mutants caught`,
    );

    if (!ok) process.exitCode = 1;
  });

const main = (args: ReadonlyArray<string>) => {
  const [mode, ...rest] = args;

  if (mode === "suite") return suite(rest);

  if (mode === "falsify") return falsify(rest);

  if (mode === "coverage") return coverage();

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
