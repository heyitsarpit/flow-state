import { Clock, Effect, Option, Result } from "effect";
import { playCase, type Scenario } from "../dsl/case.ts";
import { playCrash, playRecorded } from "../dsl/play.ts";
import { citedBy, type Graphed, Mismatch, type Oracle, Violated } from "../dsl/oracle.ts";
import { playStatic, type StaticCase } from "../dsl/static-case.ts";
import { type Observation, type Port, Unreadable } from "../port.ts";
import type { Surface } from "../surface.ts";
import { Overdue } from "../world/world.ts";
import type { CaseVerdict } from "./verdict.ts";

const SEEDS = [1, 2];

/**
 * Each runtime case's time bound in seconds, over all its seeds (Conformance R8).
 */
export const CASE_SECONDS = 10;

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

  if (failure instanceof Unreadable)
    return {
      oracles: [],
      why: `unreadable ${failure.report}: ${failure.issue} (the runtime broke the Port's contract)`,
      cites: [],
    };

  return { oracles: [], why: `defect: ${String(failure)}`, cites: [] };
};

const citing = (cites: ReadonlyArray<string>) => (cites.length === 0 ? {} : { cites });

type Bounded = { readonly seed: number; readonly overdue: () => boolean };

// FLOW_STATE_ALLOW_UNKNOWN: whatever a case throws reaches the runner untyped; it is narrowed here, once.
const verdictOf = (id: string, seed: number, failure: unknown) => {
  if (failure instanceof Overdue)
    return { _tag: "Timeout", id, seed, seconds: CASE_SECONDS } satisfies CaseVerdict;

  const f = failed(failure);

  return {
    _tag: "Fail",
    id,
    oracles: f.oracles,
    why: `seed ${seed}: ${f.why}`,
    ...citing(f.cites),
  } satisfies CaseVerdict;
};

const runSeed = (
  port: Port,
  scenario: Scenario,
  oracles: ReadonlyArray<Oracle>,
  graphs: ReadonlyArray<Graphed>,
  { seed, overdue }: Bounded,
) =>
  Effect.try({
    try: () =>
      playCase(
        {
          port,
          fixtures: scenario.fixtures,
          oracles,
          seed,
          graphs,
          overdue,
          crashAt: Option.none(),
          replay: Option.none(),
        },
        scenario.run,
      ),
    catch: (failure) => verdictOf(scenario.id, seed, failure),
  }).pipe(
    Effect.match({
      onSuccess: (reports) => ({ verdict: Option.none<CaseVerdict>(), reports }),
      onFailure: (verdict) => ({ verdict: Option.some(verdict), reports: [] }),
    }),
  );

/**
 * Turn I17 by replay: seed 1 played again gives the same reports, in order (the world, the clock
 * and the session seed are the case's; nothing else may vary).
 */
// RETURN_TYPE: an Option of the CaseVerdict union; the Fail literal would infer narrower.
const replayed = (
  id: string,
  first: ReadonlyArray<Observation>,
  again: ReadonlyArray<Observation>,
): Option.Option<CaseVerdict> => {
  const at = Math.max(first.length, again.length);

  const differs = Array.from({ length: at }, (_, i) => i).find(
    (i) => JSON.stringify(first[i]) !== JSON.stringify(again[i]),
  );

  return differs === undefined
    ? Option.none()
    : Option.some({
        _tag: "Fail",
        id,
        oracles: [],
        why: `seed 1 replayed: Turn I17: report ${differs} differs (${JSON.stringify(first[differs]).slice(0, 120)} then ${JSON.stringify(again[differs]).slice(0, 120)}): equal arguments gave unequal results`,
        cites: ["Turn I17"],
      });
};

const deadline = Clock.clockWith((clock) =>
  Effect.sync(() => {
    const end = clock.currentTimeMillisUnsafe() + CASE_SECONDS * 1000;

    return () => clock.currentTimeMillisUnsafe() > end;
  }),
);

/**
 * Runs one case on a fresh world per seed and returns its verdict: the first seed's failure, or a
 * pass when every seed passes.
 *
 * **Details**
 *
 * A step's oracle violation, a case's own mismatch, a report the Port cannot read (`Unreadable`,
 * the runtime's fault) and a thrown defect (a scenario bug, an unsettled world, a runtime that
 * throws) are each a `Fail`, each named apart; nothing a case does escapes as a
 * failure of this Effect. Every case runs under seeds 1 and 2, which change the store's load
 * order and the session seeds; seed 1 then runs again and must give the same reports (Turn
 * I17). `graphs` are what `flow graph` printed for the fixtures.
 *
 * The case's seeds share one time bound, {@link CASE_SECONDS}; past it the world stops the run at
 * its next host call or settled task and the verdict is `Timeout`, whatever came before.
 */
export const runCase = (
  port: Port,
  scenario: Scenario,
  oracles: ReadonlyArray<Oracle>,
  graphs: ReadonlyArray<Graphed>,
) =>
  Effect.flatMap(deadline, (overdue) =>
    Effect.forEach(
      [...SEEDS, SEEDS[0] ?? 1],
      (seed) => runSeed(port, scenario, oracles, graphs, { seed, overdue }),
      { concurrency: 1 },
    ),
  ).pipe(
    Effect.map(
      (runs) =>
        Option.getOrUndefined(
          Option.firstSomeOf([
            ...runs.map((r) => r.verdict),
            replayed(scenario.id, runs[0]?.reports ?? [], runs.at(-1)?.reports ?? []),
          ]),
        ) ?? ({ _tag: "Pass", id: scenario.id } satisfies CaseVerdict),
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

/**
 * The crash generator on one case (seed 1): for each step i, play to i, kill and reload the page,
 * and judge with the oracles and the end of case only, until i passes the case's last step.
 * Returns each red crash point as a `Fail` whose id names the step (`PAY-01@3`), and how many
 * points ran.
 */
export const crashCase = (
  port: Port,
  scenario: Scenario,
  oracles: ReadonlyArray<Oracle>,
  graphs: ReadonlyArray<Graphed>,
) =>
  Effect.gen(function* () {
    const red: Array<CaseVerdict> = [];
    let points = 0;

    for (let at = 1; at <= 400; at += 1) {
      const overdue = yield* deadline;
      const id = `${scenario.id}@${at}`;

      const played = yield* Effect.try({
        try: () =>
          playCrash(
            {
              port,
              fixtures: scenario.fixtures,
              oracles,
              seed: 1,
              graphs,
              overdue,
              crashAt: Option.some(at),
              replay: Option.none(),
            },
            scenario.run,
          ),
        catch: (failure) => verdictOf(id, 1, failure),
      }).pipe(Effect.result);

      points += 1;

      if (Result.isFailure(played)) red.push(played.failure);
      else if (!played.success) break;
    }

    return { id: scenario.id, points, red };
  });

/**
 * One case under the liar gate (advisor Q1): per seed, the reference runtime plays it and its
 * reports are recorded by step; the runtime under test then plays it with those reports in place
 * of its own. A mutant still red here was caught by what the suite saw, not by what it said.
 */
export const runCaseLiar = (
  reference: Port,
  port: Port,
  scenario: Scenario,
  oracles: ReadonlyArray<Oracle>,
  graphs: ReadonlyArray<Graphed>,
) =>
  Effect.flatMap(deadline, (overdue) =>
    Effect.forEach(
      SEEDS,
      (seed) => {
        const options = {
          fixtures: scenario.fixtures,
          oracles,
          seed,
          graphs,
          overdue,
          crashAt: Option.none(),
        };

        return Effect.try({
          try: () => {
            const steps = playRecorded(
              { ...options, port: reference, replay: Option.none() },
              scenario.run,
            );

            return playCase({ ...options, port, replay: Option.some(steps) }, scenario.run);
          },
          catch: (failure) => verdictOf(scenario.id, seed, failure),
        }).pipe(
          Effect.match({
            onSuccess: () => Option.none<CaseVerdict>(),
            onFailure: (verdict) => Option.some<CaseVerdict>(verdict),
          }),
        );
      },
      { concurrency: 1 },
    ),
  ).pipe(
    Effect.map(
      (runs) =>
        Option.getOrUndefined(Option.firstSomeOf(runs)) ??
        ({ _tag: "Pass", id: scenario.id } satisfies CaseVerdict),
    ),
  );
