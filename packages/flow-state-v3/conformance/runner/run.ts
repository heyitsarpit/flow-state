import { Cause, Effect } from "effect";
import { Mismatch, openCase, type Scenario, Violated } from "../dsl/case.ts";
import { referenceFor } from "../fixtures/reference.ts";
import type { Oracle } from "../oracles/oracle.ts";
import type { Port } from "../port.ts";
import type { CaseVerdict } from "./verdict.ts";

const SEEDS = [1, 2];

const describe = (failure: unknown) => {
  if (failure instanceof Violated)
    return { oracles: failure.oracles, why: `${failure.violation} (at ${failure.step})` };

  if (failure instanceof Mismatch)
    return {
      oracles: [],
      why: `${failure.label}: expected ${String(JSON.stringify(failure.expected))}, got ${String(JSON.stringify(failure.actual))}`,
    };

  return { oracles: [], why: `threw: ${String(failure)}` };
};

const runSeed = (port: Port, scenario: Scenario, oracles: ReadonlyArray<Oracle>, seed: number) =>
  Effect.try({
    try: () =>
      scenario.run(openCase(port, scenario, referenceFor(scenario.fixtures), oracles, seed)),
    catch: (failure) => failure,
  }).pipe(
    Effect.match({
      onSuccess: () => ({ _tag: "Pass", id: scenario.id }) satisfies CaseVerdict,
      onFailure: (failure) => {
        const { oracles: caught, why } = describe(failure);

        return {
          _tag: "Fail",
          id: scenario.id,
          oracles: caught,
          why: `seed ${seed}: ${why}`,
        } satisfies CaseVerdict;
      },
    }),
    Effect.catchCause((cause) =>
      Effect.succeed<CaseVerdict>({
        _tag: "Fail",
        id: scenario.id,
        oracles: [],
        why: `seed ${seed}: defect: ${Cause.pretty(cause)}`,
      }),
    ),
  );

/**
 * Runs one case on a fresh world per seed and returns its verdict: the first seed's failure, or a
 * pass when every seed passes.
 *
 * **Details**
 *
 * A step's oracle violation, a case's own mismatch and a thrown defect are each a `Fail`; nothing
 * a case does escapes as a failure of this Effect. Every case runs under seeds 1 and 2, which
 * change the store's load order and the session seeds.
 */
export const runCase = (port: Port, scenario: Scenario, oracles: ReadonlyArray<Oracle>) =>
  Effect.forEach(SEEDS, (seed) => runSeed(port, scenario, oracles, seed), { concurrency: 1 }).pipe(
    Effect.map(
      (verdicts) =>
        verdicts.find((v) => v._tag === "Fail") ??
        ({ _tag: "Pass", id: scenario.id } satisfies CaseVerdict),
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
