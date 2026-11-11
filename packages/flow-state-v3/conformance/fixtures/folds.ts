import type { Option } from "effect";
import type { Json } from "../port.ts";
import type { Answer } from "../world/network.ts";

/**
 * Named values the suite computes from a value it made itself (a driven event's payload, an answer
 * its server gave), so the model never reads a payload (Conformance R19).
 */
export type Labels = Readonly<Record<string, Json>>;

/**
 * The memory fields a fixture folds, by name: only those a guard, a key or a delay reads.
 */
export type Folded = Readonly<Record<string, Json>>;

/**
 * A fixture's reference folds (T45 design, decision 1): the memory its guards, keys and delays
 * read, written alternative by alternative from the fixture's source.
 *
 * **Details**
 *
 * - `driven`: per event, the labels of a payload the suite sends; `answers`: per operation, the
 *   labels of an answer the suite's server gives.
 * - `updates`: per alternative place (`states.IDLE.on.Start[0]`, `on.Leave[0]`), the fields its
 *   `updateMemory` sets, from the labels of the fact that caused the turn and the fields before.
 * - `guards`: per alternative place, its guard, where the suite computes it: `None` when a label
 *   it reads is missing. Any other guard stays opaque (both outcomes allowed).
 * - `keys`: per operation, the key its members take, from the labels of the fact that caused the
 *   turn and the fields after its update.
 * - `delays`: per schedule id, the delay in ms its memory computes.
 *
 * **Gotchas**
 *
 * - A fold reads labels and earlier fields only: never the runtime's memory, a report, or a
 *   payload through a codec. Each field stays only while a model mutation kills it (T39).
 */
export type Folds = {
  readonly initial: Folded;
  readonly driven: Readonly<Record<string, (payload: Json) => Labels>>;
  readonly answers: Readonly<Record<string, (answer: Answer) => Labels>>;
  readonly updates: Readonly<Record<string, (labels: Labels, fields: Folded) => Folded>>;
  readonly guards: Readonly<
    Record<string, (labels: Labels, fields: Folded) => Option.Option<boolean>>
  >;
  readonly keys: Readonly<Record<string, (labels: Labels, fields: Folded) => Json>>;
  readonly delays: Readonly<Record<string, (fields: Folded) => number>>;
};

/**
 * The folds of a fixture whose guards, keys and delays read no memory.
 */
export const noFolds: Folds = {
  initial: {},
  driven: {},
  answers: {},
  updates: {},
  guards: {},
  keys: {},
  delays: {},
};
