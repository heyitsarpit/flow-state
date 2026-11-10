import { Effect } from "effect";
import { playCase, type Scenario } from "../dsl/case.ts";
import { citedBy, type Graphed, Mismatch, type Oracle, Violated } from "../dsl/oracle.ts";
import { playStatic, type StaticCase } from "../dsl/static-case.ts";
import type { Port } from "../port.ts";
import type { Surface } from "../surface.ts";
import type { CaseVerdict } from "./verdict.ts";

const SEEDS = [1, 2];

// FLOW_STATE_ALLOW_UNKNOWN: whatever a case throws reaches the runner untyped; it is narrowed here, once.
const failed = (failure: unknown) => {
  if (failure instanceof Violated)
    return {
      oracles: failure.oracles,
      why: `${failure.violation} (at ${failure.step})`,
      cites: [],
    };

  if (failure instanceof Mismatch)
    return {
      oracles: [],
      why: `${failure.label}: expected ${failure.expected}, got ${failure.actual}`,
      cites: citedBy(failure.label),
    };

  return { oracles: [], why: `threw: ${String(failure)}`, cites: [] };
};

const citing = (cites: ReadonlyArray<string>) => (cites.length === 0 ? {} : { cites });

const runSeed = (
  port: Port,
  scenario: Scenario,
  oracles: ReadonlyArray<Oracle>,
  graphs: ReadonlyArray<Graphed>,
  seed: number,
) =>
  Effect.try({
    try: () => playCase({ port, fixtures: scenario.fixtures, oracles, seed, graphs }, scenario.run),
    catch: failed,
  }).pipe(
    Effect.match({
      onSuccess: () => ({ _tag: "Pass", id: scenario.id }) satisfies CaseVerdict,
      onFailure: (f) =>
        ({
          _tag: "Fail",
          id: scenario.id,
          oracles: f.oracles,
          why: `seed ${seed}: ${f.why}`,
          ...citing(f.cites),
        }) satisfies CaseVerdict,
    }),
  );

/**
 * Runs one case on a fresh world per seed and returns its verdict: the first seed's failure, or a
 * pass when every seed passes.
 *
 * **Details**
 *
 * A step's oracle violation, a case's own mismatch and a thrown defect (a scenario bug, an
 * unsettled world, a runtime that throws) are each a `Fail`; nothing a case does escapes as a
 * failure of this Effect. Every case runs under seeds 1 and 2, which change the store's load
 * order and the session seeds. `graphs` are what `flow graph` printed for the fixtures.
 */
export const runCase = (
  port: Port,
  scenario: Scenario,
  oracles: ReadonlyArray<Oracle>,
  graphs: ReadonlyArray<Graphed>,
) =>
  Effect.forEach(SEEDS, (seed) => runSeed(port, scenario, oracles, graphs, seed), {
    concurrency: 1,
  }).pipe(
    Effect.map(
      (verdicts) =>
        verdicts.find((v) => v._tag === "Fail") ??
        ({ _tag: "Pass", id: scenario.id } satisfies CaseVerdict),
    ),
  );

/**
 * Runs cases one after another in this process, each with the graphs of its own fixtures.
 */
export const runCases = (
  port: Port,
  scenarios: ReadonlyArray<Scenario>,
  oracles: ReadonlyArray<Oracle>,
  graphsOf: (scenario: Scenario) => ReadonlyArray<Graphed>,
) =>
  Effect.forEach(scenarios, (scenario) => runCase(port, scenario, oracles, graphsOf(scenario)), {
    concurrency: 1,
  });

/**
 * Runs one static case once on a surface (Conformance R14: a fixed input, no seed, no step) and
 * returns its verdict.
 *
 * **Details**
 *
 * A failed expectation is a `Fail` that cites its Invariant; a thrown defect is a `Fail` with no
 * citation.
 */
export const runStatic = (surface: Surface, staticCase: StaticCase) =>
  Effect.try({ try: () => playStatic(surface, staticCase), catch: failed }).pipe(
    Effect.match({
      onSuccess: () => ({ _tag: "Pass", id: staticCase.id }) satisfies CaseVerdict,
      onFailure: (f) =>
        ({
          _tag: "Fail",
          id: staticCase.id,
          oracles: [],
          why: f.why,
          ...citing(f.cites),
        }) satisfies CaseVerdict,
    }),
  );

/**
 * Runs static cases one after another in this process.
 */
export const runStatics = (surface: Surface, cases: ReadonlyArray<StaticCase>) =>
  Effect.forEach(cases, (c) => runStatic(surface, c), { concurrency: 1 });
