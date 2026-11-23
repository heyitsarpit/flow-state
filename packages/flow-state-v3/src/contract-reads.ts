import type { Schema } from "effect";
import type { Ending, FailureOf, FailureTag } from "./contract.ts";

/**
 * A read's endings mapped onto the declarer's events: its data, by the read's one verb, each of its
 * failure tags with its error, and Flow's `Defect` and `Interrupted`. Every mapper also takes `C`,
 * the call's `MapperContext`.
 *
 * **Details**
 *
 * `success` maps a lookup's answer, so the read is asked with `O.x.lookup`; `value` maps the data a
 * placement shows, so the read is placed with `O.x.subscribe`, and its mapper's context also says
 * whether the value is the placement's `placeholder`. A read declares one of the two.
 */
export type ReadEndings<E, A, Id extends string = string, C = unknown> = (
  | LookupEndings<A, Id, C>
  | PlacedEndings<A, Id, C>
) &
  ReadFailures<E, Id, C>;

/**
 * A looked-up read's data mapping: `success`, the lookup's answer.
 */
export type LookupEndings<A, Id extends string = string, C = unknown> = {
  readonly success: Ending<A, Id, C>;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the other verb's key, never written beside this one
  readonly value?: never;
};

/**
 * A placed read's data mapping: `value`, each change of the data its placement shows.
 */
export type PlacedEndings<A, Id extends string = string, C = unknown> = {
  readonly value: Ending<A, Id, C & PlacedContext>;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the other verb's key, never written beside this one
  readonly success?: never;
};

/**
 * What a `value` mapper reads beside the call's input and key: whether the value is the
 * placement's `placeholder` for a key that has no data yet.
 */
export type PlacedContext = { readonly placeholder: boolean };

/**
 * A read's failure mappings: each of its own failure tags, and Flow's `Defect` and `Interrupted`.
 */
export type ReadFailures<E, Id extends string = string, C = unknown> = {
  readonly failure: { readonly [T in FailureTag<E>]: Ending<FailureOf<E, T>, Id, C> } & {
    // FLOW_STATE_ALLOW_UNKNOWN: Flow's defect and interruption carry no value a mapper reads.
    readonly Defect?: Ending<unknown, Id, C>;
    // FLOW_STATE_ALLOW_UNKNOWN: as above.
    readonly Interrupted?: Ending<unknown, Id, C>;
  };
};

/**
 * How a read is used: asked with `O.x.lookup`, or placed with `O.x.subscribe`.
 */
export type Verb = "lookup" | "subscribe";

/**
 * A read bound with `success`: asked by its states' lookups.
 */
export type LookedUp = {
  // A phantom type: the verb its handle offers.
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- a phantom type no value holds
  readonly "~verb"?: "lookup";
};

/**
 * A read bound with `value`: placed by its states, with data of type `A`.
 */
export type Placed<A> = {
  // A phantom type: the verb its handle offers.
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- a phantom type no value holds
  readonly "~verb"?: "subscribe";
  // A phantom type: the data a placement's `placeholder` gives.
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- a phantom type no value holds
  readonly "~value"?: A;
};

/**
 * Whether a resource is saved on the device: `persist: true` requires `output`, the Schema its
 * saved data is written and read back by, whose type is the lookup's value.
 */
export type PersistOptions<A> =
  | {
      // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: persist defaults to false
      readonly persist?: false;
      // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: an unsaved read may still declare its output
      readonly output?: OutputSchema<A>;
    }
  | { readonly persist: true; readonly output: OutputSchema<A> };

/**
 * A resource's `output`: a Schema of the lookup's value, with any encoded form.
 */
// FLOW_STATE_ALLOW_UNKNOWN: the encoded side is the Schema's own; only its type side is checked.
export type OutputSchema<A> = Schema.Codec<NoInfer<A>, unknown>;

/**
 * A key record with no field beyond `T`'s: each extra field must be `never`.
 */
export type Exactly<K, T> = { readonly [P in Exclude<keyof K, keyof T>]: never };
