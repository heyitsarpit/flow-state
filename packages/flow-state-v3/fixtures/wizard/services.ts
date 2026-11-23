import { Context, type Effect, Schema } from "effect";

/**
 * No answer came back from the booking service.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * Another customer took the slot first.
 */
export class Taken extends Schema.TaggedError<Taken>()("Taken", {}) {}

/**
 * The postcode is not one the service covers.
 */
export class Uncovered extends Schema.TaggedError<Uncovered>()("Uncovered", {}) {}

/**
 * A postcode as the booking service takes it: the outward and inward codes, upper case, one space.
 */
export const Postcode = Schema.String.check(Schema.isPattern(/^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/u));

/**
 * The booking service: the area a postcode is in, the inspection slots of a day in an area, and a
 * hold on one slot, each hold carrying its idempotency key.
 */
export class BookingApi extends Context.Service<
  BookingApi,
  {
    readonly area: (input: {
      readonly postcode: string;
    }) => Effect.Effect<{ readonly area: string }, Uncovered | NoResponse>;
    readonly slots: (input: {
      readonly area: string;
      readonly day: string;
    }) => Effect.Effect<{ readonly slots: ReadonlyArray<string> }, NoResponse>;
    readonly hold: (
      input: { readonly area: string; readonly slot: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<{ readonly heldUntil: number }, Taken | NoResponse>;
  }
>()("flow-state-v3/fixtures/wizard/BookingApi") {}
