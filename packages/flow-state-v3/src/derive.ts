import type { Schema } from "effect";
import type { Fields } from "./contract.ts";
import type { Declaration } from "./declaration-of.ts";
import type {
  AnyDefinition,
  ChildrenOf,
  ContextOf,
  Envelope,
  LeavesOf,
  NamesOf,
  PathsOf,
} from "./definition.ts";
import type { Input, Plain, Private, Uncertain } from "./flow.ts";
import type { Branded, Kind } from "./made.ts";
import type { Change, ContextTokens, On, StateConfig, StateToken } from "./tokens.ts";

type FieldsOf<X> = X extends Uncertain<infer F> ? F : X extends Fields ? X : never;

/**
 * The payload an event declares: the decoded record of its fields.
 */
export type PayloadOf<X> = Schema.Struct<FieldsOf<X>>["Type"];

type Unwrapped<F> = F extends Private<infer G> ? G : F;

type TypeOf<F> =
  Unwrapped<F> extends Branded<Kind> & { readonly schema: infer S extends Plain }
    ? S["Type"]
    : Unwrapped<F> extends Plain
      ? Unwrapped<F>["Type"]
      : never;

type OptionalKeys<M> = {
  readonly [K in keyof M]: Unwrapped<M[K]> extends Branded<Kind> ? never : K;
}[keyof M];

type InputKeys<M> = { readonly [K in keyof M]: M[K] extends Input ? K : never }[keyof M];

type Flat<T> = { readonly [K in keyof T]: T[K] };

/**
 * A definition's memory: each field's decoded value; an optional key may be absent.
 */
export type MemoryOf<M> = Flat<
  { readonly [K in Exclude<keyof M, OptionalKeys<M>>]: TypeOf<M[K]> } & {
    readonly [K in OptionalKeys<M>]?: TypeOf<M[K]>;
  }
>;

type PrivateKeys<M> = { readonly [K in keyof M]: M[K] extends Private ? K : never }[keyof M];

/**
 * The memory an outside snapshot shows: every field but the `Flow.private` ones.
 */
export type OutsideOf<M> = Omit<MemoryOf<M>, PrivateKeys<M>>;

/**
 * The memory a handler may write: every field but the input fields, which name the actor.
 */
export type WritableOf<M> = Omit<MemoryOf<M>, InputKeys<M>>;

/**
 * What a creator supplies: the definition's `Flow.input` fields.
 */
export type InputOf<M> = Flat<{ readonly [K in InputKeys<M>]: TypeOf<M[K]> }>;

/**
 * A definition's declaration, as its type states it: a phantom key no value holds at run time.
 * Flow keeps the declaration itself off the definition's face.
 */
export declare const Declared: unique symbol;

/**
 * The parts of a definition every derived type reads: one field per declared part, and the
 * types computed from them.
 */
export type Parts<D extends AnyDefinition> = D extends {
  readonly [Declared]: infer X extends Declaration;
  readonly id: infer Id extends string;
}
  ? PartsOf<X, Id>
  : never;

type PartsOf<X extends Declaration, Id extends string> = {
  readonly Id: Id;
  readonly Tree: X["states"];
  readonly S: PathsOf<X["states"]>;
  readonly Leaves: LeavesOf<X["states"]>;
  readonly Public: X["events"];
  readonly Events: X["events"] & X["internalEvents"];
  readonly Memory: MemoryOf<X["memory"]>;
  readonly Writable: WritableOf<X["memory"]>;
  readonly Outside: OutsideOf<X["memory"]>;
  readonly Input: InputOf<X["memory"]>;
  readonly Slots: X["context"];
  readonly Context: Partial<ContextOf<X["context"]>>;
  readonly Operations: X["operations"];
  readonly Schedules: X["schedules"];
};

/**
 * A public event of an actor's definition, as `send` takes it.
 */
export type EventOf<D extends AnyDefinition> = {
  readonly [K in keyof Parts<D>["Public"] & string]: Envelope<K, PayloadOf<Parts<D>["Public"][K]>>;
}[keyof Parts<D>["Public"] & string];

type Handlers<D extends AnyDefinition> = On<
  Parts<D>["Memory"],
  Parts<D>["Events"],
  Parts<D>["S"],
  Parts<D>["Writable"],
  Parts<D>["Id"],
  Parts<D>["Leaves"],
  Parts<D>["Context"]
>;

type LeafBody<D extends AnyDefinition> = StateConfig<
  Parts<D>["Memory"],
  Parts<D>["Events"],
  Parts<D>["S"],
  Parts<D>["Writable"],
  Parts<D>["Id"],
  Parts<D>["Leaves"],
  Parts<D>["Context"],
  Parts<D>["Schedules"]
>;

type StatesBody<D extends AnyDefinition, L, P extends string> = {
  readonly [N in NamesOf<L>]?: NodeBody<D, ChildrenOf<L, N>, `${P}${N}.`>;
};

type NodeBody<D extends AnyDefinition, C, P extends string> = [C] extends [never]
  ? LeafBody<D>
  : CompoundBody<D, C, P>;

type CompoundBody<D extends AnyDefinition, L, P extends string> = {
  readonly on?: Handlers<D>;
  readonly schedules?: LeafBody<D>["schedules"];
  readonly default: StateToken<`${P}${NamesOf<L>}`, Parts<D>["Id"]>;
  readonly states?: StatesBody<D, L, P>;
};

/**
 * What a machine body returns: the root's default child, handlers and reactions, and each state's
 * body, mirroring the definition's tree: a compound has a default direct child and its children's
 * bodies; a leaf has neither. `onContext` holds the `C.slot.change` reactions, live in every state.
 */
export type MachineBody<D extends AnyDefinition> = {
  readonly on?: Handlers<D>;
  readonly onContext?: ReadonlyArray<Change>;
  readonly default: StateToken<`${NamesOf<Parts<D>["Tree"]>}`, Parts<D>["Id"]>;
  readonly states?: StatesBody<D, Parts<D>["Tree"], "">;
};

/**
 * The tokens a machine body receives: the definition's `S`, `E` and `O`, and `C`, its context
 * slots' change reactions.
 *
 * **When to use**
 *
 * To type a helper written apart from its `machine(definition, body)` call that takes the body's
 * tokens, such as one that builds an action several handlers share.
 *
 * ```ts
 * const releaseHold = ({ O }: Flow.BodyTokens<typeof Pay>) =>
 *   O.void.commit(({ memory }) => ({ intentId: memory.intentId }))
 * ```
 */
export type BodyTokens<D extends AnyDefinition> = {
  readonly S: D["S"];
  readonly E: D["E"];
  readonly O: D["O"];
  readonly C: ContextTokens<Parts<D>["Slots"], Parts<D>["Memory"], Parts<D>["Id"]>;
};
