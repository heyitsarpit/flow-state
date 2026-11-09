import { Cause, Effect, Layer } from "effect";
import { Case, type Mismatch, type Scenario, type Violated } from "../dsl/case.ts";
import { Timeline } from "../dsl/timeline.ts";
import type { Oracle } from "../oracles/oracle.ts";
import type { Boot, Runtime } from "../port.ts";
import { type Hosts, World } from "../world/world.ts";
import type { CaseVerdict } from "./verdict.ts";

const SEEDS = [1, 2];

/**
 * The runtime a run boots: a Layer that needs a boot's parameters and the world's hosts.
 */
export type RuntimeLayer = Layer.Layer<Runtime, never, Boot | Hosts>;

const failed = (failure: Violated | Mismatch) =>
  failure._tag === "Violated"
    ? { oracles: failure.oracles, why: `${failure.violation} (at ${failure.step})` }
    : {
        oracles: [],
        why: `${failure.label}: expected ${failure.expected}, got ${failure.actual}`,
      };

const runSeed = (
  runtime: RuntimeLayer,
  scenario: Scenario,
  oracles: ReadonlyArray<Oracle>,
  seed: number,
) =>
  scenario.run.pipe(
    Effect.provide(
      Case.layer({ fixtures: scenario.fixtures, runtime, oracles }).pipe(
        Layer.provide(Layer.merge(World.layer(seed), Timeline.layer)),
      ),
    ),
    Effect.match({
      onSuccess: () => ({ _tag: "Pass", id: scenario.id }) satisfies CaseVerdict,
      onFailure: (failure) => {
        const { oracles: caught, why } = failed(failure);

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
        why: `seed ${seed}: threw: ${String(Cause.squash(cause))}`,
      }),
    ),
  );

/**
 * Runs one case on a fresh world per seed and returns its verdict: the first seed's failure, or a
 * pass when every seed passes.
 *
 * **Details**
 *
 * A step's oracle violation, a case's own mismatch and a defect (a scenario bug, an unsettled
 * world, a runtime that throws) are each a `Fail`; nothing a case does escapes as a failure of
 * this Effect. Every case runs under seeds 1 and 2, which change the store's load order and the
 * session seeds.
 */
export const runCase = (
  runtime: RuntimeLayer,
  scenario: Scenario,
  oracles: ReadonlyArray<Oracle>,
) =>
  Effect.forEach(SEEDS, (seed) => runSeed(runtime, scenario, oracles, seed), {
    concurrency: 1,
  }).pipe(
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
  runtime: RuntimeLayer,
  scenarios: ReadonlyArray<Scenario>,
  oracles: ReadonlyArray<Oracle>,
) =>
  Effect.forEach(scenarios, (scenario) => runCase(runtime, scenario, oracles), {
    concurrency: 1,
  });
