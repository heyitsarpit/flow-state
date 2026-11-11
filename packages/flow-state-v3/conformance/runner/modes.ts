/// <reference types="node" />
import { Console, Effect, Option } from "effect";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { caseChecks, guarantees, oracles, reportOnly, scenarios } from "../suite.ts";
import {
  DEFAULT_RUNTIME,
  flag,
  graphsFor,
  lineOf,
  list,
  MAIN,
  PACKAGE,
  parallelOf,
  PRODUCTION_RUNTIME,
  runtimeOf,
  runtimePort,
  runtimeSurface,
} from "./args.ts";
import { liarOne, suiteIn } from "./falsify.ts";
import { crashCase } from "./run.ts";

/**
 * The liar gate (advisor Q1): every behavioural mutant of the runtime (`--runtime production`
 * for the production ones), each run with a correct runtime's reports in place of its own, must
 * still be red. A green one was caught only because it confessed: it is listed, the inventory of
 * trust in reports. Report-only mutants (lies about reports) are left out.
 */
export const liar = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const production = Option.contains(flag(args, "--runtime"), PRODUCTION_RUNTIME);
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
      production ? PRODUCTION_RUNTIME : DEFAULT_RUNTIME,
      [...new Set(chosen.flatMap((m) => m.cases))],
      240,
      ["--liar-reference", production ? `production:${PACKAGE}` : DEFAULT_RUNTIME],
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
          runtimeDir: DEFAULT_RUNTIME,
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
    yield* Console.log(
      `VERDICT ${green.length === 0 && control ? "pass" : "fail"} ${runs.length - green.length}/${runs.length} behavioural mutants red under the liar gate`,
    );

    if (green.length > 0 || !control) process.exitCode = 1;
  });

/**
 * The crash generator (advisor Q5): every case, killed and reloaded after each of its steps, judged
 * by the oracles and the end of case. Red points are listed; `--json` is not supported.
 */
export const crash = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const runtime = runtimeOf(args);
    const only = list(flag(args, "--only"));

    const chosen = scenarios.filter((s) =>
      Option.match(only, { onNone: () => true, onSome: (ids) => ids.includes(s.id) }),
    );

    const port = yield* runtimePort(runtime);
    const surface = yield* runtimeSurface(runtime);
    const graphs = graphsFor(surface, chosen);

    const runs = yield* Effect.forEach(chosen, (s) => crashCase(port, s, oracles, graphs(s)), {
      concurrency: 1,
    });

    const points = runs.reduce((n, r) => n + r.points, 0);
    const red = runs.flatMap((r) => r.red);

    for (const v of red) yield* Console.log(lineOf(v));
    yield* Console.log(
      `VERDICT ${red.length === 0 ? "pass" : "fail"} ${points - red.length}/${points} crash points`,
    );

    if (red.length > 0) process.exitCode = 1;
  });
