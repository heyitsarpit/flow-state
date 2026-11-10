import { Array as Arr, Data, Option } from "effect";
import type { ActorRef } from "../port.ts";

/**
 * Where one reported ending stands: owed (decided, not yet disposed of), parked for an
 * incarnation, refused once (owed one more try in the same step), or kept after a second
 * refusal (one try per boot or adoption).
 *
 * **Details**
 *
 * - `Owed.inDisposal`: decided during the Runtime's disposal, so parked at the next reload.
 * - `Owed.lastTry`: a refusal of this delivery keeps the ending instead of owing a second try.
 * - `Refused.event`: the event its redelivery runs as.
 */
export type Life = Data.TaggedEnum<{
  Owed: { inDisposal: boolean; lastTry: boolean };
  Parked: {};
  Refused: { event: string };
  Kept: {};
}>;

/**
 * Constructors and matchers for {@link Life}.
 */
export const Life = Data.taggedEnum<Life>();

/**
 * One ending of an Attempt (or a decline, with none) and its {@link Life}.
 */
export type Ending = {
  readonly operation: string;
  readonly attempt: Option.Option<string>;
  readonly owner: Option.Option<ActorRef>;
  readonly life: Life;
};

/**
 * The lives that wait on a lane: parked and kept.
 */
export const WAITING: ReadonlyArray<Life["_tag"]> = ["Parked", "Kept"];

/**
 * How a violation names an ending: its operation and Attempt, or a decline of its operation.
 */
export const nameOf = (operation: string, attempt: Option.Option<string>) =>
  Option.match(attempt, {
    onNone: () => `a decline of ${operation}`,
    onSome: (id) => `${operation} ${id}`,
  });

/**
 * Whether an ending is the one an observation names: the same operation and Attempt, or a decline
 * of the same operation.
 */
export const same = (ending: Ending, operation: string, attempt: Option.Option<string>) =>
  ending.operation === operation &&
  Option.match(attempt, {
    onNone: () => Option.isNone(ending.attempt),
    onSome: (id) => Option.contains(ending.attempt, id),
  });

/**
 * The oldest ending an observation names whose life is one of `tags`, with its index.
 */
export const firstIn = (
  endings: ReadonlyArray<Ending>,
  operation: string,
  attempt: Option.Option<string>,
  tags: ReadonlyArray<Life["_tag"]>,
) =>
  Arr.findFirstWithIndex(endings, (x) => same(x, operation, attempt) && tags.includes(x.life._tag));

/**
 * The endings without the oldest one {@link firstIn} finds, and that ending.
 */
export const taken = (
  endings: ReadonlyArray<Ending>,
  operation: string,
  attempt: Option.Option<string>,
  tags: ReadonlyArray<Life["_tag"]>,
) =>
  Option.map(
    firstIn(endings, operation, attempt, tags),
    ([ending, at]) => [endings.toSpliced(at, 1), ending] as const,
  );

/**
 * The endings with the one at `at` given a new life.
 */
export const relived = (endings: ReadonlyArray<Ending>, at: number, life: Life) =>
  endings.map((x, i) => (i === at ? { ...x, life } : x));

/**
 * A delivered ending whose turn an `InvalidTurn` refused: refused once, owing a second try, or
 * kept when this was its last try.
 */
export const refusedOnce = (ending: Ending, event: string) =>
  Life.$is("Owed")(ending.life) && !ending.life.lastTry
    ? { ...ending, life: Life.Refused({ event }) }
    : { ...ending, life: Life.Kept() };

type Sorted = {
  readonly left: number;
  readonly endings: ReadonlyArray<Ending>;
  readonly unredelivered: ReadonlyArray<Ending>;
};

/**
 * At a step's end, the refused endings that a second refusal of that step accounts for become
 * kept, oldest first; the rest were never delivered once more.
 */
export const keptAfterRefusals = (endings: ReadonlyArray<Ending>, refusals: number) => {
  const start: Sorted = { left: refusals, endings: [], unredelivered: [] };

  return endings.reduce<Sorted>((acc, x) => {
    if (!Life.$is("Refused")(x.life)) return { ...acc, endings: [...acc.endings, x] };

    return acc.left > 0
      ? { ...acc, left: acc.left - 1, endings: [...acc.endings, { ...x, life: Life.Kept() }] }
      : { ...acc, unredelivered: [...acc.unredelivered, x] };
  }, start);
};

/**
 * The endings a reload keeps: one decided during the Runtime's disposal is parked, parked and
 * kept ones stay, and every other owed one is forgotten (the new boot decides it again).
 */
export const acrossReload = (endings: ReadonlyArray<Ending>) =>
  endings.flatMap((x) =>
    Life.$match(x.life, {
      Owed: ({ inDisposal }) => (inDisposal ? [{ ...x, life: Life.Parked() }] : []),
      Parked: () => [x],
      Refused: () => [],
      Kept: () => [x],
    }),
  );
