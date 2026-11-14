import { Option } from "effect";
import { Fact } from "../dsl/oracle.ts";
import { type Handlers, possible } from "../fixtures/handlers.ts";
import { Observation, type Turn } from "../port.ts";
import { keyOf, type State, Undecided } from "./anchor.ts";

/**
 * Whether a judged turn enters a state, a new Activation: its root part ran an alternative whose
 * target is a state, re-entry included.
 */
export const enteredBy = (handlers: Handlers, turn: Turn) => {
  const ran = turn.parts.find((p) => p.part.length === 0 && p.definition === turn.actor.machine);

  return possible(handlers, turn.from, turn.event, "either").alternatives.some(
    (a) => a.at === ran?.at && a.enters,
  );
};

/**
 * The schedules a judged turn arms (Turn R14, R15): on entering a state, that state's entry
 * schedules; otherwise its leaf's schedules whose `armOn` lists the event, each with the state
 * that holds it.
 */
export const armedBy = (handlers: Handlers, turn: Turn) =>
  enteredBy(handlers, turn)
    ? (handlers.schedules[turn.to] ?? []).filter((s) => s.entry).map((s) => [turn.to, s] as const)
    : (handlers.schedules[turn.from] ?? [])
        .filter((s) => s.armOn.includes(turn.event))
        .map((s) => [turn.from, s] as const);

/**
 * The schedules a step's judged turns arm whose delay the folds cannot compute from the actor's
 * fields at the step's end, the memory the `schedules` oracle times them by ({@link Undecided}).
 */
export const undecidedDelays = (end: State, facts: ReadonlyArray<Fact>) =>
  facts.flatMap((fact) => {
    if (!Fact.$is("Reported")(fact) || !Observation.$is("Turn")(fact.observation)) return [];

    const turn = fact.observation;
    const handlers = end.machines[turn.actor.machine];

    const fields = Option.flatMap(
      Option.fromUndefinedOr(end.actors.get(keyOf(turn.actor))),
      (a) => a.fields,
    );

    return handlers === undefined
      ? []
      : armedBy(handlers, turn).flatMap(([state, schedule]) =>
          Option.isNone(schedule.delayMs) &&
          Option.isNone(
            Option.flatMap(Option.fromUndefinedOr(handlers.folds.delays[schedule.id]), (delay) =>
              Option.flatMap(fields, delay),
            ),
          )
            ? [Undecided.Delay({ actor: keyOf(turn.actor), state, schedule: schedule.id })]
            : [],
        );
  });
