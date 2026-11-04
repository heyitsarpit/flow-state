// Run: nub run demo. Requirements, invariants, and evidence: ./README.md.
// Flow: host -> submission -> booking -> admission, pricing, atomic reservation.
// Concern = responsibility; Boundary = its implementation through a contract.
// Protocol = data with agreed meaning; Established fact = what construction or validation proves.
// Composition level = depth in the call hierarchy, not a folder or required class.
// Requirement = observable behavior; Invariant = a property at named observation points.
// Owner = authority preserving an invariant; Publication = one visible, complete state change.
// Enforcement = the mechanism; Test obligation = a public-boundary check of the guarantee.
// One Layer build owns capacity and replay evidence; this is not a durable ledger.
import { NodeRuntime } from "@effect/platform-node";
import {
  Context,
  Data,
  Effect,
  HashMap,
  Layer,
  Match,
  Option,
  Ref,
  Result,
  Schema,
  Tuple,
} from "effect";

/*****************************************************************************/
/* Level 3: Admission boundary and wire protocols */
/*****************************************************************************/

// Protocol: BookingRequest carries admitted field types, bounds, and normalized absence.
const BookingRequest = Schema.Struct({
  requestId: Schema.NonEmptyString.check(Schema.isMaxLength(80)),
  customerId: Schema.NonEmptyString.check(Schema.isMaxLength(80)),
  seats: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
  budgetCents: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 })),
  note: Schema.OptionFromOptionalNullOr(Schema.String.check(Schema.isMaxLength(200))),
});

type BookingRequest = typeof BookingRequest.Type;

// Protocol: BookingReceipt denotes a committed reservation, not merely an affordable request.
// The ledger establishes commitment; this Schema owns the receipt representation.
const BookingReceipt = Schema.Struct({
  requestId: Schema.NonEmptyString,
  customerId: Schema.NonEmptyString,
  seats: Schema.Int,
  totalCents: Schema.Int,
});

type BookingReceipt = typeof BookingReceipt.Type;

// fromJsonString composes syntax and payload admission; one parser reports either failure.
// Reject excess fields deliberately. Keep the reusable parser outside the per-request workflow.
const decodeBooking = Schema.decodeEffect(Schema.fromJsonString(BookingRequest), {
  onExcessProperty: "error",
});

export const encodeReceipt = Schema.encodeEffect(Schema.fromJsonString(BookingReceipt));

// RETRY IDENTITY: compare admitted domain values, including normalized notes and budget.
// toType removes wire transformations; toEquivalence derives comparison from the same contract.
// The receipt alone lacks facts needed to detect changed requests, so retain the admitted request.
const sameRequest = Schema.toEquivalence(Schema.toType(BookingRequest));

export class InvalidBooking extends Data.TaggedError("InvalidBooking")<{
  cause: Schema.SchemaError;
}> {}

export class BudgetExceeded extends Data.TaggedError("BudgetExceeded")<{
  requiredCents: number;
  budgetCents: number;
}> {}

export class SoldOut extends Data.TaggedError("SoldOut")<{
  requested: number;
  remaining: number;
}> {}

export class RequestConflict extends Data.TaggedError("RequestConflict")<{
  requestId: string;
}> {}

export class LedgerFull extends Data.TaggedError("LedgerFull")<{
  limit: number;
}> {}

/*****************************************************************************/
/* Level 3: Pricing boundary */
/*****************************************************************************/

// Concern: pure pricing consumes admitted facts without owning state or requiring a Service.
// Protocol: BookingQuote carries the established fact that this request can afford its price.
// Availability is a changing-state fact, checked by the Owner at use.
// Only the Service constructs quotes after admission and pricing; Data itself does not validate.
class BookingQuote extends Data.Class<{
  request: BookingRequest;
  totalCents: number;
}> {}

// Carry established facts: admission proved positive, bounded seats; pricing does not check them again.
// Affordability is a new fact established here, not a repetition of field validation.
const quoteBooking = (request: BookingRequest) => {
  const totalCents = request.seats * 12_500;

  if (totalCents > request.budgetCents) {
    return Result.fail(
      new BudgetExceeded({ requiredCents: totalCents, budgetCents: request.budgetCents }),
    );
  }

  return Result.succeed(new BookingQuote({ request, totalCents }));
};

type ReservationFailure = SoldOut | RequestConflict | LedgerFull;

type BookingFailure = InvalidBooking | BudgetExceeded | ReservationFailure;

/*****************************************************************************/
/* Level 3: Reservation decision */
/*****************************************************************************/

// Concern: resolve identity and capacity together; only the ledger invokes this transition.
type LedgerState = {
  remaining: number;
  bookings: HashMap.HashMap<string, { request: BookingRequest; receipt: BookingReceipt }>;
};

// A pure transition keeps reservation policy readable. Only the owner calls it, inside Ref.modify.
// The private quote carries admitted fields and affordability; reservation relies on both.
// Identity and current capacity require checks here because admission cannot establish them.
const decideReservation = (current: LedgerState, quote: BookingQuote) => {
  const previous = HashMap.get(current.bookings, quote.request.requestId);

  // Replays precede capacity checks: a full ledger must still honor an existing receipt.
  // Option distinguishes a missing identity; it does not confuse absence with lookup failure.
  if (Option.isSome(previous)) {
    const result = sameRequest(previous.value.request, quote.request)
      ? Result.succeed({ ...previous.value.receipt })
      : Result.fail(new RequestConflict({ requestId: quote.request.requestId }));

    return Tuple.make(result, current);
  }

  if (HashMap.size(current.bookings) >= 3) {
    return Tuple.make(Result.fail(new LedgerFull({ limit: 3 })), current);
  }

  // RECHECK AT USE: only the atomic owner can establish current seat availability.
  if (quote.request.seats > current.remaining) {
    return Tuple.make(
      Result.fail(
        new SoldOut({
          requested: quote.request.seats,
          remaining: current.remaining,
        }),
      ),
      current,
    );
  }

  const receipt = BookingReceipt.make({
    requestId: quote.request.requestId,
    customerId: quote.request.customerId,
    seats: quote.request.seats,
    totalCents: quote.totalCents,
  });

  // PUBLICATION: observers cannot see a seat debit without its retry receipt, or vice versa.
  // Tuple expresses Ref.modify's result/next-state protocol; all refusal paths keep current.
  // No external effects belong here: local atomicity cannot make payment or email atomic.
  return Tuple.make(Result.succeed({ ...receipt }), {
    remaining: current.remaining - receipt.seats,
    bookings: HashMap.set(current.bookings, receipt.requestId, { request: quote.request, receipt }),
  });
};

/*****************************************************************************/
/* Level 2: Booking workflow and state owner */
/*****************************************************************************/

// Composition site: book orders admission -> pricing -> reservation.
// Contract: JSON -> BookingReceipt; fails BookingFailure; state belongs to this Layer build.
// Owner: BookingLedger controls capacity and committed identities during one Layer build.
// Invariant B-I2: remaining + committed seat quantities = 5 at every public Observation.
// Enforcement: one Ref.modify publishes the receipt and matching debit together.
// Rejection and replay preserve state; detached receipts protect retained facts from caller mutation.
export class BookingLedger extends Context.Service<
  BookingLedger,
  {
    book: (json: string) => Effect.Effect<BookingReceipt, BookingFailure>;
    availability: Effect.Effect<{ remaining: number; bookings: number }>;
  }
>()("lint-bomb/examples/booking/BookingLedger") {
  static layer = Layer.effect(
    BookingLedger,
    Effect.gen(function* () {
      const state = yield* Ref.make<LedgerState>({ remaining: 5, bookings: HashMap.empty() });

      const book = Effect.fn("BookingLedger.book")(function* (json: string) {
        const request = yield* decodeBooking(json).pipe(
          Effect.mapError((cause) => new InvalidBooking({ cause })),
        );

        const quote = yield* Effect.fromResult(quoteBooking(request));

        return yield* Ref.modify<LedgerState, Result.Result<BookingReceipt, ReservationFailure>>(
          state,
          (current) => decideReservation(current, quote),
        ).pipe(Effect.flatMap(Effect.fromResult));
      });

      // Publish derived observations, not the Ref or registry; callers cannot perform half-updates.
      const availability = Ref.get(state).pipe(
        Effect.map(({ remaining, bookings }) => ({
          remaining,
          bookings: HashMap.size(bookings),
        })),
      );

      return BookingLedger.of({ book, availability });
    }),
  );
}

// Boundary contract: JSON -> BookingReceipt; fails BookingFailure; needs BookingLedger.
// The Service composes admission, pricing, and reservation; callers need not coordinate these stages.
// Quotes stay private; cancellation may hide a committed result but cannot split publication.
export const bookWorkshop = (json: string) => BookingLedger.use((ledger) => ledger.book(json));

/*****************************************************************************/
/* Level 1: Submission and presentation */
/*****************************************************************************/

// Concern: translate domain outcomes for the host; keep the BookingReceipt protocol unchanged.
// BookingOutcome adds presentation meaning, so it warrants its own closed variants.
type BookingOutcome = Data.TaggedEnum<{
  Confirmed: { receipt: BookingReceipt };
  Rejected: { message: string };
}>;

const BookingOutcome = Data.taggedEnum<BookingOutcome>();

// Error formatting is pure and exhaustive; it needs no Effect wrappers or recovery machinery.
const rejectionMessage = Match.typeTags<InvalidBooking | BudgetExceeded | ReservationFailure>()({
  InvalidBooking: ({ cause }) => cause.message,
  BudgetExceeded: ({ requiredCents }) => `Budget must cover ${requiredCents} cents`,
  SoldOut: ({ remaining }) => `Only ${remaining} seats remain`,
  RequestConflict: ({ requestId }) =>
    `Request ${requestId} was already used for different booking details`,
  LedgerFull: () => "Booking ledger is full",
});

// At the host boundary, match converts expected failures to values; defects/interruption propagate.
const submitBooking = (json: string) =>
  bookWorkshop(json).pipe(
    Effect.match({
      onSuccess: (receipt) => BookingOutcome.Confirmed({ receipt }),
      onFailure: (error) => BookingOutcome.Rejected({ message: rejectionMessage(error) }),
    }),
  );

// The host encodes successful receipts; expected rejections become human-readable messages here.
const displayOutcome = BookingOutcome.$match({
  Confirmed: ({ receipt }) =>
    encodeReceipt(receipt).pipe(Effect.map((json) => `Confirmed: ${json}`)),
  Rejected: ({ message }) => Effect.succeed(`Rejected: ${message}`),
});

/*****************************************************************************/
/* Level 0: Host composition */
/*****************************************************************************/

// Composition site: choose batch concurrency, retries, presentation, and one shared ledger Layer.
// Lower boundaries own reservation guarantees; this caller owns how the batch is run.
export const runDemo = Effect.gen(function* () {
  const firstRequest = `{"requestId":"booking-1","customerId":"alice","seats":3,"budgetCents":40000}`;
  const competingRequest = `{"requestId":"booking-2","customerId":"bob","seats":3,"budgetCents":40000}`;

  // CONCURRENCY POLICY: forEach bounds this batch to two calls and preserves input result order.
  // It does not enforce seat availability; the service does. Either contender may win.
  const outcomes = yield* Effect.forEach([firstRequest, competingRequest], submitBooking, {
    concurrency: 2,
  });

  for (const outcome of outcomes) {
    const message = yield* displayOutcome(outcome);

    yield* Effect.logInfo(message);
  }

  // Each contender retries the same request; only the winner has a retained receipt to replay.
  for (const request of [firstRequest, competingRequest]) {
    const outcome = yield* submitBooking(request);
    const message = yield* displayOutcome(outcome);

    yield* Effect.logInfo(`Retry: ${message}`);
  }

  const overBudget = yield* submitBooking(
    `{"requestId":"booking-3","customerId":"carol","seats":1,"budgetCents":100}`,
  );

  const ledger = yield* BookingLedger;

  yield* Effect.logInfo(yield* displayOutcome(overBudget));
  yield* Effect.logInfo(yield* ledger.availability);
}).pipe(Effect.provide(BookingLedger.layer));

// HOST OWNERSHIP: NodeRuntime runs the assembled Effect at the process edge, never inside a service.
// Importing this file for behavior checks does not run the program.
if (import.meta.main) {
  NodeRuntime.runMain(runDemo);
}
