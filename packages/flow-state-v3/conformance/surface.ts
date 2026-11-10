import { Data, type Option } from "effect";
import type { Json } from "./port.ts";

/**
 * A memory field's source in a {@link Source}: `Flow.initial` with a value, a computed initial,
 * or `Flow.input`; each may carry a Schema default (`schemaDefault`).
 */
export type MemoryField = Data.TaggedEnum<{
  Initial: { value: number; schemaDefault: Option.Option<Default> };
  Computed: { compute: (fields: Readonly<Record<string, Json>>) => string };
  Input: {};
}>;

/**
 * Constructors and matchers for {@link MemoryField}.
 */
export const MemoryField = Data.taggedEnum<MemoryField>();

/**
 * A Schema default: a plain value, or an Effect that must be run to give one (`run` is what it
 * runs).
 */
export type Default = Data.TaggedEnum<{
  Value: { value: number };
  Effect: { run: () => number };
}>;

/**
 * Constructors and matchers for {@link Default}.
 */
export const Default = Data.taggedEnum<Default>();

/**
 * One write operation of a {@link Source}: its string input fields, its key, where each ending
 * goes, and its commit.
 */
export type Operation = {
  readonly name: string;
  readonly input: ReadonlyArray<string>;
  readonly key: ReadonlyArray<string>;
  readonly success: string;
  readonly failure: Readonly<Record<string, string>>;
  readonly unknown: string;
  readonly commit: () => void;
};

/**
 * One handler of the machine's root: an optional guard closure, then an optional target state.
 */
export type Handler = {
  readonly guard: Option.Option<() => boolean>;
  readonly target: Option.Option<string>;
};

/**
 * A machine's source, described without any implementation's API: each static adapter builds it
 * with its own public construction calls (`definition`, then `machine`).
 *
 * **Details**
 *
 * - `states` are leaves of the root, `initial` its default child.
 * - `uncertain` lists the internal events declared with `Flow.uncertain`.
 * - `onMachine` runs each time the machine callback runs, before it returns its configuration.
 * - Every closure is the suite's own, so a case counts the calls the surface makes.
 */
export type Source = {
  readonly id: string;
  readonly states: ReadonlyArray<string>;
  readonly initial: string;
  readonly events: ReadonlyArray<string>;
  readonly internalEvents: ReadonlyArray<string>;
  readonly uncertain: ReadonlyArray<string>;
  readonly memory: Readonly<Record<string, MemoryField>>;
  readonly operations: ReadonlyArray<Operation>;
  readonly on: Readonly<Record<string, Handler>>;
  readonly onMachine: () => void;
};

declare const CompiledBrand: unique symbol;

/**
 * A surface's `Compiled`, held by the case and handed back to the same surface, never read.
 */
export type CompiledHandle = { readonly [CompiledBrand]: "CompiledHandle" };

/**
 * Compiled's data view (Compile R16) as a case reads it: the state, event, `Flow.uncertain`
 * event and operation names, the name of every closure it holds, and the whole view, closures as
 * names.
 */
export type DataView = {
  readonly states: ReadonlyArray<string>;
  readonly events: ReadonlyArray<string>;
  readonly uncertain: ReadonlyArray<string>;
  readonly operations: ReadonlyArray<string>;
  readonly slots: ReadonlyArray<string>;
  readonly whole: Json;
};

/**
 * What a construction gave: a `Compiled` with its data view, or one refusal with the code of
 * each violation it lists, in its order.
 */
export type Built = Data.TaggedEnum<{
  Compiled: { compiled: CompiledHandle; view: DataView };
  Refused: { codes: ReadonlyArray<string> };
}>;

/**
 * Constructors and matchers for {@link Built}.
 */
export const Built = Data.taggedEnum<Built>();

/**
 * A malformed `Compiled` (Compile R17) the adapter makes from a well-formed one, in its own
 * form: one Slot replaced by a bare function, an operation's key fields set outside its input,
 * or the events table removed.
 */
export type Tamper = Data.TaggedEnum<{
  Untouched: {};
  BareFunction: {};
  KeyOutsideInput: { operation: string; field: string };
  NoEvents: {};
}>;

/**
 * Constructors and matchers for {@link Tamper}.
 */
export const Tamper = Data.taggedEnum<Tamper>();

/**
 * Whether creating a Runtime over a `Compiled` was refused.
 */
export type Admission = Data.TaggedEnum<{
  Admitted: {};
  Refused: { codes: ReadonlyArray<string> };
}>;

/**
 * Constructors and matchers for {@link Admission}.
 */
export const Admission = Data.taggedEnum<Admission>();

/**
 * One static surface (Conformance R14): the compiler and Runtime creation, read only through
 * their public results.
 *
 * **When to use**
 *
 * A static case's `run` takes one. Each implementation (prototype, production, null) has an
 * adapter that translates these calls into its own public API.
 *
 * **Details**
 *
 * - `construct` builds `source` with `definition` and `machine`.
 * - `admit` creates a Runtime over `compiled` after applying `tamper` and reports whether it was
 *   refused; no actor is started.
 */
export type Surface = {
  readonly construct: (source: Source) => Built;
  readonly admit: (compiled: CompiledHandle, tamper: Tamper) => Admission;
};
