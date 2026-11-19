import type { Option } from "effect";
import type { Ending } from "./contract.ts";
import type { Envelope, PayloadOf } from "./definition.ts";
import type { Uncertain } from "./flow.ts";

/**
 * One event of a definition: a constructor of its envelope that checks the payload, and an ending
 * mapping (`E.X`, `E.X.from(f)`).
 */
// FLOW_STATE_ALLOW_UNKNOWN: a bare token with no fields is an ending of any value.
export type EventToken<
  Name extends string,
  P,
  IsUncertain extends boolean = false,
  Id extends string = string,
> = ((
  // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the Plan's public word: a payload-free constructor takes no argument
  ...payload: Record<never, never> extends P ? [payload?: P] : [payload: P]
) => Envelope<Name, P>) &
  // A bare token fills no field, so it takes any value only when its payload has none.
  (Record<never, never> extends P ? Ending<unknown, Id> : Ending<never, Id>) &
  UncertainMark<IsUncertain> & {
    readonly tag: Name;
    readonly from: <V, R extends P>(
      map: (value: V) => R & { readonly [K in Exclude<keyof R, keyof P>]: never },
    ) => MappedEvent<Name, V, P, Id> & UncertainMark<IsUncertain>;
  };

// An uncertain event's token and mapping are marked, so only they fill an `unknown:` ending.
type UncertainMark<IsUncertain extends boolean> = IsUncertain extends true
  ? { readonly "~uncertain": true }
  : Record<never, never>;

/**
 * An event token's mapping (`E.X.from(f)`): an ending's target, or a send's event, whose payload
 * `f` computes from a value of type `V`.
 */
export type MappedEvent<Name extends string, V, P, Id extends string = string> = {
  readonly ending: { readonly event: Name; readonly from: Option.Option<(value: V) => P> };
  // A phantom type: the definition whose event it is.
  readonly "~definition"?: Id;
};

/**
 * A definition's event tokens, by tag.
 */
export type Tokens<Ev, Id extends string = string> = {
  readonly [K in keyof Ev & string]: EventToken<
    K,
    PayloadOf<Ev[K]>,
    Ev[K] extends Uncertain ? true : false,
    Id
  >;
};
