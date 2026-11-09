import { Cause, Effect, Option } from "effect";
import { Mismatch, openCase, type Scenario, Violated } from "../dsl/case.ts";
import { references } from "../fixtures/reference.ts";
import type { Oracle } from "../oracles/oracle.ts";
import type { Port } from "../port.ts";
import type { CaseVerdict } from "./verdict.ts";

const describe = (
  failure: unknown,
): { readonly oracle: Option.Option<string>; readonly why: string } => {
  if (failure instanceof Violated)
    return {
      oracle: Option.some(failure.oracle),
      why: `${failure.violation} (at ${failure.step})`,
    };

  if (failure instanceof Mismatch)
    return {
      oracle: Option.none(),
      why: `${failure.label}: expected ${String(JSON.stringify(failure.expected))}, got ${String(JSON.stringify(failure.actual))}`,
    };

  return { oracle: Option.none(), why: `threw: ${String(failure)}` };
};

const referenceOf = (scenario: Scenario) =>
  Object.assign({}, ...scenario.fixtures.map((name) => references[name] ?? {}));

/**
 * Runs one case on a fresh world and returns its verdict.
 *
 * **Details**
 *
 * A step's oracle violation, a case's own mismatch and a thrown defect are each a `Fail`; nothing
 * a case does escapes as a failure of this Effect.
 */
export const runCase = (
  port: Port,
  scenario: Scenario,
  oracles: ReadonlyArray<Oracle>,
): Effect.Effect<CaseVerdict> =>
  Effect.try({
    try: () => scenario.run(openCase(port, scenario, referenceOf(scenario), oracles)),
    catch: (failure) => failure,
  }).pipe(
    Effect.match({
      onSuccess: (): CaseVerdict => ({ _tag: "Pass", id: scenario.id }),
      onFailure: (failure): CaseVerdict => ({
        _tag: "Fail",
        id: scenario.id,
        ...describe(failure),
      }),
    }),
    Effect.catchCause((cause) =>
      Effect.succeed<CaseVerdict>({
        _tag: "Fail",
        id: scenario.id,
        oracle: Option.none(),
        why: `defect: ${Cause.pretty(cause)}`,
      }),
    ),
  );

/**
 * Runs cases one after another in this process.
 */
export const runCases = (
  port: Port,
  scenarios: ReadonlyArray<Scenario>,
  oracles: ReadonlyArray<Oracle>,
) => Effect.forEach(scenarios, (scenario) => runCase(port, scenario, oracles), { concurrency: 1 });
