import type { Ending } from "./contract.ts";
import type { Branded } from "./made.ts";
import type { Envelope } from "./definition.ts";
import type { PayloadOf } from "./derive.ts";
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
  ...payload: Record<never, never> extends P ? [payload?: NoFieldsOr<P>] : [payload: P]
) => Envelope<Name, P>) &
  // A bare token fills no field, so it takes any value only when its payload has none.
  (Record<never, never> extends P ? Ending<unknown, Id> : Ending<never, Id>) &
  UncertainMark<IsUncertain> &
  Branded<"event"> & {
    readonly tag: Name;
    /**
     * The event's payload, what a handler's `event` is: `typeof Sync.E.SyncRepo.Type`.
     *
     * **Gotchas**
     *
     * - Type only, as a Schema's `Type` is: it holds no value at run time.
     */
    readonly Type: P;
    readonly from: <V, R extends P, C = unknown>(
      map: (value: V, context: C) => R & { readonly [K in Exclude<keyof R, keyof P>]: never },
    ) => MappedEvent<Name, V, P, Id, C> & UncertainMark<IsUncertain>;
  };

// A payload with no fields takes none: `{}` alone skips TypeScript's excess-key check.
type NoFieldsOr<P> = [keyof P] extends [never] ? Readonly<Record<string, never>> : P;

// An uncertain event's token and mapping are marked, so only they fill an `unknown:` ending.
type UncertainMark<IsUncertain extends boolean> = IsUncertain extends true
  ? { readonly "~uncertain": true }
  : Record<never, never>;

/**
 * An event token's mapping (`E.X.from(f)`): an ending's target, or a send's event, whose payload
 * `f` computes from a value of type `V` and the ending's context `C` (its call's input and key).
 */
export type MappedEvent<
  Name extends string,
  V,
  P,
  Id extends string = string,
  C = unknown,
> = Branded<"mapping"> & {
  readonly ending: { readonly event: Name };
  // A phantom type: the value and context its mapper takes and the payload it computes.
  readonly "~maps"?: (value: V, context: C) => P;
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
