/// <reference types="node" />
import { Console, Effect, Option, Schema } from "effect";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  caseChecks,
  FIXTURE_GAP_CAP,
  fixtureGaps,
  guarantees,
  oracles,
  reportOnly,
  scenarios,
} from "../suite.ts";
import {
  flag,
  graphsFor,
  list,
  MAIN,
  PACKAGE,
  parallelOf,
  playChosen,
  PRODUCTION_RUNTIME,
  ROUND_14,
  runtimeOf,
  runtimePort,
  runtimeSurface,
} from "./args.ts";
import { falsifyOne, liarOne, MutantVerdict, suiteIn } from "./falsify.ts";
import { productionCases, productionOwed } from "./gates.ts";
import {
  generatedScenarios,
  generatedScripts,
  isPartScript,
  RegressionJson,
  regressionFiles,
} from "../generated.ts";
import {
  type Limit,
  limits,
  Outcome,
  type StatedLimit,
  statedLimits,
  verdictOfLimit,
} from "../limits.ts";
import { type Script, scenarioOf, type Step } from "../dsl/script.ts";
import type { Scenario } from "../dsl/case.ts";
import { Serialize } from "../fixtures/one-lane.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import type { CaseVerdict } from "./verdict.ts";
import { crashCase } from "./run.ts";
import { crashFaults, crashOwed } from "./crash-owed.ts";
import { PASSING, signatureLine } from "./signature.ts";
import { taskStatuses } from "../parts/records.ts";

/**
 * The liar gate (advisor Q1): every behavioural mutant of the runtime (`--runtime production`
 * for the production ones), each run with a correct runtime's reports in place of its own, must
 * still be red. A green one was caught only because it confessed: it is listed, the inventory of
 * trust in reports. Report-only mutants (lies about reports) are left out.
 */
export const liar = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const production = runtimeOf(args) === PRODUCTION_RUNTIME;
    const target = production ? PRODUCTION_RUNTIME : "prototype";
    const only = list(flag(args, "--mutant"));

    const chosen = [...guarantees.flatMap((g) => g.mutants), ...caseChecks.mutants]
      .filter((m) => m.runtime === target && !reportOnly.has(m.name))
      .filter((m) =>
        Option.match(only, { onNone: () => true, onSome: (names) => names.includes(m.name) }),
      );

    // The control: the unedited runtime replaying its own reports and answers stays green, so a
    // red under the liar gate is the mutant's, not the replay's.
    const control = yield* suiteIn(
      MAIN,
      production ? PRODUCTION_RUNTIME : ROUND_14,
      [...new Set(chosen.flatMap((m) => m.cases))],
      240,
      ["--liar-reference", production ? `production:${PACKAGE}` : ROUND_14],
    ).pipe(
      Effect.map((v) => v.length > 0 && v.every((x) => x._tag === "Pass")),
      Effect.catchTag("NoVerdicts", () => Effect.succeed(false)),
    );

    yield* Console.log(
      `${control ? "ok  " : "BAD "} control: the unedited runtime replaying its own run passes`,
    );

    const runs = yield* Effect.forEach(
      chosen,
      (mutant) =>
        liarOne({
          main: MAIN,
          runtimeDir: ROUND_14,
          packageDir: PACKAGE,
          production,
          scratch: resolve(Option.getOrElse(flag(args, "--scratch"), () => tmpdir())),
          mutant,
        }),
      { concurrency: parallelOf(args) },
    );

    const green = runs.filter((r) => !r.red);

    // The inventory of trust in reports, rewritten at each full run (advisor Q1).
    if (Option.isNone(only))
      yield* Effect.sync(() =>
        writeFileSync(
          resolve(dirname(MAIN), "..", `liar-${target}.txt`),
          `${green
            .map((r) => r.mutant)
            .toSorted()
            .join("\n")}\n`,
        ),
      );

    for (const r of green)
      yield* Console.log(
        `GREEN ${r.mutant}  caught only by its own reports${r.why === "" ? "" : `: ${r.why}`}`,
      );

    const gaps = [...guarantees.flatMap((g) => g.mutants), ...caseChecks.mutants].filter(
      (m) => m.runtime === target && Object.hasOwn(fixtureGaps, m.name),
    );

    const capped = gaps.length <= FIXTURE_GAP_CAP;

    yield* Console.log(
      `${capped ? "ok  " : "BAD "} ${gaps.length} fixture gaps left out, at most ${FIXTURE_GAP_CAP}`,
    );

    const pass = green.length === 0 && control && capped;

    yield* Console.log(
      `VERDICT ${pass ? "pass" : "fail"} ${runs.length - green.length}/${runs.length} behavioural mutants red under the liar gate, ${gaps.length} fixture gaps (cap ${FIXTURE_GAP_CAP})`,
    );

    if (!pass) process.exitCode = 1;
  });

/**
 * The crash generator (advisor Q5): every case, killed and reloaded after each of its steps, judged
 * by the oracles and the end of case. Each red point is listed; one production owes (`crashOwed`,
 * by exact Attempt) is listed with its owner and fails nothing while every item still breaks and
 * its owner is open. `--json` is not supported.
 */
export const crash = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = runtimeOf(args);
    const only = list(flag(args, "--only"));

    const chosen = scenarios.filter((s) =>
      Option.match(only, {
        onNone: () => runtime !== PRODUCTION_RUNTIME || productionCases.includes(s.id),
        onSome: (ids) => ids.includes(s.id),
      }),
    );

    const port = yield* runtimePort(runtime);
    const surface = yield* runtimeSurface(runtime);
    const graphs = graphsFor(surface, chosen);

    const owed = runtime === PRODUCTION_RUNTIME ? crashOwed : [];

    const runs = yield* Effect.forEach(
      chosen,
      (s) => crashCase(port, s, oracles, graphs(s), owed),
      { concurrency: 1 },
    );

    const points = runs.reduce((n, r) => n + r.points, 0);

    const faults = crashFaults(
      runs,
      owed,
      new Set([...taskStatuses()].flatMap(([t, o]) => (o ? [t] : []))),
    );

    const owedPoints = [...new Set(runs.flatMap((r) => r.hits.map((h) => h.point)))];

    const named = owedPoints.map(
      (p) =>
        `${p} (${[...new Set(owed.filter((o) => o.case === p).map((o) => o.owner))].join(", ")})`,
    );

    for (const o of owed)
      yield* Console.log(`OWED ${o.case} ${o.check} ${o.invariant} to ${o.owner}: ${o.why}`);

    for (const f of faults) yield* Console.log(f);
    const red = runs.flatMap((r) => r.red).length;

    yield* Console.log(
      `VERDICT ${faults.length === 0 ? "pass" : "fail"} ${points - red - owedPoints.length}/${points} crash points pass, ${red} red, ${owedPoints.length} owed${named.length === 0 ? "" : `: ${named.join(", ")}`}`,
    );

    if (faults.length > 0) process.exitCode = 1;
  });

/**
 * The persistence area's hand cases (T45 acceptance 1): the Pay cases that reload, restore, hold
 * or dispose, whose fixture the generated scripts drive.
 */
const AREA = ["PAY-08", "PAY-09", "PAY-13", "PAY-14", "PAY-15", "PAY-16", "DISP-", "ACT-"];

/**
 * The mutants of @task.V3.T10's persistence rows the suite already checks (the README's WriteAhead
 * and Restore rows): T45's acceptance 4 asks the generated runs to kill them too.
 */
const PERSISTENCE_ROWS: ReadonlyArray<string> = [
  "mutant.still-unknown-dropped",
  "mutant.boot-skips-restored",
  "mutant.restore-skips-unsent",
];

const inArea = (id: string) => AREA.some((prefix) => id === prefix || id.startsWith(prefix));

/**
 * Kill counts (T45 acceptance 1): every prototype mutant whose own cases lie in the persistence
 * area (`--mutant` names a slice), run on the generated scripts alone, against the hand cases of
 * the area (from the sweep record, `catch-sweep.prototype.tsv`), mutant by mutant. A mutant is
 * killed when a case gives it a verdict that is red (`caught` or `red`); a mutant that did not
 * apply, gave no verdict or timed out kills nothing. A generated case already red on the unedited
 * runtime (a finding, kept in `regressions/`) is left out.
 */
export const kills = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const sweep = readFileSync(resolve(dirname(MAIN), "..", "catch-sweep.prototype.tsv"), "utf8")
      .split("\n")
      .map((line) => line.split("\t"));

    const area = [
      ...guarantees.flatMap((g) => g.mutants.map((m) => ({ oracle: g.oracle.name, m }))),
      ...caseChecks.mutants.map((m) => ({ oracle: "case expectations", m })),
    ]
      .filter(
        ({ m }) =>
          m.runtime === "prototype" && (m.cases.some(inArea) || PERSISTENCE_ROWS.includes(m.name)),
      )
      .filter(({ m }) =>
        Option.match(list(flag(args, "--mutant")), {
          onNone: () => true,
          onSome: (names) => names.includes(m.name),
        }),
      );

    const byHand = new Set(
      sweep
        .filter(([, id, verdict]) => inArea(id ?? "") && KILLING.test(verdict ?? ""))
        .map(([name]) => name),
    );

    const control = yield* suiteIn(
      MAIN,
      ROUND_14,
      generatedScenarios.map((s) => s.id),
      240,
    ).pipe(Effect.catchTag("NoVerdicts", () => Effect.succeed<ReadonlyArray<CaseVerdict>>([])));

    const generated = control.flatMap((v) => (v._tag === "Pass" ? [v.id] : []));

    const runs = yield* Effect.forEach(
      area,
      ({ oracle, m }) =>
        falsifyOne(
          MAIN,
          ROUND_14,
          resolve(Option.getOrElse(flag(args, "--scratch"), () => tmpdir())),
          oracle,
          { ...m, cases: generated },
        ).pipe(
          Effect.map((r) => ({
            mutant: m.name,
            killed: r.rows.some((row) => KILLING.test(row.split("\t")[2] ?? "")),
            rows: r.rows.length,
          })),
        ),
      { concurrency: parallelOf(args) },
    );

    yield* Console.log(
      `control: ${generated.length} of ${generatedScenarios.length} generated cases pass`,
    );
    const hand = area.filter(({ m }) => byHand.has(m.name)).length;
    const gen = runs.filter((r) => r.killed).length;

    for (const r of runs)
      yield* Console.log(
        `${r.killed ? "kill" : "live"} ${r.mutant}  hand ${byHand.has(r.mutant) ? "kill" : "live"}  (${r.rows} runs)`,
      );

    const missed = runs.filter((r) => !r.killed && byHand.has(r.mutant)).map((r) => r.mutant);

    yield* Console.log(
      `hand kills the generators miss: ${missed.length === 0 ? "none" : missed.join(" ")}`,
    );

    yield* Console.log(
      `VERDICT ${gen >= hand ? "pass" : "fail"} generated runs kill ${gen} of ${area.length} persistence mutants; the area's hand cases kill ${hand}`,
    );

    if (gen < hand) process.exitCode = 1;
  });

/**
 * A sweep verdict that kills: a case red by a mutant's own oracle or by another check.
 */
const KILLING = /^(caught|red) /u;

/**
 * A failure's signature: its oracles and the Invariants its violations name, so one regression is
 * kept per kind of finding. A failure no oracle names (a case expectation, a thrown defect, an
 * unreadable report) is signed by its message with ids, seeds and step names taken out; a time-out
 * by its kind.
 */
const failing = (verdicts: ReadonlyArray<CaseVerdict>) =>
  verdicts.flatMap((v) => {
    if (v._tag === "Timeout") return ["timeout"];

    if (v._tag === "Pass") return [];

    if (v.oracles.length === 0)
      return [
        `unnamed ${v.why
          .replace(/^seed \d+: /u, "")
          .replace(/\(at [^)]*\)/gu, "")
          .replace(/att-[\d-]+/gu, "ATT")
          .trim()}`,
      ];

    return [
      `${v.oracles.join(",")} ${[...new Set((v.violations ?? []).map((x) => x.invariant))].join(",")}`,
    ];
  });

type Play = (scenario: Scenario) => ReturnType<typeof playChosen>;

const PREFIX = 2;

/**
 * The shrinker (T32): one step after the prefix removed at a time, kept removed while the script
 * still fails by the same oracles, until no step can go.
 */
const shrunkSteps = (play: Play, script: Script, by: string) =>
  Effect.gen(function* () {
    let steps = script.steps;

    for (let removed = true; removed;) {
      removed = false;

      for (let at = PREFIX; at < steps.length && !removed; at += 1) {
        const candidate = { ...script, steps: steps.toSpliced(at, 1) };
        const again = failing(yield* play(scenarioOf(candidate, [Pay, Cells, Serialize])));

        removed = again[0] === by;

        if (removed) steps = candidate.steps;
      }
    }

    return steps;
  });

const regressed = (script: Script, steps: ReadonlyArray<Step>, by: string) =>
  Effect.sync(() => {
    const regression = { ...script, id: `${script.id}-shrunk`, steps, by };

    writeFileSync(
      resolve(dirname(MAIN), "..", "regressions", `${regression.id}.json`),
      `${Schema.encodeSync(RegressionJson)(regression)}\n`,
    );

    return regression.id;
  });

/**
 * The generators' findings (T45 step 5, T32): every generated script on `--runtime` (round-14 by
 * default), each failing one shrunk to the fewest steps that still fail by the same oracles, and
 * written to `regressions/<id>.json`, which the generated set then plays as a case of its own.
 */
export const shrink = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = Option.isSome(flag(args, "--runtime")) ? runtimeOf(args) : ROUND_14;
    const surface = yield* runtimeSurface(runtime);

    const play: Play = (scenario) =>
      playChosen(args, runtime, [scenario], graphsFor(surface, [scenario]));

    const seen = new Set<string>();

    const found = yield* Effect.forEach(
      generatedScripts.filter((s) => !s.id.endsWith("-shrunk")),
      (script) =>
        Effect.flatMap(play(scenarioOf(script, [Pay, Cells, Serialize])), (verdicts) => {
          const [by] = failing(verdicts);

          if (by === undefined || seen.has(by)) return Effect.succeed<ReadonlyArray<string>>([]);
          seen.add(by);

          return shrunkSteps(play, script, by).pipe(
            Effect.flatMap((steps) => regressed(script, steps, by)),
            Effect.map((id) => [`${id}: failed by ${by}`]),
          );
        }),
      { concurrency: 1 },
    );

    for (const line of found.flat()) yield* Console.log(`FOUND ${line}`);
    yield* Console.log(
      `VERDICT ${found.flat().length} failure signature(s) found, one script each shrunk`,
    );
  });

/**
 * The regressions' check (T32): each shrunk script in `regressions/` replayed on `--runtime`
 * must still fail with the signature it was saved with (`by`); one saved as a pass fails the
 * check. `--record` saves the red signature of one saved without it, never a pass. Part scripts run on production only (Conformance R22), in the
 * `regressions production` gate.
 */
export const regressions = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = Option.isSome(flag(args, "--runtime")) ? runtimeOf(args) : ROUND_14;
    const surface = yield* runtimeSurface(runtime);
    const record = args.includes("--record");

    const lines = yield* Effect.forEach(
      regressionFiles.filter(({ script }) => !isPartScript(script.id)),
      ({ path, script, by }) =>
        Effect.map(
          playChosen(
            args,
            runtime,
            [scenarioOf(script, [Pay, Cells, Serialize])],
            graphsFor(surface, []),
          ),
          (verdicts) => {
            const [now = PASSING] = failing(verdicts);

            if (Option.isNone(by) && record && now !== PASSING) {
              writeFileSync(path, `${Schema.encodeSync(RegressionJson)({ ...script, by: now })}\n`);

              return `ok   ${script.id}: recorded ${now}`;
            }

            return signatureLine(script.id, by, now);
          },
        ),
      { concurrency: 1 },
    );

    for (const line of lines) yield* Console.log(line);
    const bad = lines.filter((l) => l.startsWith("BAD")).length;
    yield* Console.log(
      `VERDICT ${bad === 0 ? "pass" : "fail"} ${lines.length - bad}/${lines.length} regressions fail as saved`,
    );

    if (bad > 0) process.exitCode = 1;
  });

/**
 * A stated limit's verdict: its mutant survives where the limit admits it, or the named check
 * catches it where the limit is narrower.
 */
const statedVerdict = (row: StatedLimit, verdict: MutantVerdict) => {
  const what = `${row.limit} (${row.mutant.name})`;
  const reason = MutantVerdict.$is("WrongReason")(verdict) ? `: ${verdict.why.slice(0, 300)}` : "";

  return Outcome.$match(row.outcome, {
    Survives: () => ({
      held: MutantVerdict.$is("Survived")(verdict),
      why: `${what}: ${verdict._tag === "Survived" ? "survives, as stated" : `expected to survive, got ${verdict._tag}`}`,
    }),
    Caught: ({ check }) => ({
      held: MutantVerdict.$is("Caught")(verdict),
      why: `${what}: ${verdict._tag === "Survived" ? `expected ${check} to catch it, it survived` : `${verdict._tag} (${check} ${row.mutant.expects} expected)${reason}`}`,
    }),
  });
};

/**
 * The limits gate (Conformance R22, I64, T42): every row of `limits.ts` played on round-14 must
 * fail by its check and Invariant; a row whose case passes, or fails by another, fails the gate.
 */
export const limitsGate = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const verdicts = yield* suiteIn(
      MAIN,
      ROUND_14,
      limits.map((l) => l.case),
      240,
      args.includes("--parallel") ? ["--parallel", String(parallelOf(args))] : [],
    ).pipe(Effect.catchTag("NoVerdicts", () => Effect.succeed<ReadonlyArray<CaseVerdict>>([])));

    const owedVerdicts = yield* suiteIn(
      MAIN,
      PRODUCTION_RUNTIME,
      productionOwed.map((o) => o.case),
      240,
    ).pipe(Effect.catchTag("NoVerdicts", () => Effect.succeed<ReadonlyArray<CaseVerdict>>([])));

    const holding = (rows: ReadonlyArray<Limit>, from: ReadonlyArray<CaseVerdict>, on: string) =>
      rows.map((l) =>
        Option.match(Option.fromUndefinedOr(from.find((v) => v.id === l.case)), {
          onNone: () => ({ held: false, why: `${l.case} gave no verdict on ${on}` }),
          onSome: (v) => verdictOfLimit(l, v),
        }),
      );

    const found = [
      ...holding(limits, verdicts, "round-14"),
      ...holding(productionOwed, owedVerdicts, "production"),
    ];

    const stated = yield* Effect.forEach(
      statedLimits,
      (row) =>
        falsifyOne(
          MAIN,
          ROUND_14,
          resolve(Option.getOrElse(flag(args, "--scratch"), () => tmpdir())),
          Outcome.$match(row.outcome, { Survives: () => "-", Caught: ({ check }) => check }),
          row.mutant,
        ).pipe(Effect.map((r) => statedVerdict(row, r.verdict))),
      { concurrency: parallelOf(args) },
    );

    for (const f of [...found, ...stated])
      yield* Console.log(`${f.held ? "ok  " : "BAD "} ${f.why}`);
    const held = [...found, ...stated].filter((f) => f.held).length;
    const total = found.length + stated.length;

    yield* Console.log(
      `VERDICT ${held === total ? "pass" : "fail"} ${held}/${total} limits rows hold (round-14 limits, stated limits, production's owed reds)`,
    );

    if (held < total) process.exitCode = 1;
  });
