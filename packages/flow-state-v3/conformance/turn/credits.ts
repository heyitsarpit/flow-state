import { Option } from "effect";
import { Fact, type Violation, violation } from "../dsl/oracle.ts";
import { Observation } from "../port.ts";
import type { State } from "./anchor.ts";
import { Phase } from "./phases.ts";

const refusedTurn = (step: ReadonlyArray<Fact>) =>
  step.some(
    (f) =>
      Fact.$is("Reported")(f) &&
      Observation.$is("Issue")(f.observation) &&
      Option.isNone(f.observation.ending),
  );

/**
 * A step's end: each driven event a live actor still holds, which no turn, `Unhandled` or `Denied`
 * answered, breaks Turn R2, and its credit ends with the step. Kept while the Runtime is disposing;
 * not judged in a step with a refused turn (an `Issue` with no ending, Turn I3), which names no
 * actor.
 */
export const closed = <
  J extends { readonly state: State; readonly violations: ReadonlyArray<Violation> },
>(
  judged: J,
  step: ReadonlyArray<Fact>,
) => {
  if (judged.state.disposing) return judged;

  const left = refusedTurn(step)
    ? []
    : [...judged.state.actors].flatMap(([key, a]) =>
        Phase.$is("Live")(a.phase)
          ? a.driven.map((c) =>
              violation(`Turn I2 (R2): ${key} was sent ${c.event}, but no turn ran it in the step`),
            )
          : [],
      );

  return {
    ...judged,
    state: {
      ...judged.state,
      actors: new Map([...judged.state.actors].map(([key, a]) => [key, { ...a, driven: [] }])),
    },
    violations: [...judged.violations, ...left],
  };
};
