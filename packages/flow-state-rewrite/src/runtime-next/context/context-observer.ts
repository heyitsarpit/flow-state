import { Result } from "effect";

import { Defect, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";

export type PassiveRead<Dependency> = <Value>(dependency: Dependency, value: Value) => Value;

export type PassiveObserverEvaluation<Value, Dependency> = Result.Result<
  // oxlint-disable-next-line anti-slop/no-readonly -- A successful observer result and its dependencies stay immutable until the coordinator commits them.
  Readonly<{ value: Value; dependencies: readonly Dependency[] }>,
  PublicDiagnostic
>;

// oxlint-disable-next-line anti-slop/no-readonly -- Once registered, the observer evaluation and dependency capabilities cannot be replaced.
export type PassiveObserver<Dependency> = Readonly<{
  evaluate<Value>(
    selector: (read: PassiveRead<Dependency>) => Value,
  ): PassiveObserverEvaluation<Value, Dependency>;
  observe<Value>(
    selector: (read: PassiveRead<Dependency>) => Value,
  ): PassiveObserverEvaluation<Value, Dependency>;
  // oxlint-disable-next-line anti-slop/no-readonly -- The dependency view returned to the coordinator cannot be mutated by a consumer.
  dependencies(): readonly Dependency[];
}>;

/** A failed observation preserves the prior committed dependency set. */
// RETURN_TYPE: The observer port exposes one typed evaluation result across reads.
export const makePassiveObserver = <Dependency>(): PassiveObserver<Dependency> => {
  let tracked: Dependency[] = [];

  // RETURN_TYPE: The observer callback keeps its generic value and diagnostic lanes.
  const evaluate = <Value>(
    selector: (read: PassiveRead<Dependency>) => Value,
  ): PassiveObserverEvaluation<Value, Dependency> => {
    const next: Dependency[] = [];
    const seen = new Set<Dependency>();

    const read: PassiveRead<Dependency> = (dependency, value) => {
      if (!seen.has(dependency)) {
        seen.add(dependency);
        next.push(dependency);
      }

      return value;
    };

    const observed = Result.try({ try: () => selector(read), catch: Defect });

    if (Result.isFailure(observed)) return Result.fail(observed.failure);
    tracked = [...next];

    return Result.succeed({ value: observed.success, dependencies: [...tracked] });
  };

  return { evaluate, observe: evaluate, dependencies: () => [...tracked] };
};
