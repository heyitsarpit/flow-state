import { FLOW_DECLINES } from "../fixtures/reference.ts";
import { Data, Option } from "effect";
import { type ActorRef, sameActor } from "../port.ts";
import {
  type Ending,
  type EndingName,
  Life,
  LifeMove,
  type Model,
  Obligation,
  type Refusal,
} from "./lifecycle-model.ts";
import { Fate, type LifeRow, type Rules, rules } from "./lifecycle-rules.ts";

const wl = (n: number) => `WriteLanes I${n}` as const;

/**
 * One fold result of a life move: the next model and the refusals found.
 */
export type LifeStep = readonly [Model, ReadonlyArray<Refusal>];

// RETURN_TYPE: the fold's result is the named tuple; a literal would infer as an array.
const stepOf = (model: Model, refusals: ReadonlyArray<Refusal> = []): LifeStep => [model, refusals];

const sameAttempt = Option.makeEquivalence((a: string, b: string) => a === b);

const named = (ending: Ending, name: EndingName) =>
  ending.operation === name.operation &&
  sameActor(ending.actor, name.actor) &&
  sameAttempt(ending.attempt, name.attempt);

/**
 * The index of the ending a report names: the oldest of its Attempt (or, for a decline, of its
 * actor and operation) that is not `Closed`, else the newest, so its cell refuses.
 */
export const endingNamed = (model: Model, name: EndingName) => {
  const mine = model.endings.flatMap((e, i) => (named(e, name) ? [i] : []));
  const open = mine.find((i) => model.endings[i]?.life._tag !== "Closed");

  return Option.fromUndefinedOr(open ?? mine.at(-1));
};

const delivering = (model: Model, name: EndingName) =>
  Option.fromUndefinedOr(
    model.endings.findIndex((e) => named(e, name) && Life.$is("Delivering")(e.life)),
  ).pipe(Option.filter((i) => i >= 0));

const recordOf = (model: Model, actor: ActorRef) =>
  model.actors.find((a) => sameActor(a.actor, actor))?.record;

type Guard = (model: Model, index: number, ending: Ending) => string;

const byMode: Guard = (model) => model.mode;

const neverSent = (ending: Ending) =>
  Option.isNone(ending.attempt) ||
  (ending.channel === "failure" && FLOW_DECLINES.some((d) => d === ending.reason));

const byRetry: Guard = (_model, _index, ending) => {
  if (!Life.$is("Delivering")(ending.life) || !ending.life.retry) return "first";

  return neverSent(ending) ? "retryNeverSent" : "retry";
};

const byLetGo: Guard = (model, index, ending) => {
  const owed = model.obligations
    .filter(Obligation.$is("AwaitLetGo"))
    .some((o) => o.ending === index);

  return owed || recordOf(model, ending.actor) === "forget" ? "letGo" : "none";
};

const byDisposal: Guard = (_model, _index, ending) => (ending.inDisposal ? "inDisposal" : "live");

const byDisposalNeverSent: Guard = (_model, _index, ending) =>
  ending.inDisposal && neverSent(ending) ? "neverSentInDisposal" : "other";

const guards: Partial<Record<LifeRow, Partial<Record<Life["_tag"], Guard>>>> = {
  Delivered: {
    Owed: byMode,
    Parked: byMode,
    ParkedOpen: byMode,
    Refused: byMode,
    Kept: byMode,
    KeptOpen: byMode,
  },
  InvalidTurn: { Delivering: byRetry },
  RecordedLetGo: {
    Owed: byLetGo,
    Parked: byLetGo,
    ParkedOpen: byLetGo,
    Kept: byLetGo,
    KeptOpen: byLetGo,
  },
  Opens: { Parked: byDisposalNeverSent },
  StepEnds: { Owed: byDisposal },
  Reload: { Owed: byDisposal },
};

const guardOf = (model: Model, row: LifeRow, index: number, ending: Ending) =>
  guards[row]?.[ending.life._tag]?.(model, index, ending) ?? "always";

/**
 * The cell of Table C a move reaches for one ending: its row, the ending's life and the guard's
 * value.
 */
export const lifeCell = (model: Model, row: LifeRow, index: number, ending: Ending) => ({
  row,
  life: ending.life._tag,
  guard: guardOf(model, row, index, ending),
});

/**
 * A guard value Table C has no cell for: a suite defect.
 */
export class MissingLifeCell extends Data.TaggedError("MissingLifeCell")<{
  readonly row: string;
  readonly life: string;
  readonly guard: string;
}> {}

const discharged = (model: Model, row: LifeRow, index: number, guard: string, ending: Ending) => {
  if (row === "RecordedLetGo" && guard === "letGo")
    return {
      ...model,
      obligations: model.obligations.filter(
        (o) => !(o._tag === "AwaitLetGo" && o.ending === index),
      ),
    };

  if (row === "Delivered")
    return {
      ...model,
      obligations: model.obligations.filter(
        (o) => !(o._tag === "AwaitRestore" && Option.contains(ending.attempt, o.attempt)),
      ),
    };

  return model;
};

const lived = (model: Model, index: number, life: Life) => ({
  ...model,
  endings: model.endings.map((e, i) => (i === index ? { ...e, life } : e)),
});

const describe = (row: LifeRow | "Heard", ending: Ending) =>
  `${ending.operation} ${Option.getOrElse(ending.attempt, () => "decline")} (${ending.life._tag}) got ${row}`;

const applyAt = (model: Model, row: LifeRow, index: number, given: Rules) => {
  const ending = model.endings[index];

  if (ending === undefined) return stepOf(model);
  const { life, guard } = lifeCell(model, row, index, ending);
  const fate = given.tableC[row][life][guard];

  if (fate === undefined) throw new MissingLifeCell({ row, life, guard });

  return Fate.$match(fate, {
    Refuse: ({ invariant }) => stepOf(model, [{ invariant, text: describe(row, ending) }]),
    Stay: () => stepOf(discharged(model, row, index, guard, ending)),
    Live: ({ to }) => stepOf(lived(discharged(model, row, index, guard, ending), index, to)),
  });
};

const owedByTurn = (model: Model, index: number) => ({
  ...model,
  obligations: model.obligations.map((o) =>
    Obligation.$is("Await")(o) && Option.contains(o.hearing, index)
      ? Obligation.Await({ attempt: o.attempt, report: o.report, hearing: Option.none() })
      : o,
  ),
});

const heard = (model: Model, index: number, given: Rules) => {
  const ending = model.endings[index];

  if (ending === undefined || !Life.$is("Delivering")(ending.life)) return stepOf(model);
  const fate = given.tableC.Heard.Delivering["always"];

  if (fate === undefined)
    throw new MissingLifeCell({ row: "Heard", life: "Delivering", guard: "always" });

  return Fate.$match(fate, {
    Refuse: ({ invariant }) => stepOf(model, [{ invariant, text: describe("Heard", ending) }]),
    Stay: () => stepOf(model),
    Live: ({ to }) => stepOf(owedByTurn(lived(model, index, to), index)),
  });
};

// RETURN_TYPE: each branch's literal widened to the row union the table is indexed by.
const rowOf = (move: LifeMove): LifeRow | "Heard" =>
  LifeMove.$match(move, {
    Delivered: () => "Delivered" as const,
    Refused: ({ issue }) => issue,
    Heard: () => "Heard" as const,
    Parked: () => "Parked" as const,
    Unparked: () => "Unparked" as const,
    Recorded: ({ letGo }) => (letGo ? ("RecordedLetGo" as const) : ("RecordedOther" as const)),
  });

/**
 * Applies one {@link LifeMove} by Table C to the ending it names. A report that names no ending is
 * refused as WriteLanes I15; `Heard` names the delivering ending, and moves nothing without one.
 */
export const applyLife = (model: Model, move: LifeMove, given: Rules = rules) => {
  const found = LifeMove.$is("Heard")(move)
    ? delivering(model, move.ending)
    : endingNamed(model, move.ending);

  const row = rowOf(move);

  if (Option.isNone(found))
    return row === "Heard"
      ? stepOf(model)
      : stepOf(model, [
          {
            invariant: wl(15),
            text: `${move.ending.operation} ${Option.getOrElse(move.ending.attempt, () => "decline")} got ${row} with no ending`,
          },
        ]);

  return row === "Heard"
    ? heard(model, found.value, given)
    : applyAt(model, row, found.value, given);
};

/**
 * Applies a row every ending sees (`StepEnds`, `Reload`, `DisposalStarts`), or an incarnation's
 * `Opens` to its actor's endings, ending by ending in decision order.
 */
export const applyLives = (
  model: Model,
  row: "StepEnds" | "Reload" | "DisposalStarts" | "Opens",
  actor: Option.Option<ActorRef> = Option.none(),
  given: Rules = rules,
) =>
  model.endings.reduce<LifeStep>(
    ([m, refusals], ending, index) => {
      if (Option.isSome(actor) && !sameActor(ending.actor, actor.value)) return [m, refusals];
      const [next, more] = applyAt(m, row, index, given);

      return stepOf(next, [...refusals, ...more]);
    },
    [model, []],
  );
