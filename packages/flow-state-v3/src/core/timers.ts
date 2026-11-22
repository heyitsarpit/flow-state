import { type Brand, Data, type Option } from "effect";
import type { Series, Values } from "./compiled.ts";
import type { IssueCode } from "./vocabulary.ts";
import type { ArmingId, TimerId } from "./world.ts";

// A schedule's timers as the one decision builds them: each check's last outcome, the arming and
// its run, and the views kept beside them.

/**
 * A check's or a firing's failure: the issue code and the callback slot that failed.
 */
export type Failure = { readonly code: IssueCode; readonly slot: string };

/**
 * A check's last outcome when it keeps no value: clean, or failed.
 */
export type Outcome = Data.TaggedEnum<{ Clean: {}; Failed: { failure: Failure } }>;

/**
 * Constructors and matchers for {@link Outcome}.
 */
export const Outcome = Data.taggedEnum<Outcome>();

/**
 * A check's last outcome when it keeps a value: the value it read, or its failure with the last
 * value it read, which every decision that needs it uses.
 */
export type Checked<A> =
  | { readonly _tag: "Read"; readonly value: A }
  | { readonly _tag: "Failed"; readonly failure: Failure; readonly last: A };

/**
 * The value a check stands for: the one it read, or the last one before its failure.
 */
export const valueOf = <A>(checked: Checked<A>) =>
  checked._tag === "Read" ? checked.value : checked.last;

/**
 * A `restartOn` baseline: none yet, or the selection's text by its declared codec.
 */
export type Selection = Data.TaggedEnum<{ Unselected: {}; Selected: { text: string } }>;

/**
 * Constructors and matchers for {@link Selection}.
 */
export const Selection = Data.taggedEnum<Selection>();

/**
 * Where a run is: due at `dueAt`, or held by its timer's pause reasons with `left` milliseconds to
 * go. A host alarm is a view of a due run, kept beside the timers by arming id.
 */
export type Timing = Data.TaggedEnum<{ Due: { dueAt: number }; Held: { left: number } }>;

/**
 * Constructors and matchers for {@link Timing}.
 */
export const Timing = Data.taggedEnum<Timing>();

/**
 * How a run takes its next step: a Duration fires once; an Effect Schedule steps with its last
 * step's output; a series whose delay threw at a wake is broken and fires once at its deadline.
 */
export type Cursor = Data.TaggedEnum<{
  Once: {};
  // FLOW_STATE_ALLOW_UNKNOWN: an Effect Schedule step's output, whatever its type.
  Stepping: { series: Series; output: unknown };
  Broken: { failure: Failure };
}>;

/**
 * Constructors and matchers for {@link Cursor}.
 */
export const Cursor = Data.taggedEnum<Cursor>();

/**
 * A timer's live arming: its arming id (a firing of another arming is dropped), when it was
 * armed, how many times it has fired since, how it steps, and its timing.
 */
export type Run = {
  readonly arming: ArmingId;
  readonly armedAt: number;
  readonly attempt: number;
  readonly cursor: Cursor;
  readonly timing: Timing;
};

/**
 * A timer's arming: idle, refused with the failure of its last start, or armed with its run.
 */
export type Arming = Data.TaggedEnum<{
  Idle: {};
  Refused: { failure: Failure };
  Armed: { run: Run };
}>;

/**
 * Constructors and matchers for {@link Arming}.
 */
export const Arming = Data.taggedEnum<Arming>();

/**
 * A keyed schedule's key: the record `keys` returned and its text by the declared key codec, by
 * which it is told apart and ordered.
 */
export type TimerKey = { readonly text: string; readonly value: Values };

/**
 * The mark of a timer or a schedule's state built by the one function that decides it.
 */
export type Decided = Brand.Brand<"flow-state/Decided">;

/**
 * One timer of a schedule in a scope, a keyed schedule's per key: the last outcome of each of
 * its checks (its `restartOn` selection, its pause reasons in declaration order, its arming and
 * its last firing). Its issues are read from these fields and stored nowhere.
 */
export type Tracked = Decided & {
  readonly name: string;
  readonly key: Option.Option<TimerKey>;
  readonly selection: Checked<Selection>;
  readonly reasons: Checked<ReadonlyArray<string>>;
  readonly arming: Arming;
  readonly firing: Outcome;
};

/**
 * One schedule's whole state in a scope: an unkeyed schedule's one timer, or a keyed one's last
 * `keys` outcome and its timers by key text, in key-text order.
 */
export type Scheduled = Decided &
  (
    | { readonly _tag: "Single"; readonly timer: Tracked }
    | {
        readonly _tag: "Keyed";
        readonly keys: Outcome;
        readonly timers: ReadonlyMap<string, Tracked>;
      }
  );

/**
 * The timers of a schedule's state, in key-text order.
 */
export const timersIn = (scheduled: Scheduled) =>
  scheduled._tag === "Single" ? [scheduled.timer] : [...scheduled.timers.values()];

/**
 * A host alarm standing for a due run: its host timer and the deadline it was set for.
 */
export type Alarm = { readonly timer: TimerId; readonly dueAt: number };
