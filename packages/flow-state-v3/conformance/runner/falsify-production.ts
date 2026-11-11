import { Console, Effect, Option } from "effect";
import { caseChecks, guarantees } from "../suite.ts";
import { CASE_EXPECTATIONS, falsifyProduction, MutantVerdict, suiteIn } from "./falsify.ts";

const PRODUCTION = "production";

/**
 * Falsify on the production runtime (T16): each production mutant on its own copy of the package,
 * after the control run of their cases on the unedited runtime.
 */
export const falsifyOnProduction = (options: {
  readonly main: string;
  readonly packageDir: string;
  readonly scratch: string;
  readonly only: Option.Option<ReadonlyArray<string>>;
  readonly parallel: number;
}) =>
  Effect.gen(function* () {
    const { only, scratch } = options;

    const chosen = [
      ...guarantees.map((g) => ({ oracle: g.oracle.name, mutants: g.mutants })),
      { oracle: CASE_EXPECTATIONS, mutants: caseChecks.mutants },
    ].flatMap((g) =>
      g.mutants
        .filter((m) => m.runtime === PRODUCTION)
        .filter((m) =>
          Option.match(only, { onNone: () => true, onSome: (names) => names.includes(m.name) }),
        )
        .map((mutant) => ({ oracle: g.oracle, mutant })),
    );

    const bare = guarantees
      .filter((g) => !g.mutants.some((m) => m.runtime === PRODUCTION))
      .map((g) => g.oracle.name);

    yield* Console.log(`note no production mutant yet for: ${bare.join(" ")}`);

    const control = yield* suiteIn(
      options.main,
      PRODUCTION,
      [...new Set(chosen.flatMap((c) => c.mutant.cases))],
      120,
    ).pipe(
      Effect.map((v) => v.length > 0 && v.every((x) => x._tag === "Pass")),
      Effect.catchTag("NoVerdicts", () => Effect.succeed(false)),
    );

    yield* Console.log(
      `${control ? "ok  " : "BAD "} control: the mutants' cases pass on the unedited runtime`,
    );

    const verdicts = yield* Effect.forEach(
      chosen,
      ({ oracle, mutant }) => falsifyProduction(options.packageDir, scratch, oracle, mutant),
      { concurrency: options.parallel },
    );

    for (const v of verdicts)
      yield* Console.log(
        MutantVerdict.$match(v, {
          Caught: ({ mutant, why }) => `ok   ${mutant}  caught: ${why}`,
          WrongReason: ({ mutant, why }) => `BAD  ${mutant}  red by another check: ${why}`,
          Survived: ({ mutant }) => `BAD  ${mutant}  survived`,
          NotApplied: ({ mutant, why }) => `BAD  ${mutant}  does not apply: ${why}`,
          NoVerdict: ({ mutant, why }) => `BAD  ${mutant}  no verdict: ${why}`,
        }),
      );

    const caught = verdicts.filter(MutantVerdict.$is("Caught")).length;
    const ok = control && caught === verdicts.length && verdicts.length > 0;

    yield* Console.log(
      `VERDICT ${ok ? "pass" : "fail"} ${caught}/${verdicts.length} mutants caught`,
    );

    if (!ok) process.exitCode = 1;
  });
